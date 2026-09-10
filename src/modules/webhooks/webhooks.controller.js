const prisma = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { inboundMessageQueue } = require('../../queue/queues');

// GET - Meta's one-time verification handshake when subscribing a WABA.
async function verify(req, res) {
  const {
    'hub.mode': mode,
    'hub.verify_token': token,
    'hub.challenge': challenge,
  } = req.query;

  if (mode !== 'subscribe' || !token) return res.sendStatus(403);

  const account = await prisma.whatsappAccount.findFirst({
    where: { webhookVerifyToken: String(token) },
    select: { id: true },
  });

  if (!account) return res.sendStatus(403);
  return res.status(200).send(challenge);
}

// POST - inbound events.
//
// This handler does the minimum possible: validate, enqueue, ack. All the slow
// work (AI generation, outbound send) happens in a worker process. That is what
// lets the web tier scale independently and survive restarts without losing
// messages mid-flight.
async function receive(req, res) {
  // Ack first. Meta retries aggressively on anything slow or non-200, and a
  // retry storm is worse than a dropped log line.
  res.sendStatus(200);

  try {
    const changes = req.body?.entry?.flatMap((e) => e.changes || []) || [];

    for (const change of changes) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const message of value.messages || []) {
        // jobId keyed on Meta's message id gives us idempotency at the queue
        // level: duplicate webhook deliveries collapse into one job instead of
        // racing each other to the database.
        await inboundMessageQueue.add(
          'inbound',
          {
            phoneNumberId,
            waMessageId: message.id,
            from: message.from,
            type: message.type,
            text: message.text?.body ?? null,
            timestamp: message.timestamp,
          },
          { jobId: message.id }
        );
      }

      for (const status of value.statuses || []) {
        logger.debug({ phoneNumberId, status: status.status }, 'Message status update');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Failed to enqueue inbound webhook payload');
  }
}

module.exports = { verify, receive };
