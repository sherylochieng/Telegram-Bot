-- 003_create_broadcast_tables.sql
-- Week 20 Day 4: rate-limited, idempotent broadcasts to every group.

-- Needed for gen_random_uuid() used below.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS broadcast_deliveries (
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id),
  chat_id BIGINT NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT,
  PRIMARY KEY (broadcast_id, chat_id)
);