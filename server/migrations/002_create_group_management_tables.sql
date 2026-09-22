-- 002_create_group_management_tables.sql
-- Week 20 Day 3: group membership tracking and per-group configuration.

CREATE TABLE IF NOT EXISTS group_members (
  chat_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  first_name TEXT,
  joined_at TIMESTAMPTZ NOT NULL,
  left_at TIMESTAMPTZ,
  role TEXT DEFAULT 'member',
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_settings (
  chat_id BIGINT PRIMARY KEY REFERENCES telegram_chats(id),
  rules_text TEXT,
  welcome_message TEXT,
  max_messages_per_minute INTEGER DEFAULT 10,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  language TEXT DEFAULT 'en'
);