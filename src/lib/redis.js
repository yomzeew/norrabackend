const IORedis = require('ioredis');
const env = require('../config/env');

// BullMQ requires maxRetriesPerRequest: null on connections it uses.
function createRedis(options = {}) {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...options,
  });
}

// Shared connection for general use (locks, health checks).
const redis = createRedis();

module.exports = { redis, createRedis };
