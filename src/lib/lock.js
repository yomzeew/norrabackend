const { redis } = require('./redis');
const crypto = require('crypto');

// Minimal Redis mutex. Used to serialise processing per conversation so two
// workers never generate replies for the same customer concurrently and send
// them out of order.
//
// Note: this is a single-instance lock. It is correct against a single Redis
// primary but not against failover with replication lag. That trade-off is
// fine here - the worst case on a lost lock is a duplicate or out-of-order
// reply, not data corruption. If you later need stronger guarantees, swap this
// for Redlock across independent Redis nodes.
async function acquireLock(key, ttlMs = 30000) {
  const token = crypto.randomBytes(16).toString('hex');
  const ok = await redis.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
  return ok === 'OK' ? token : null;
}

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

async function releaseLock(key, token) {
  if (!token) return;
  // Compare-and-delete so we never release a lock another worker has taken
  // over after our TTL expired.
  await redis.eval(RELEASE_SCRIPT, 1, `lock:${key}`, token);
}

module.exports = { acquireLock, releaseLock };
