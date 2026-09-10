# Norra Backend

Multi-tenant WhatsApp AI receptionist backend. Handles Embedded Signup connections,
webhook message handling, and per-business WhatsApp credentials.

Stack: Express + Prisma + PostgreSQL.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the environment template and fill in real values:
   ```
   cp .env.example .env
   ```
   - `META_APP_ID` / `META_APP_SECRET` — developers.facebook.com/apps/ → your app → App Settings > Basic
   - `TOKEN_ENCRYPTION_KEY` — generate with:
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```
   - `DATABASE_URL` — your Postgres connection string

3. Create the database, then run the first migration:
   ```
   createdb norra
   npx prisma migrate dev --name init
   ```
   This generates the Prisma client and applies the schema.

4. Start the server:
   ```
   npm run dev
   ```
   `/health` should return `{ ok: true }`.

## Useful commands

```
npm run prisma:studio     # browse/edit data in a GUI
npm run prisma:migrate    # create + apply a new migration after schema changes
npm run prisma:generate   # regenerate the client without migrating
npm run prisma:deploy     # apply existing migrations (use in production)
```

## Exposing your webhook locally

Meta needs an HTTPS URL it can reach, so use a tunnel for local development:
```
ngrok http 3000
```
Then in App Dashboard > WhatsApp > Configuration, set:
- Callback URL: `https://<your-subdomain>.ngrok-free.app/webhooks/whatsapp`
- Verify Token: this project stores a **per-business** `webhookVerifyToken` in the
  database rather than one global value. For your first manual test, create a
  business + whatsappAccount row (via `prisma studio`) with a known token, and enter
  that same token in the Meta dashboard.

## Project structure

```
norra-backend/
├── server.js                   # entry point
├── prisma/
│   └── schema.prisma            # data model — source of truth for the DB
├── lib/
│   └── prisma.js                # PrismaClient singleton
├── routes/
│   ├── whatsapp.js              # POST /api/whatsapp/connect — Embedded Signup code exchange
│   └── webhooks.js              # GET/POST /webhooks/whatsapp — verification + inbound messages
└── utils/
    ├── crypto.js                 # AES-256-GCM encrypt/decrypt for access tokens
    ├── sendWhatsAppMessage.js
    └── generateAiReply.js        # placeholder — replace with a real model call
```

## Next steps

- Replace `utils/generateAiReply.js` with a real model call.
- Add auth to `/api/whatsapp/connect` so only a signed-in owner can connect their own
  `businessId` — right now anyone with a valid UUID could trigger a connection.
- Add a background job calling Graph API `debug_token` per account, flipping
  `tokenStatus` to `expired` before a send fails.
- Build the React "Connect WhatsApp" button against `config_id` from
  Facebook Login for Business.
