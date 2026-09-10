# Mctaba Demo Bot — Telegram Chama Bot

A Telegram bot built with **Telegraf**, **PostgreSQL**, and **Redis**, designed to manage a chama (savings group) community: tracking contributions, managing group membership, moderating spam, and sending scheduled reminders and broadcasts.

Built as part of Week 20 of the Mctaba Labs software engineering program.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [1. Clone and Install](#1-clone-and-install)
  - [2. PostgreSQL Setup](#2-postgresql-setup)
  - [3. Redis Setup (WSL)](#3-redis-setup-wsl)
  - [4. Telegram Bot Registration](#4-telegram-bot-registration)
  - [5. Environment Variables](#5-environment-variables)
  - [6. Webhook Setup (ngrok)](#6-webhook-setup-ngrok)
  - [7. Run the Bot](#7-run-the-bot)
- [Database Schema](#database-schema)
- [Features](#features)
  - [Core Commands](#core-commands)
  - [Contribution Flow](#contribution-flow)
  - [Group Management (Day 3)](#group-management-day-3)
  - [Broadcasts & Scheduled Reminders (Day 4)](#broadcasts--scheduled-reminders-day-4)
- [Admin Commands](#admin-commands)
- [Testing Notes](#testing-notes)
- [Known Limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Bot framework | [Telegraf](https://telegraf.js.org/) |
| Database | PostgreSQL (via `pg`) |
| Cache / rate-limiting | Redis (via `redis`, running in WSL) |
| Scheduling | `node-cron` |
| Runtime | Node.js |
| Dev server | `nodemon` |
| Tunnel (local dev) | `ngrok` |

---

## Project Structure

```
server/
├── config/
│   ├── env.js              # Environment variable loader
│   └── redis.js            # Redis client singleton
├── handlers/
│   ├── message.handler.js  # Handles incoming messages, commands, spam detection
│   ├── callback.handler.js # Handles inline keyboard button presses
│   └── member.handler.js   # Handles group join/leave events
├── migrations/
│   └── 001_create_telegram_tables.sql
├── routes/
│   └── telegram.routes.js  # Express route for the Telegram webhook
├── services/
│   ├── telegram.service.js    # Bot instance, event wiring, DB connection
│   ├── session.service.js     # Per-user conversation state (Redis-backed)
│   ├── settings.service.js    # Per-group settings, Redis-cached
│   ├── broadcast.service.js   # Rate-limited, idempotent broadcast logic
│   └── scheduled-jobs.js      # node-cron jobs (daily + overdue reminders)
├── .env
├── index.js                 # Express app entry point
└── package.json
```

---

## Prerequisites

- Node.js (v18+ recommended)
- PostgreSQL (running locally or accessible via connection string)
- WSL with Redis installed (if developing on Windows)
- ngrok account (free tier is fine)
- A Telegram account to create/manage the bot via BotFather

---

## Setup

### 1. Clone and Install

```bash
cd server
npm install
```

### 2. PostgreSQL Setup

**Create a dedicated database and user** (rather than using the `postgres` superuser directly):

```bash
psql -U postgres
```

```sql
CREATE DATABASE telegram_bot_db;
CREATE USER telegram_user WITH PASSWORD 'your_strong_password';

GRANT ALL PRIVILEGES ON DATABASE telegram_bot_db TO telegram_user;

\c telegram_bot_db
GRANT ALL ON SCHEMA public TO telegram_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO telegram_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO telegram_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO telegram_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO telegram_user;

-- Needed for gen_random_uuid() used in the broadcasts table
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**Run the table creation statements** (see [Database Schema](#database-schema) below for the full list), or run the migration file if present:

```bash
psql -U telegram_user -d telegram_bot_db -f migrations/001_create_telegram_tables.sql
```

> **Note:** If any tables get created while connected as a different user (e.g. `postgres`), you'll need to explicitly `GRANT` access on those specific tables to `telegram_user`, since table-level grants don't apply retroactively from database-level grants alone.

### 3. Redis Setup (WSL)

If developing on Windows, Redis runs inside WSL:

```bash
wsl
sudo service redis-server start
redis-cli ping   # should return PONG
```

WSL2 forwards `localhost` to Windows automatically, so your Node app (running on Windows) can reach Redis at `localhost:6379` without extra configuration.

### 4. Telegram Bot Registration

1. Open Telegram, search for **@BotFather**.
2. Send `/newbot` and follow the prompts (choose a name and a unique username ending in `bot`).
3. BotFather will give you an **API token** — copy it.
4. **Keep this token secret.** Anyone with it has full control of your bot. If it's ever exposed (e.g. pasted in a chat, committed to a public repo), regenerate it immediately via `/mybots` → your bot → **API Token** → **Revoke current token**.

### 5. Environment Variables

Create a `.env` file in `server/`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
DATABASE_URL=postgresql://telegram_user:your_strong_password@localhost:5432/telegram_bot_db
REDIS_URL=redis://localhost:6379
PORT=3000
```

### 6. Webhook Setup (ngrok)

Telegram needs a public HTTPS URL to send updates to. In local development, we use ngrok to tunnel to `localhost`.

```bash
ngrok http 3000
```

Copy the forwarding URL (e.g. `https://your-subdomain.ngrok-free.dev`), then register it as your bot's webhook:

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-subdomain.ngrok-free.dev/telegram/webhook", "allowed_updates": ["message", "callback_query", "chat_member", "my_chat_member"]}'
```

> **Important:** `allowed_updates` must explicitly include `chat_member` and `my_chat_member`, or Telegram will never send group join/leave events to your webhook — group management features will silently not work without this.

**Verify the webhook is registered correctly:**

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

Check that `"url"` matches your current ngrok URL and `"allowed_updates"` includes all four event types.

> ngrok's free tier generates a **new URL every time you restart it**. You'll need to re-run `setWebhook` with the new URL each time ngrok restarts, or your bot will stop receiving updates.

### 7. Run the Bot

```bash
npm run dev
```

You should see:

```
Registering webhook at: https://your-subdomain.ngrok-free.dev/telegram/webhook
Server is running on port 3000
✓ Webhook registered
Bot is ready to receive webhook updates
```

Message your bot on Telegram with `/start` to confirm it's working.

---

## Database Schema

### `telegram_chats`
Tracks every chat (private or group) the bot has interacted with.

```sql
CREATE TABLE telegram_chats (
  id BIGINT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT,
  username TEXT,
  first_joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `contributions`
Records each contribution made by a user in a group.

```sql
CREATE TABLE contributions (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES telegram_chats(id),
  user_id BIGINT NOT NULL,
  amount INTEGER NOT NULL,
  contributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'completed'
);
```

### `group_members`
Local membership ledger — tracks who's in which group and when they joined/left.

```sql
CREATE TABLE group_members (
  chat_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  first_name TEXT,
  joined_at TIMESTAMPTZ NOT NULL,
  left_at TIMESTAMPTZ,
  role TEXT DEFAULT 'member',
  PRIMARY KEY (chat_id, user_id)
);
```

### `group_settings`
Per-group configuration (rules text, welcome message, spam threshold, etc).

```sql
CREATE TABLE group_settings (
  chat_id BIGINT PRIMARY KEY REFERENCES telegram_chats(id),
  rules_text TEXT,
  welcome_message TEXT,
  max_messages_per_minute INTEGER DEFAULT 10,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  language TEXT DEFAULT 'en'
);
```

### `broadcasts` / `broadcast_deliveries`
Tracks every broadcast sent and its delivery status per chat, for auditing and crash-safe resumption.

```sql
CREATE TABLE broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE broadcast_deliveries (
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id),
  chat_id BIGINT NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT,
  PRIMARY KEY (broadcast_id, chat_id)
);
```

---

## Features

### Core Commands

| Command | Description |
|---|---|
| `/start` | Greets the user and shows the main menu (Contribute / My balance / Group stats) |
| `/help` | Lists available commands |
| `/echo <text>` | Echoes back whatever text follows |

### Contribution Flow

A multi-step, button-driven flow for logging a contribution:

1. User taps **Contribute** from the main menu.
2. Bot presents preset amounts (KSh 500 / 1000 / 2000) or a **Custom amount** option.
3. If custom, the bot prompts the user to type an amount (session state: `awaiting_custom_amount`).
4. Bot asks for confirmation (**Yes, contribute** / **Cancel**).
5. On confirmation, the contribution is saved to the `contributions` table.

Session state between steps is stored via `session.service.js` (Redis-backed), keyed by `chatId` + `userId`.

### Group Management (Day 3)

- **Welcome + rules-accept flow:** New members are automatically muted (`can_send_messages: false`) on join and shown a rules message with an **Accept rules** button. Only the joining user can tap their own button — verified by matching `callback_data: acc:<user_id>` against the clicking user's ID. Accepting unmutes them and edits the message to a thank-you.
- **Spam detection:** Tracks messages per user per group in a rolling 60-second window via a Redis counter (`spam:<chatId>:<userId>`, TTL 60s). Exceeding the group's configured threshold (`group_settings.max_messages_per_minute`, default 10) mutes the user for 5 minutes. **Note:** Telegram does not allow restricting group admins — this only takes effect on regular members.
- **`/kick` command:** Admin-only, reply-based. Reply to the offending user's message with `/kick` to remove them (ban + immediate unban — removes them now but allows rejoining later via invite link).
- **Per-group settings:** Rules text, welcome message, and spam threshold are read from `group_settings`, cached in Redis for 5 minutes (`settings:<chatId>`) to avoid hitting Postgres on every message. Changes to the database take effect within 5 minutes without a bot restart.

**Required bot permissions in-group:** Delete messages, Ban users, Pin messages (grant these when promoting the bot to admin).

### Broadcasts & Scheduled Reminders (Day 4)

- **`/broadcast <message>`** — owner-only command that sends a message to every group/supergroup the bot is currently in.
  - Paced at 50ms between sends (~20 msg/sec) to stay under Telegram's rate limits.
  - **Idempotent:** tracked per-chat in `broadcast_deliveries`; if the process crashes mid-broadcast, re-running with the same broadcast ID skips chats already delivered to.
  - **Self-healing for group→supergroup migrations:** if a tracked group has since been upgraded to a supergroup (which changes its chat ID), the service catches Telegram's migration error, updates the stored chat ID, and retries the send automatically.
  - Handles `403` (bot removed from chat — deletes the stale `telegram_chats` row) and `429` (rate limited — respects Telegram's `retry_after` value).
- **Daily reminder (08:00 Africa/Nairobi):** Sends a contribution reminder to every group with a `group_settings` row.
- **7-day-overdue reminder (18:00 Africa/Nairobi):** Finds members who haven't contributed in 7+ days (or ever) and sends a personal reminder — private DM first, falling back to an `@mention` in the group (via `tg://user?id=` deep link) if the user hasn't started a private chat with the bot.

---

## Admin Commands

`/broadcast` and other bot-owner-level actions are currently gated by a **hardcoded Telegram user ID** (`BOT_OWNER_ID` in `message.handler.js`), rather than a database-driven admin list. This was a deliberate choice for the current stage of the project: broadcast-type commands affect *every* group the bot is in, which is a different (and larger) blast radius than group-level admin permissions (`isGroupAdmin`, used for `/kick`). A single hardcoded owner ID is the simplest correct gate while there's only one bot operator.

**To change the owner:** update the `BOT_OWNER_ID` constant in `handlers/message.handler.js`.

**Future improvement:** replace this with a proper `admin_users` table if the bot ever needs multiple operators.

---

## Testing Notes

- **Testing join/leave flows** requires a second Telegram account, since the group owner/creator generally cannot leave their own group without transferring ownership first. Use a friend's account, or Telegram's multi-account feature if available.
- **Testing spam-mute and restriction features** must be done with a **non-admin** account — Telegram's API silently ignores `restrictChatMember` calls against admins, so testing as the bot owner (who is also a group admin) will not demonstrate an actual mute.
- **Testing cron jobs** without waiting for their real trigger time: temporarily change the schedule string to `"*/1 * * * *"` (every minute) in `scheduled-jobs.js`, confirm it fires, then revert to the real schedule (`"0 8 * * *"` / `"0 18 * * *"`) before committing.

---

## Known Limitations

- The 7-day-overdue reminder query depends on `group_members` and `contributions` sharing consistent `chat_id`/`user_id` data — if a member's join wasn't recorded (e.g. they joined before the bot had `chat_member` tracking enabled), they won't be included.
- Per-group daily reminder opt-in is not yet implemented as a toggle — currently **every** group with a `group_settings` row receives the daily reminder. Add a boolean column (e.g. `daily_reminder_enabled`) to `group_settings` to support real opt-in/out per group.
- The web-based admin broadcast dashboard (Next.js page + Server Action) described in the Day 4 lesson has not been built — `/broadcast` is currently only accessible as a Telegram command.
- No automated tests currently exist; all verification has been manual, via direct interaction with the bot and its test group.

---

## Troubleshooting

**Bot doesn't respond to any messages:**
1. Check `ngrok`'s web inspector at `http://127.0.0.1:4040` to see if requests are arriving and what status code they get.
2. Confirm the webhook URL is current: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`. If ngrok restarted, the URL will be stale — re-run `setWebhook`.
3. Confirm your server is actually running and connected to the database without errors.

**`password authentication failed for user "..."`:**
Check `.env`'s `DATABASE_URL` matches the actual username/password/database name set up in PostgreSQL. A mismatch here is the most common cause.

**`permission denied for table <name>`:**
The table was likely created while connected as a different Postgres user (e.g. `postgres`) than the one your app connects as (`telegram_user`). Grant access explicitly:
```sql
GRANT ALL PRIVILEGES ON <table_name> TO telegram_user;
```

**`group chat was upgraded to a supergroup chat` errors during broadcast:**
Expected and self-healing as of the migration fix in `broadcast.service.js` — the stored chat ID is automatically updated and the send retried. If you see this on an older commit, manually update the `telegram_chats.id` for that chat to its new supergroup ID (found in the error's `migrate_to_chat_id` field), or delete the stale row.

**Testing rules-accept / spam-mute doesn't seem to work:**
Confirm you're testing as a **non-admin group member**, not the bot owner or a promoted admin — Telegram does not allow bots to restrict admin accounts, regardless of what the bot's code does.
