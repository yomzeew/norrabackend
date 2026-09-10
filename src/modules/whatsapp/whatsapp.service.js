const crypto = require('crypto');
const prisma = require('../../lib/prisma');
const env = require('../../config/env');
const logger = require('../../lib/logger');
const { encrypt, decrypt } = require('../../utils/crypto');
const { graphRequest } = require('./graph.client');
const { tryConsume } = require('./rateLimiter');
const { BadRequestError, NotFoundError, AppError } = require('../../utils/errors');

function generatePin() {
  return String(crypto.randomInt(100000, 1000000));
}

// Exchanges the Embedded Signup authorization code, discovers the connected
// WABA and phone number, registers the number for Cloud API, stores the
// encrypted token, and subscribes the WABA to our webhook.
async function connectAccount({ businessId, code }) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw new NotFoundError('Business not found');

  const tokenData = await graphRequest('/oauth/access_token', {
    query: {
      client_id: env.META_APP_ID,
      client_secret: env.META_APP_SECRET,
      code,
    },
  });

  const accessToken = tokenData.access_token;
  if (!accessToken) throw new BadRequestError('Token exchange returned no access token');

  // debug_token tells us which WABA the customer granted access to.
  const debugData = await graphRequest('/debug_token', {
    query: {
      input_token: accessToken,
      access_token: `${env.META_APP_ID}|${env.META_APP_SECRET}`,
    },
  });

  const wabaId = (debugData.data?.granular_scopes || []).find(
    (s) => s.scope === 'whatsapp_business_management'
  )?.target_ids?.[0];

  if (!wabaId) throw new BadRequestError('No WhatsApp Business Account on this token');

  const phoneData = await graphRequest(`/${wabaId}/phone_numbers`, { accessToken });
  const phoneNumber = phoneData.data?.[0];
  if (!phoneNumber) throw new BadRequestError('No phone number registered on this WABA');

  // Required before the number can send or receive via Cloud API.
  await graphRequest(`/${phoneNumber.id}/register`, {
    method: 'POST',
    accessToken,
    body: { messaging_product: 'whatsapp', pin: generatePin() },
  });

  const webhookVerifyToken = crypto.randomBytes(24).toString('hex');
  const ciphertext = encrypt(accessToken);

  const account = await prisma.whatsappAccount.upsert({
    where: { phoneNumberId: phoneNumber.id },
    create: {
      businessId,
      wabaId,
      phoneNumberId: phoneNumber.id,
      displayPhoneNumber: phoneNumber.display_phone_number,
      accessTokenCiphertext: ciphertext,
      webhookVerifyToken,
      tokenStatus: 'active',
      connectedAt: new Date(),
    },
    update: {
      wabaId,
      displayPhoneNumber: phoneNumber.display_phone_number,
      accessTokenCiphertext: ciphertext,
      webhookVerifyToken,
      tokenStatus: 'active',
      connectedAt: new Date(),
    },
  });

  await graphRequest(`/${wabaId}/subscribed_apps`, { method: 'POST', accessToken });

  logger.info({ businessId, wabaId, phoneNumberId: phoneNumber.id }, 'WhatsApp account connected');

  return {
    connected: true,
    phoneNumber: account.displayPhoneNumber,
  };
}

async function getAccessToken(account) {
  return decrypt(account.accessTokenCiphertext);
}

async function sendMessage({ account, to, text }) {
  const allowed = await tryConsume(account.phoneNumberId);
  if (!allowed) {
    // Signal the worker to retry with backoff rather than dropping the reply.
    throw new AppError('Per-number send rate exceeded', 429, 'rate_limited');
  }

  const accessToken = await getAccessToken(account);

  return graphRequest(`/${account.phoneNumberId}/messages`, {
    method: 'POST',
    accessToken,
    body: {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    },
  });
}

// Proactively detect revoked/expired tokens instead of finding out mid-send.
async function refreshTokenStatus(account) {
  const accessToken = await getAccessToken(account);
  try {
    const debugData = await graphRequest('/debug_token', {
      query: {
        input_token: accessToken,
        access_token: `${env.META_APP_ID}|${env.META_APP_SECRET}`,
      },
      retries: 1,
    });

    const isValid = debugData.data?.is_valid === true;
    const status = isValid ? 'active' : 'expired';

    await prisma.whatsappAccount.update({
      where: { id: account.id },
      data: { tokenStatus: status, lastVerifiedAt: new Date() },
    });

    return status;
  } catch (err) {
    logger.warn({ err, accountId: account.id }, 'Token status check failed');
    return null;
  }
}

module.exports = { connectAccount, sendMessage, getAccessToken, refreshTokenStatus };
