const logger = require('../../lib/logger');

// Placeholder. Swap for a real model call - keep it behind this interface so
// the worker doesn't need to change when you do.
//
// Two things to preserve when you replace it:
//   1. A hard timeout. A hung model call holds a worker slot and a
//      conversation lock; without a timeout one bad request stalls that
//      customer's queue.
//   2. Deterministic failure. Throw on error so BullMQ retries with backoff
//      rather than sending an empty reply.
async function generateReply({ business, conversation, message }) {
  const services = (business?.services || [])
    .map((s) => `${s.name}: £${(s.pricePence / 100).toFixed(2)}`)
    .join(', ');

  logger.debug({ businessId: business?.id, conversationId: conversation?.id }, 'Generating reply');

  return (
    `Thanks for messaging ${business?.name || 'us'}! ` +
    (services ? `Our services: ${services}. ` : '') +
    `Someone will follow up shortly regarding: "${message}"`
  );
}

module.exports = { generateReply };
