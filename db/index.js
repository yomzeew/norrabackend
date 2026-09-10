const pool = require('./pool');

const businesses = {
  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async create({ name, slug, timezone }) {
    const { rows } = await pool.query(
      `INSERT INTO businesses (name, slug, timezone)
       VALUES ($1, $2, COALESCE($3, 'Europe/London'))
       RETURNING *`,
      [name, slug, timezone]
    );
    return rows[0];
  },

  // Fetches a business along with its active services and business hours,
  // shaped for the AI reply prompt.
  async findWithServicesAndHours(id) {
    const business = await this.findById(id);
    if (!business) return null;

    const { rows: services } = await pool.query(
      'SELECT * FROM services WHERE business_id = $1 AND active = true ORDER BY name',
      [id]
    );
    const { rows: hours } = await pool.query(
      'SELECT * FROM business_hours WHERE business_id = $1 ORDER BY day_of_week',
      [id]
    );

    return { ...business, services, hours };
  },
};

const whatsappAccounts = {
  async findOne({ phoneNumberId }) {
    const { rows } = await pool.query(
      'SELECT * FROM whatsapp_accounts WHERE phone_number_id = $1',
      [phoneNumberId]
    );
    return rows[0] || null;
  },

  async findByWebhookVerifyToken(token) {
    const { rows } = await pool.query(
      'SELECT * FROM whatsapp_accounts WHERE webhook_verify_token = $1',
      [token]
    );
    return rows[0] || null;
  },

  // Insert, or update in place if this business already has a row
  // (re-connecting / re-running Embedded Signup).
  async upsert({
    businessId,
    wabaId,
    phoneNumberId,
    displayPhoneNumber,
    accessTokenCiphertext,
    webhookVerifyToken,
    tokenStatus = 'active',
    connectedAt = new Date(),
  }) {
    const { rows } = await pool.query(
      `INSERT INTO whatsapp_accounts
         (business_id, waba_id, phone_number_id, display_phone_number,
          access_token_ciphertext, webhook_verify_token, token_status, connected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (phone_number_id) DO UPDATE SET
         waba_id = EXCLUDED.waba_id,
         display_phone_number = EXCLUDED.display_phone_number,
         access_token_ciphertext = EXCLUDED.access_token_ciphertext,
         webhook_verify_token = EXCLUDED.webhook_verify_token,
         token_status = EXCLUDED.token_status,
         connected_at = EXCLUDED.connected_at,
         updated_at = now()
       RETURNING *`,
      [
        businessId,
        wabaId,
        phoneNumberId,
        displayPhoneNumber,
        accessTokenCiphertext,
        webhookVerifyToken,
        tokenStatus,
        connectedAt,
      ]
    );
    return rows[0];
  },

  async setTokenStatus(phoneNumberId, tokenStatus) {
    await pool.query(
      `UPDATE whatsapp_accounts SET token_status = $2, updated_at = now()
       WHERE phone_number_id = $1`,
      [phoneNumberId, tokenStatus]
    );
  },
};

const conversations = {
  // Get the existing open conversation for this customer, or create one.
  async upsert({ businessId, customerWaId }) {
    const { rows } = await pool.query(
      `INSERT INTO conversations (business_id, customer_wa_id, last_message_at)
       VALUES ($1, $2, now())
       ON CONFLICT (business_id, customer_wa_id) DO UPDATE SET
         last_message_at = now()
       RETURNING *`,
      [businessId, customerWaId]
    );
    return rows[0];
  },
};

const messages = {
  async findOne({ waMessageId }) {
    if (!waMessageId) return null;
    const { rows } = await pool.query(
      'SELECT * FROM messages WHERE wa_message_id = $1',
      [waMessageId]
    );
    return rows[0] || null;
  },

  async create({ conversationId, direction, waMessageId, body, aiGenerated = false }) {
    const { rows } = await pool.query(
      `INSERT INTO messages (conversation_id, direction, wa_message_id, body, ai_generated)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [conversationId, direction, waMessageId || null, body, aiGenerated]
    );
    return rows[0];
  },
};

module.exports = { pool, businesses, whatsappAccounts, conversations, messages };
