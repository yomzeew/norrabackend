const env = require('./config/env');
const logger = require('./lib/logger');
const { createApp } = require('./app');
const { registerShutdown } = require('./lib/shutdown');
const { closeQueues } = require('./queue/queues');
const { disconnectPrisma } = require('./lib/prisma');

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Norra API listening');
});

registerShutdown({
  server,
  onClose: [closeQueues, disconnectPrisma],
});
