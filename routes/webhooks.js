const express = require('express');
const prisma = require('../lib/prisma');
const { decrypt } = require('../utils/crypto');
const { sendWhatsAppMessage } = require('../utils/sendWhatsAppMessage');
const { generateAiReply } = require('../utils/generateAiReply');

const router = express.Router();

// Verification handshake - Meta calls this once when you register the
// callback URL for a WABA's webhook subscription.
router.get('/webhooks/whatsapp', async (req, res) => {
  const {
    'hub.mode': mode,
    'hub.verify_token': token,
    'hub.challenge': challenge,
  } = req.query;

  if (mode !== 'subscribe' || !token) return res.sendStatus(403);

  const account = await prisma.whatsappAccount.findFirst({
    where: { webhookVerifyToken: String(token) },
  });

  if (!account) return res.sendStatus(403);
  return res.status(200).send(challenge);
});

// Inbound messages
router.post('/webhooks/whatsapp', async (req, res) => {
  // Ack immediately - Meta expects a fast 200, do the real work after.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const phoneNumberId = entry?.metadata?.phone_number_id;
    const incoming = entry?.messages?.[0];
    if (!phoneNumberId || !incoming) return;

    const account = await prisma.whatsappAccount.findUnique({
      where: { phoneNumberId },
    });
    if (!account) return; // unknown number, ignore

    // Idempotency - Meta retries webhook deliveries
    if (incoming.id) {
      const exists = await prisma.message.findUnique({
        where: { waMessageId: incoming.id },
      });
      if (exists) return;
    }

    const conversation = await prisma.conversation.upsert({
      where: {
        businessId_customerWaId: {
          businessId: account.businessId,
          customerWaId: incoming.from,
        },
      },
      create: {
        businessId: account.businessId,
        customerWaId: incoming.from,
        lastMessageAt: new Date(),
      },
      update: { lastMessageAt: new Date() },
    });

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'inbound',
        waMessageId: incoming.id || null,
        body: incoming.text?.body,
      },
    });

    const business = await prisma.business.findUnique({
      where: { id: account.businessId },
      include: {
        services: { where: { active: true }, orderBy: { name: 'asc' } },
        businessHours: { orderBy: { dayOfWeek: 'asc' } },
      },
    });

    const reply = await generateAiReply({
      business,
      conversation,
      message: incoming.text?.body,
    });

    const accessToken = decrypt(account.accessTokenCiphertext);
    await sendWhatsAppMessage({
      phoneNumberId,
      accessToken,
      to: incoming.from,
      text: reply,
    });

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        body: reply,
        aiGenerated: true,
      },
    });
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

module.exports = router;
