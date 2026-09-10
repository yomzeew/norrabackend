# Norra Backend

Multi-tenant WhatsApp AI receptionist backend. Handles Embedded Signup connections,
webhook message handling, and per-business WhatsApp credentials.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the environment template and fill in real values:
   ```
   cp .env.example .env
   ```
   - `META_APP_ID` / `META_APP_SECRET` — from developers.facebook.com/apps/ → your app → App Settings > Basic
   - `TOKEN_ENCRYPTION_KEY` — generate with:
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```
   - `DATABASE_URL` — your local or hosted Postgres connection string

3. Create the database (if it doesn't exist yet), then run the schema:
   ```
   createdb norra
   npm run migrate
   ```

4. Start the server:
   ```
   npm run dev
   ```
   This runs on `http://localhost:3000` by default. `/health` should return `{ ok: true }`.

## Exposing your webhook locally

Meta needs an HTTPS URL it can reach, so for local development use a tunnel, e.g.:
```
ngrok http 3000
```
Then in App Dashboard > WhatsApp > Configuration, set:
- Callback URL: `https://<your-ngrok-subdomain>.ngrok-free.app/webhooks/whatsapp`
- Verify Token: any string — but note this project generates a **per-business**
  `webhook_verify_token` stored in the database rather than a single global one.
  For your first manual test account, you can temporarily hardcode a token to match
  what you enter in the Meta dashboard, or insert a row into `whatsapp_accounts` by
  hand with that same token before testing the handshake.

## Project structure

```
norra-backend/
├── server.js              # entry point
├── db/
│   ├── schema.sql          # Postgres schema
│   ├── migrate.js          # applies schema.sql
│   ├── pool.js              # pg connection pool
│   └── index.js             # query helpers (businesses, whatsappAccounts, etc.)
├── routes/
│   ├── whatsapp.js          # POST /api/whatsapp/connect — Embedded Signup code exchange
│   └── webhooks.js          # GET/POST /webhooks/whatsapp — verification + inbound messages
└── utils/
    ├── crypto.js             # AES-256-GCM encrypt/decrypt for access tokens
    ├── sendWhatsAppMessage.js
    └── generateAiReply.js    # placeholder — replace with a real model call
```

## Next steps

- Replace `utils/generateAiReply.js` with a real call to your model of choice.
- Add authentication to `/api/whatsapp/connect` so only a logged-in business owner
  can trigger a connection for their own `businessId`.
- Add a background job that periodically calls Graph API's `debug_token` per
  connected account and flips `token_status` to `expired` proactively.
- Build the React frontend's "Connect WhatsApp" button (see project chat history).
# norrabackend
