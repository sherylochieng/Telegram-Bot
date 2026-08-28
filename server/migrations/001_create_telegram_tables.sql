-- server/migrations/001_create_telegram_tables.sql

-- Telegram chat tracking
CREATE TABLE IF NOT EXISTS telegram_chats (
  id BIGINT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  username TEXT,
  first_joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User contributions tracking
CREATE TABLE IF NOT EXISTS contributions (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES telegram_chats(id),
  user_id BIGINT NOT NULL,
  amount INTEGER NOT NULL,
  contributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'completed'
);

CREATE INDEX IF NOT EXISTS idx_contributions_chat_user
  ON contributions(chat_id, user_id);

CREATE INDEX IF NOT EXISTS idx_contributions_contributed_at
  ON contributions(contributed_at DESC);