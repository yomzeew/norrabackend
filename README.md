# Norra Backend

Multi-tenant WhatsApp AI receptionist. Businesses connect their own WhatsApp
Business account via Meta Embedded Signup; inbound messages are answered by an
AI receptionist using that business's own services, prices and hours.

Express · Prisma · PostgreSQL · Redis · BullMQ

---

## Architecture

Two process types, scaled independently, sharing one image:

```
                    ┌──────────────┐
   Meta webhook ───▶│  API (web)   │──┐
                    │  src/server  │  │  enqueue
   Dashboard   ───▶ └──────────────┘  │
                                      ▼
                                 ┌─────────┐
                                 │  Redis  │  queue + locks + rate limits
                                 └─────────┘
                                      │
                                      ▼  consume
                    ┌──────────────────────────┐
                    │  Worker (src/worker.js)  │──▶ AI ──▶ Meta Graph API
                    └──────────────────────────┘
                                      │
                                      ▼
                                ┌──────────┐
                                │ Postgres │
                                └──────────┘
```

**Why the split.** The webhook handler does only: verify signature → enqueue →
`200`. Everything slow (AI generation, outbound send) runs in the worker. This
matters because Meta retries aggressively on slow or failed deliveries, and
because work done inline after `res.send()` is silently lost on deploy or crash.

### What makes it horizontally scalable

| Concern | How it's handled |
|---|---|
| **Stateless web tier** | No in-memory session or queue state. Run N replicas behind a load balancer. |
| **Independent scaling** | Web scales on HTTP traffic; workers scale on queue depth. Different shapes, different replica counts. |
| **Idempotency** | `jobId` = Meta's `wamid`, so duplicate webhook deliveries collapse into one job. Second line of defence: unique index on `messages.wa_message_id`. |
| **Ordering per customer** | Redis mutex keyed on `businessId:customerWaId`. Many workers run concurrently, but never two on the same conversation. |
| **Rate limits** | Per-phone-number counter in Redis, not process memory — otherwise your effective limit multiplies by replica count and Meta throttles you. |
| **Retries** | BullMQ exponential backoff, 5 attempts. Transient Graph errors (429/5xx) retry; 4xx fail fast instead of burning quota. |
| **Graceful shutdown** | `SIGTERM` drains in-flight jobs and releases conversation locks before exit, so a rolling deploy doesn't strand messages behind a lock TTL. |
| **Health probes** | `/healthz` (liveness, no dependencies) vs `/readyz` (readiness, checks DB + Redis). Split matters: a DB blip should remove an instance from the LB, not kill it. |

### Connection limits under scale

The thing that breaks first when you scale Postgres-backed Node services:
every replica opens its own pool, so `replicas × connection_limit` can exceed
`max_connections` and new instances fail to connect.

Put PgBouncer (transaction mode) in front and set:

```
DATABASE_URL="postgresql://...?pgbouncer=true&connection_limit=5&pool_timeout=20"
```

Budget roughly: `(web replicas + worker replicas) × connection_limit` should
stay comfortably under your Postgres `max_connections`.

---

## Local setup

```bash
docker compose up -d          # Postgres + Redis
npm install
cp .env.example .env          # fill in Meta credentials
```

Generate an encryption key for `TOKEN_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then:

```bash
npx prisma migrate dev --name init
npm run dev          # API on :3000
npm run dev:worker   # worker, separate terminal
```

Check `curl localhost:3000/readyz` → `{"ready":true,...}`.

### Exposing the webhook locally

```bash
ngrok http 3000
```

In App Dashboard → WhatsApp → Configuration:
- Callback URL: `https://<subdomain>.ngrok-free.app/webhooks/whatsapp`
- Verify Token: this project stores a **per-business** `webhookVerifyToken`.
  For the first manual test, create a `Business` + `WhatsappAccount` row via
  `npx prisma studio` with a known token, and enter that same value in Meta.

---

## Structure

```
src/
├── server.js                    # API entrypoint
├── worker.js                    # worker entrypoint
├── app.js                       # express wiring (raw body kept for HMAC)
├── config/env.js                # zod-validated env, fails fast at boot
├── lib/
│   ├── prisma.js  redis.js  logger.js
│   ├── lock.js                  # Redis mutex (compare-and-delete release)
│   └── shutdown.js              # SIGTERM draining
├── middleware/errorHandler.js
├── modules/
│   ├── whatsapp/
│   │   ├── graph.client.js      # Graph API + retry/backoff
│   │   ├── rateLimiter.js       # per-number, Redis-backed
│   │   ├── whatsapp.service.js  # Embedded Signup, send, token health
│   │   ├── whatsapp.controller.js
│   │   └── whatsapp.routes.js
│   ├── webhooks/
│   │   ├── signature.js         # X-Hub-Signature-256 verification
│   │   ├── webhooks.controller.js
│   │   └── webhooks.routes.js
│   ├── conversations/conversation.service.js
│   ├── ai/reply.service.js      # PLACEHOLDER — swap for real model call
│   └── health/health.routes.js
└── queue/
    ├── queues.js
    └── workers/
        ├── inboundMessage.worker.js
        └── tokenHealth.worker.js
```

---

## Deployment

Same image, two commands:

```bash
docker build -t norra-backend .
# API
docker run -e ... norra-backend node src/server.js
# Worker
docker run -e ... norra-backend node src/worker.js
```

Run `npx prisma migrate deploy` as a release step, not on container boot —
otherwise N replicas race to migrate simultaneously.

Scale workers on queue depth (`inboundMessageQueue.getJobCounts()`), not CPU.

---

## Known gaps

These are deliberate placeholders, not oversights:

1. **`/api/whatsapp/connect` has no auth.** Anyone with a valid `businessId`
   UUID can trigger a connection for it. Add session auth and assert ownership
   before production.
2. **`ai/reply.service.js` is a stub.** Replace with a real model call. Keep a
   hard timeout — a hung call holds both a worker slot and a conversation lock.
3. **Encryption key lives in env.** Fine to start; move to KMS/Secrets Manager
   with envelope encryption when you have real customer tokens.
4. **The Redis lock is single-primary.** Correct against one Redis node, not
   against failover with replication lag. Worst case on a lost lock is a
   duplicate reply, not corruption. Swap for Redlock if that becomes unacceptable.
5. **No tests yet.** The structure is test-friendly (services are pure-ish,
   `createApp()` is injectable) but nothing is written.
