-- 005_alter_contributions_for_payments.sql
-- Adds payment-tracking support to contributions: a Paystack reference,
-- a Daraja checkout_request_id, and a 'pending' default status so a row
-- can be written the moment a payment is initiated, then confirmed later
-- by whichever provider's webhook/callback fires.

-- Baseline safety net: create the table if it doesn't exist yet on a fresh
-- database. If it already exists (as it did in this project, created
-- earlier outside the numbered migrations), this is a no-op.
CREATE TABLE IF NOT EXISTS contributions (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES telegram_chats(id),
  user_id BIGINT NOT NULL,
  amount INTEGER NOT NULL,
  contributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'pending'
);

-- Paystack's own transaction/charge reference, used to match its webhook
-- event back to this row.
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS reference TEXT UNIQUE;

-- Daraja's CheckoutRequestID, used to match its callback back to this row.
-- Separate from `reference` above since the two providers use different
-- tracking IDs with different shapes.
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS checkout_request_id TEXT UNIQUE;

-- Ensures new rows default to 'pending' even if the table already existed
-- with a different (or no) default before this migration ran.
ALTER TABLE contributions ALTER COLUMN status SET DEFAULT 'pending';