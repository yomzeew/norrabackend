// Separate process from the API. Scale this independently of the web tier -
// message volume and HTTP traffic have very different shapes.
const env = require('./config/env');
const logger = require('./lib/logger');
const { registerShutdown } = require('./lib/shutdown');
const { closeQueues } = require('./queue/queues');
const { disconnectPrisma } = require('./lib/prisma');
const { createInboundWorker } = require('./queue/workers/inboundMessage.worker');
const {
  createTokenHealthWorker,
  scheduleTokenHealth,
} = require('./queue/workers/tokenHealth.worker');

async function main() {
  const workers = [createInboundWorker(), createTokenHealthWorker()];

  await scheduleTokenHealth();

  logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'Norra worker started');

  registerShutdown({
    workers,
    onClose: [closeQueues, disconnectPrisma],
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
