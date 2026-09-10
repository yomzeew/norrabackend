const { Worker } = require('bullmq');
const { createRedis } = require('../../lib/redis');
const prisma = require('../../lib/prisma');
const logger = require('../../lib/logger');
const { QUEUE_NAMES, tokenHealthQueue } = require('../queues');
const whatsappService = require('../../modules/whatsapp/whatsapp.service');

// Walks connected accounts and marks revoked/expired tokens before a customer
// message hits a dead credential.
async function processTokenHealth() {
  const accounts = await prisma.whatsappAccount.findMany({
    where: { tokenStatus: 'active' },
    take: 500,
    orderBy: { lastVerifiedAt: { sort: 'asc', nulls: 'first' } },
  });

  for (const account of accounts) {
    const status = await whatsappService.refreshTokenStatus(account);
    if (status && status !== 'active') {
      logger.warn({ accountId: account.id, status }, 'Account token no longer valid');
    }
  }

  logger.info({ checked: accounts.length }, 'Token health sweep complete');
}

function createTokenHealthWorker() {
  const worker = new Worker(QUEUE_NAMES.TOKEN_HEALTH, processTokenHealth, {
    connection: createRedis(),
    concurrency: 1,
  });

  worker.on('failed', (job, err) => {
    logger.error({ err: err.message }, 'Token health job failed');
  });

  return worker;
}

// Repeatable job - BullMQ dedupes by key across instances, so it's safe to
// call this from every worker process on boot.
async function scheduleTokenHealth() {
  await tokenHealthQueue.add(
    'sweep',
    {},
    {
      repeat: { pattern: '0 * * * *' }, // hourly
      jobId: 'token-health-sweep',
    }
  );
}

module.exports = { createTokenHealthWorker, scheduleTokenHealth };
