# Mc Demo Bot - Telegram Chama Bot

A Telegram bot built with **Telegraf**, **PostgreSQL**, **Redis**, and **Paystack**, designed to manage a chama (savings group) community: tracking contributions, managing group membership, moderating spam, sending scheduled reminders and broadcasts, and accepting real (test-mode) payments via card, Airtel Money, or M-Pesa.

Built as part of the Mctaba Labs software engineering program (Week 20–21).

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
  - [5. Paystack Setup](#5-paystack-setup)
  - [6. Environment Variables](#6-environment-variables)
  - [7. Webhook Setup (ngrok)](#7-webhook-setup-ngrok)
  - [8. Run the Bot](#8-run-the-bot)
- [Database Schema](#database-schema)
- [Features](#features)
  - [Core Commands](#core-commands)
  - [Contribution Flow](#contribution-flow)
  - [Balance & Group Stats](#balance--group-stats)
  - [Payments (Paystack, Test Mode)](#payments-paystack-test-mode)
  - [Group Management (Day 3)](#group-management-day-3)
  - [Broadcasts & Scheduled Reminders (Day 4)](#broadcasts--scheduled-reminders-day-4)
  - [Cron Registry (Week 21 Day 1)](#cron-registry-week-21-day-1)
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
| Payments | [Paystack](https://paystack.com/) (test mode) — card, Airtel Money, M-Pesa |
| Scheduling | `node-cron`, via a central job registry |
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
├── cron/
│   ├── registry.js         # Central cron job registry with logged, error-safe runner
│   └── tasks.js            # The six scheduled job definitions
├── handlers/
│   ├── message.handler.js  # Commands, spam detection, /kick, /broadcast, M-Pesa phone step
│   ├── callback.handler.js # Inline keyboard buttons — contribution flow, balance, stats, payments
│   └── member.handler.js   # Group join/leave events, welcome + rules-accept flow
├── migrations/
│   └── 001_create_telegram_tables.sql
├── routes/
│   ├── telegram.routes.js  # Express route for the Telegram webhook
│   └── paystack.routes.js  # Express route for the Paystack payment webhook
├── services/
│   ├── telegram.service.js    # Bot instance, event wiring, DB connection, command registration
│   ├── session.service.js     # Per-user conversation state (Redis-backed)
│   ├── settings.service.js    # Per-group settings, Redis-cached
│   ├── broadcast.service.js   # Rate-limited, idempotent broadcast logic
│   └── paystack.service.js    # Paystack transaction init, M-Pesa STK push, webhook verification
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
- A Paystack account (test mode) — [dashboard.paystack.com](https://dashboard.paystack.com)

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

> **Ownership note:** any table created while connected as `postgres` (rather than `telegram_user`) needs its ownership transferred before `telegram_user` can run `ALTER TABLE` on it:
> ```sql
> ALTER TABLE <table_name> OWNER TO telegram_user;
> ```
> This came up more than once during development (`contributions` in particular) — if you hit `must be owner of table`, this is the fix.

Run the table creation statements (see [Database Schema](#database-schema) below), or the migration file if present:

```bash
psql -U telegram_user -d telegram_bot_db -f migrations/001_create_telegram_tables.sql
```

### 3. Redis Setup (WSL)

If developing on Windows, Redis runs inside WSL:

```bash
wsl
sudo service redis-server start
redis-cli ping   # should return PONG
```

WSL2 forwards `localhost` to Windows automatically, so your Node app (running on Windows) can reach Redis at `localhost:6379` without extra configuration.

**Keep the WSL terminal window open** while the bot is running — closing it kills the Redis process. If your bot starts throwing `ECONNREFUSED 127.0.0.1:6379` errors, this is almost always why; restart Redis, then restart the Node server so it reconnects cleanly.

### 4. Telegram Bot Registration

1. Open Telegram, search for **@BotFather**.
2. Send `/newbot` and follow the prompts (choose a name and a unique username ending in `bot`).
3. BotFather will give you an **API token** — copy it.
4. **Keep this token secret.** Anyone with it has full control of your bot. If it's ever exposed, regenerate it immediately via `/mybots` → your bot → **API Token** → **Revoke current token**.

### 5. Paystack Setup

1. Log into [dashboard.paystack.com](https://dashboard.paystack.com), and make sure you're in **Test Mode** (toggle near the top of the dashboard).
2. Go to **Settings → API Keys & Webhooks**, and copy your **Test Secret Key** (starts with `sk_test_...`).
3. On the same page, set the **Webhook URL** to `<your ngrok URL>/paystack/webhook` (see [step 7](#7-webhook-setup-ngrok) — this is separate from Telegram's webhook).

### 6. Environment Variables

Create a `.env` file in `server/` (see `.env.example` for the full template):

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
DATABASE_URL=postgresql://telegram_user:your_strong_password@localhost:5432/telegram_bot_db
REDIS_URL=redis://localhost:6379
PAYSTACK_SECRET_KEY=sk_test_your_key_here
PORT=3000
PUBLIC_URL=https://your-subdomain.ngrok-free.dev
```

### 7. Webhook Setup (ngrok)

Telegram and Paystack both need a public HTTPS URL to reach your local server. In development, ngrok provides that tunnel.

```bash
ngrok http 3000
```

Copy the forwarding URL (e.g. `https://your-subdomain.ngrok-free.dev`), and:

**Register it with Telegram**, including `chat_member` and `my_chat_member` in `allowed_updates` (required for group management features to work at all):

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-subdomain.ngrok-free.dev/telegram/webhook", "allowed_updates": ["message", "callback_query", "chat_member", "my_chat_member"]}'
```

Verify:

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

**Register it with Paystack** — same ngrok URL, `/paystack/webhook` path, set in the dashboard as described in [step 5](#5-paystack-setup).

> ngrok's free tier generates a **new URL every time you restart it**. Re-run `setWebhook` (Telegram) and update the dashboard field (Paystack) each time ngrok restarts, or both integrations will stop receiving updates.

### 8. Run the Bot

```bash
npm run dev
```

You should see:

```
Server is running on port 3000
[cron] scheduled settings-reconciliation (0 2 * * *, Africa/Nairobi)
[cron] scheduled cleanup-old-broadcasts (0 3 * * *, Africa/Nairobi)
[cron] scheduled daily-owner-report (0 8 * * *, Africa/Nairobi)
[cron] scheduled daily-group-reminder (0 8 * * *, Africa/Nairobi)
[cron] scheduled overdue-reminders (0 18 * * *, Africa/Nairobi)
[cron] scheduled health-ping (*/5 * * * *, Africa/Nairobi)
✓ Bot commands registered with Telegram
✓ Webhook registered
Bot is ready to receive webhook updates
```

Message your bot on Telegram with `/start` to confirm it's working.

---

## Database Schema

### `telegram_chats`
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
```sql
CREATE TABLE contributions (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL REFERENCES telegram_chats(id),
  user_id BIGINT NOT NULL,
  amount INTEGER NOT NULL,
  contributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'pending',
  reference TEXT UNIQUE
);
```
`status` starts as `'pending'` when a payment link/STK push is issued, and only becomes `'completed'` once the Paystack webhook confirms the charge. `reference` is the unique ID generated per payment attempt, used to match the webhook event back to this row.

### `group_members`
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

### `cron_runs`
```sql
CREATE TABLE cron_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'success', 'failed')),
  error_message TEXT,
  duration_ms INTEGER
);
CREATE INDEX idx_cron_runs_job_started ON cron_runs(job_name, started_at DESC);
```
Audit log for every scheduled job run — see [Cron Registry](#cron-registry-week-21-day-1) below.

---

## Features

### Core Commands

| Command | Description |
|---|---|
| `/start` | Greets the user and shows the main menu (Contribute / My balance / Group stats) |
| `/help` | Lists available commands |
| `/echo <text>` | Echoes back whatever text follows |

Commands are registered with Telegram via `setMyCommands`, so they appear as a tappable list under the **☰** menu button next to the message box, with autocomplete as the user types `/`.

### Contribution Flow

1. User taps **Contribute** from the main menu.
2. Bot presents preset amounts (KSh 500 / 1000 / 2000) or a **Custom amount** option.
3. User confirms the amount (**Yes, contribute** / **Cancel**).
4. Bot asks for a **payment method**: Card/Airtel Money, or M-Pesa.
5. Depending on the method, the user either gets a payment link (card/Airtel) or is asked for a phone number to trigger an STK push (M-Pesa) — see [Payments](#payments-paystack-test-mode) below.

### Balance & Group Stats

- **My balance** — sums the user's own `completed` contributions in the current chat.
- **Group stats** — shows the group's total contributed, number of contributions, number of distinct contributors, and a **per-member breakdown** (name + individual total, sorted highest to lowest), joined against `group_members` for display names.

### Payments (Paystack, Test Mode)

Two payment paths, chosen by the user after confirming an amount:

**Card / Airtel Money** — calls Paystack's `/transaction/initialize` endpoint, which returns a hosted checkout page URL. The bot sends this as a "Pay now" button. A `pending` row is written to `contributions` immediately, tagged with a unique `reference`; it's only marked `completed` once the Paystack webhook confirms the charge.

**M-Pesa** — calls Paystack's `/charge` endpoint with a `mobile_money` payload, which triggers a genuine **STK push** (the "Enter M-Pesa PIN" prompt) directly on the user's phone — no browser or link involved. Requires:
- `provider: "mpesa_offline"` (not `"mpesa"` — this was found by trial and error; the wrong provider string produces a misleading "Invalid phone number format" error that is actually unrelated to the phone number itself)
- Phone number in **international format** (`254...`), passed through unchanged — do not convert to local `0...` format, despite that seeming intuitive
- **Test mode requires Paystack's official test number**: `254710000000` (no PIN/OTP needed). A real personal number will be declined in test mode with "Please use the test mobile money number since you are doing a test transaction."

Both paths converge on the same webhook (`routes/paystack.routes.js`): it verifies the request's signature (HMAC SHA512 against the raw request body — using `express.raw()`, not `express.json()`, since signature verification needs the exact bytes Paystack sent), and on a `charge.success` event, updates the matching `contributions` row by `reference` and notifies the user in Telegram.

### Group Management (Day 3)

- **Welcome + rules-accept flow:** New members are muted on join and shown a rules message (pulled from `group_settings`, Redis-cached) with an **Accept rules** button, checked against the joining user's own ID so only they can accept it.
- **Spam detection:** Redis counter (`spam:<chatId>:<userId>`, 60s TTL) mutes a user for 5 minutes if they exceed the group's configured `max_messages_per_minute`. **Telegram does not allow restricting group admins** — this only takes effect on regular members.
- **`/kick`** — admin-only, reply-based: reply to the offending user's message with `/kick` (ban + immediate unban).
- **Per-group settings** — rules text, welcome message, spam threshold, cached in Redis for 5 minutes.

**Required bot permissions in-group:** Delete messages, Ban users, Pin messages.

### Broadcasts & Scheduled Reminders (Day 4)

- **`/broadcast <message>`** — owner-only, sends to every group the bot is in. Paced at 50ms/send, idempotent via `broadcast_deliveries`, self-heals when a tracked group has migrated to a supergroup (Telegram changes the chat ID on migration; the service catches this specific error, updates the stored ID, and retries).
- **Daily group reminder (08:00 Africa/Nairobi)** and **7-day-overdue personal reminder (18:00)** — private DM first, falling back to a group `@mention` if the user hasn't started a private chat with the bot.

### Cron Registry (Week 21 Day 1)

All scheduled jobs are centralized in `cron/registry.js` + `cron/tasks.js`, replacing the earlier ad-hoc `cron.schedule()` calls. Six jobs:

| Job | Schedule | What it does |
|---|---|---|
| `settings-reconciliation` | 02:00 daily | Creates a default `group_settings` row for any group missing one |
| `cleanup-old-broadcasts` | 03:00 daily | Deletes `broadcasts`/`broadcast_deliveries` older than 90 days |
| `daily-owner-report` | 08:00 daily | DMs the bot owner yesterday's contribution totals |
| `daily-group-reminder` | 08:00 daily | Posts a contribution reminder in every group |
| `overdue-reminders` | 18:00 daily | Personal 7-day-overdue reminders (DM, falls back to mention) |
| `health-ping` | every 5 min | Silently checks Postgres and Redis are reachable; logs a warning if not |

Every run is logged to `cron_runs` (start time, finish time, status, duration, and the error message on failure) — a failing job never crashes the server or stops its own future runs.

---

## Admin Commands

`/broadcast` is gated by a **hardcoded Telegram user ID** (`BOT_OWNER_ID` in `message.handler.js`), rather than a database-driven admin list — deliberate, since it affects every group the bot is in, a larger blast radius than a single group's `isGroupAdmin` check (used for `/kick`). Update `BOT_OWNER_ID` to change the owner; replace with a proper `admin_users` table if the bot ever needs multiple operators.

---

## Testing Notes

- **Join/leave flows** need a second Telegram account — group owners generally can't leave their own group without transferring ownership first.
- **Spam-mute and restriction features** must be tested with a **non-admin** account — Telegram silently ignores `restrictChatMember` against admins.
- **Cron jobs**: temporarily set the schedule string to `"*/1 * * * *"` in `cron/registry.js` to fire every minute for testing, then revert before committing.
- **Paystack M-Pesa**: always use the official test number `254710000000` in test mode — a real number will be declined.
- **Paystack signature verification**: the webhook route must use `express.raw()`, not `express.json()` — parsing the body before verifying breaks the signature check, since Paystack signs the exact raw bytes it sent.

---

## Known Limitations

- Daily group reminder has no per-group opt-in/out yet — every group with a `group_settings` row receives it. Add a boolean column (e.g. `daily_reminder_enabled`) to support real opt-in.
- The 7-day-overdue reminder depends on `group_members` and `contributions` sharing consistent data — members who joined before Day 3's `chat_member` tracking existed won't be included.
- No automated tests exist; all verification has been manual, via direct interaction with the bot, its test group, and Paystack's test mode.
- The M-Pesa STK push flow's phone-number validation is a basic regex, not full E.164 validation.

---

## Troubleshooting

**Bot doesn't respond to any messages:**
1. Check ngrok's web inspector at `http://127.0.0.1:4040` for incoming requests and status codes.
2. Confirm the webhook URL is current: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`.
3. Confirm the server is running and connected to the database without errors.
4. **Check Redis is running** (`redis-cli ping` inside WSL) — a dead Redis connection can hang message handling since session state and spam detection depend on it. Restart Redis, then restart the Node server.

**`password authentication failed for user "..."`:**
Check `.env`'s `DATABASE_URL` matches the actual credentials set up in PostgreSQL.

**`permission denied for table <name>` / `must be owner of table <name>`:**
The table was created while connected as a different Postgres user than the app connects as. Grant access or transfer ownership:
```sql
GRANT ALL PRIVILEGES ON <table_name> TO telegram_user;
ALTER TABLE <table_name> OWNER TO telegram_user;
```

**`group chat was upgraded to a supergroup chat` during broadcast:**
Self-healing as of the migration fix in `broadcast.service.js` — the stored chat ID updates automatically and the send retries.

**Paystack: "Invalid phone number format" on an M-Pesa charge:**
Almost certainly the `provider` value, not the phone. It must be `"mpesa_offline"`, not `"mpesa"` — the wrong value produces this misleading error.

**Paystack: "Declined. Please use the test mobile money number...":**
Expected in test mode with a real phone number. Use `254710000000` instead.

**Testing rules-accept / spam-mute doesn't seem to work:**
Confirm you're testing as a **non-admin group member** — Telegram doesn't allow bots to restrict admin accounts.
