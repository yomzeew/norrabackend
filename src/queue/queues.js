const { Queue } = require('bullmq');
const { createRedis } = require('../lib/redis');

const connection = createRedis();

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
};

const QUEUE_NAMES = {
  INBOUND_MESSAGE: 'inbound-message',
  TOKEN_HEALTH: 'token-health',
};

const inboundMessageQueue = new Queue(QUEUE_NAMES.INBOUND_MESSAGE, {
  connection,
  defaultJobOptions,
});

const tokenHealthQueue = new Queue(QUEUE_NAMES.TOKEN_HEALTH, {
  connection,
  defaultJobOptions,
});

async function closeQueues() {
  await Promise.all([inboundMessageQueue.close(), tokenHealthQueue.close()]);
  await connection.quit();
}

module.exports = {
  QUEUE_NAMES,
  inboundMessageQueue,
  tokenHealthQueue,
  closeQueues,
};
