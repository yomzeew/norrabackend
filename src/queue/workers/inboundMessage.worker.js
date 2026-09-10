const { Worker } = require('bullmq');
const { createRedis } = require('../../lib/redis');
const prisma = require('../../lib/prisma');
const logger = require('../../lib/logger');
const env = require('../../config/env');
const { QUEUE_NAMES } = require('../queues');
const { acquireLock, releaseLock } = require('../../lib/lock');
const conversationService = require('../../modules/conversations/conversation.service');
const replyService = require('../../modules/ai/reply.service');
const whatsappService = require('../../modules/whatsapp/whatsapp.service');

async function processInbound(job) {
  const { phoneNumberId, waMessageId, from, text, type } = job.data;

  if (type !== 'text' || !text) {
    logger.debug({ waMessageId, type }, 'Skipping non-text message');
    return;
  }

  const account = await prisma.whatsappAccount.findUnique({ where: { phoneNumberId } });
  if (!account) {
    logger.warn({ phoneNumberId }, 'Message for unknown phone number - dropping');
    return;
  }

  if (account.tokenStatus !== 'active') {
    // Don't burn retries on an account we know is disconnected.
    logger.warn({ phoneNumberId, tokenStatus: account.tokenStatus }, 'Account not active');
    return;
  }

  // Serialise per conversation so replies to one customer stay in order even
  // with many workers running.
  const lockKey = `conversation:${account.businessId}:${from}`;
  const lockToken = await acquireLock(lockKey, 60000);

  if (!lockToken) {
    // Another worker holds this conversation. Requeue with a short delay
    // instead of blocking a worker slot.
    throw new Error('conversation_locked');
  }

  try {
    const conversation = await conversationService.upsertConversation({
      businessId: account.businessId,
      customerWaId: from,
    });

    const isNew = await conversationService.recordInbound({
      conversationId: conversation.id,
      waMessageId,
      body: text,
    });

    if (!isNew) {
      logger.debug({ waMessageId }, 'Duplicate message - already processed');
      return;
    }

    const business = await conversationService.getBusinessContext(account.businessId);

    const reply = await replyService.generateReply({
      business,
      conversation,
      message: text,
    });

    await whatsappService.sendMessage({ account, to: from, text: reply });

    await conversationService.recordOutbound({
      conversationId: conversation.id,
      body: reply,
    });

    logger.info({ waMessageId, businessId: account.businessId }, 'Replied to inbound message');
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}

function createInboundWorker() {
  const worker = new Worker(QUEUE_NAMES.INBOUND_MESSAGE, processInbound, {
    connection: createRedis(),
    concurrency: env.WORKER_CONCURRENCY,
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, attempts: job?.attemptsMade, err: err.message },
      'Inbound job failed'
    );
  });

  return worker;
}

module.exports = { createInboundWorker, processInbound };
