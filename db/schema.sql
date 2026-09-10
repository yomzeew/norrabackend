-- Norra: multi-tenant WhatsApp AI receptionist schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS businesses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,
    timezone        TEXT NOT NULL DEFAULT 'Europe/London',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id             UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    waba_id                 TEXT NOT NULL,
    phone_number_id         TEXT NOT NULL UNIQUE,
    display_phone_number    TEXT,
    access_token_ciphertext BYTEA NOT NULL,
    token_status            TEXT NOT NULL DEFAULT 'active'
                            CHECK (token_status IN ('active','expired','revoked','pending')),
    webhook_verify_token    TEXT NOT NULL,
    connected_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at        TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_phone_number_id ON whatsapp_accounts(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_business_id ON whatsapp_accounts(business_id);

CREATE TABLE IF NOT EXISTS services (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    price_pence     INTEGER NOT NULL,
    duration_mins   INTEGER,
    active          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS business_hours (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    opens_at        TIME,
    closes_at       TIME,
    closed          BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS conversations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_wa_id      TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed','handed_off')),
    last_message_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_business_customer
    ON conversations(business_id, customer_wa_id);

CREATE TABLE IF NOT EXISTS messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction           TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
    wa_message_id       TEXT,
    body                TEXT,
    ai_generated        BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_message_id
    ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
