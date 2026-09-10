const express = require('express');
const prisma = require('../../lib/prisma');
const { redis } = require('../../lib/redis');

const router = express.Router();

// Liveness: is the process up? Must not touch dependencies - if it did, a brief
// database blip would make the orchestrator kill healthy instances.
router.get('/healthz', (req, res) => res.json({ ok: true }));

// Readiness: should this instance receive traffic? Checks dependencies, so a
// instance with a broken DB connection is pulled from the load balancer
// without being restarted.
router.get('/readyz', async (req, res) => {
  const checks = { database: false, redis: false };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (_) {
    // left false
  }

  try {
    await redis.ping();
    checks.redis = true;
  } catch (_) {
    // left false
  }

  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({ ready, checks });
});

module.exports = router;
