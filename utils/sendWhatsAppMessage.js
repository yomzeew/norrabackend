const { META_GRAPH_VERSION = 'v21.0' } = process.env;

async function sendWhatsAppMessage({ phoneNumberId, accessToken, to, text }) {
  const resp = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );

  const data = await resp.json();
  if (data.error) {
    console.error('Failed to send WhatsApp message:', data.error);
    throw new Error(data.error.message || 'WhatsApp send failed');
  }
  return data;
}

module.exports = { sendWhatsAppMessage };
