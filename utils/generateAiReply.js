// Placeholder implementation so the webhook flow runs end-to-end out of the box.
// Replace this with a real call to your model of choice (Anthropic, OpenAI, etc.),
// using `business.services` and `business.businessHours` as context for the reply.
async function generateAiReply({ business, conversation, message }) {
  const serviceList = (business?.services || [])
    .map((s) => `${s.name}: £${(s.pricePence / 100).toFixed(2)}`)
    .join(', ');

  return (
    `Thanks for messaging ${business?.name || 'us'}! ` +
    (serviceList ? `Our services: ${serviceList}. ` : '') +
    `Someone will follow up shortly regarding: "${message}"`
  );
}

module.exports = { generateAiReply };
