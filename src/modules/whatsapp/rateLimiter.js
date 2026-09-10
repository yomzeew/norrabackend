const { redis } = require('../../lib/redis');

// Meta enforces per-phone-number throughput limits. Because every worker
// instance sends independently, the counter has to live in Redis rather than
// in process memory - otherwise the effective limit multiplies by the number
// of instances you run.
//
// Fixed-window counter: simple, and adequate since we only need to stay under
// a ceiling, not smooth traffic precisely.
const DEFAULT_LIMIT = 60; // messages
const WINDOW_SECONDS = 1;

async function tryConsume(phoneNumberId, limit = DEFAULT_LIMIT) {
  const bucket = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const key = `ratelimit:wa:${phoneNumberId}:${bucket}`;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS * 2);
  }
  return count <= limit;
}

module.exports = { tryConsume };
