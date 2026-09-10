const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { encrypt } = require('../utils/crypto');

const router = express.Router();

const {
  META_APP_ID,
  META_APP_SECRET,
  META_GRAPH_VERSION = 'v21.0',
} = process.env;

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.post('/api/whatsapp/connect', async (req, res) => {
  const { businessId, code } = req.body;

  if (!businessId || !code) {
    return res.status(400).json({ error: 'businessId and code are required' });
  }

  try {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: 'Business not found' });

    // 1. Exchange the authorization code for an access token
    const tokenResp = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?` +
        new URLSearchParams({
          client_id: META_APP_ID,
          client_secret: META_APP_SECRET,
          code,
        })
    );
    const tokenData = await tokenResp.json();

    if (tokenData.error) {
      console.error('Token exchange failed:', tokenData.error);
      return res.status(400).json({ error: 'Token exchange failed' });
    }

    const accessToken = tokenData.access_token;

    // 2. Discover which WABA this token now has access to
    const debugResp = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/debug_token?` +
        new URLSearchParams({
          input_token: accessToken,
          access_token: `${META_APP_ID}|${META_APP_SECRET}`,
        })
    );
    const debugData = await debugResp.json();
    const granularScopes = debugData.data?.granular_scopes || [];
    const wabaScope = granularScopes.find((s) => s.scope === 'whatsapp_business_management');
    const wabaId = wabaScope?.target_ids?.[0];

    if (!wabaId) {
      return res.status(400).json({ error: 'No WhatsApp Business Account found on this token' });
    }

    // 3. Fetch the phone number(s) attached to that WABA
    const phoneResp = await fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/${wabaId}/phone_numbers?access_token=${accessToken}`
    );
    const phoneData = await phoneResp.json();
    const phoneNumber = phoneData.data?.[0];

    if (!phoneNumber) {
      return res.status(400).json({ error: 'No phone number registered on this WABA' });
    }

    // 4. Register the phone number for Cloud API use
    await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumber.id}/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: generatePin() }),
    });

    // 5. Encrypt token, generate a per-account webhook verify token, persist
    const webhookVerifyToken = crypto.randomBytes(24).toString('hex');
    const ciphertext = encrypt(accessToken);

    await prisma.whatsappAccount.upsert({
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

    // 6. Subscribe the WABA to this app's webhook
    await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return res.json({
      connected: true,
      phoneNumber: phoneNumber.display_phone_number,
    });
  } catch (err) {
    console.error('WhatsApp connect error:', err);
    return res.status(500).json({ error: 'Failed to connect WhatsApp account' });
  }
});

module.exports = router;
