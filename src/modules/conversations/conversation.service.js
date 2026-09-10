const prisma = require('../../lib/prisma');

async function upsertConversation({ businessId, customerWaId }) {
  return prisma.conversation.upsert({
    where: { businessId_customerWaId: { businessId, customerWaId } },
    create: { businessId, customerWaId, lastMessageAt: new Date() },
    update: { lastMessageAt: new Date() },
  });
}

// Relies on the unique index on waMessageId. Returns false if this message was
// already recorded, which is how we stay idempotent against Meta's retries even
// if two workers somehow process the same delivery.
async function recordInbound({ conversationId, waMessageId, body }) {
  try {
    await prisma.message.create({
      data: { conversationId, direction: 'inbound', waMessageId, body },
    });
    return true;
  } catch (err) {
    if (err.code === 'P2002') return false; // unique constraint violation
    throw err;
  }
}

async function recordOutbound({ conversationId, body }) {
  return prisma.message.create({
    data: { conversationId, direction: 'outbound', body, aiGenerated: true },
  });
}

async function getBusinessContext(businessId) {
  return prisma.business.findUnique({
    where: { id: businessId },
    include: {
      services: { where: { active: true }, orderBy: { name: 'asc' } },
      businessHours: { orderBy: { dayOfWeek: 'asc' } },
    },
  });
}

module.exports = {
  upsertConversation,
  recordInbound,
  recordOutbound,
  getBusinessContext,
};
