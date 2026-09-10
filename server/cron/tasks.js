// ─── Scheduled task definitions ─────────────────────────────────────────────
// Each function here is a pure async task: it takes (bot, db) and does one
// job. The registry (registry.js) handles scheduling, timing, logging to
// cron_runs, and catching errors — these functions just do the work and
// let errors bubble up if something goes wrong.

const BOT_OWNER_ID = 656799423; // same owner ID used for /broadcast in message.handler.js

// ─── 1. Settings reconciliation ─────────────────────────────────────────────
// Lesson's "reconciliation" job compares external truth to internal state.
// We don't have an external payment provider to reconcile against yet, so
// this is adapted to a genuinely useful equivalent for this project: find
// any group in telegram_chats that's missing a group_settings row (e.g. a
// group added before group_settings existed, or one that slipped through),
// and create a default row for it. Keeps every active group's settings
// queryable instead of silently falling back to in-code defaults forever.
async function reconcileGroupSettings(bot, db) {
  const { rows } = await db.query(
    `SELECT tc.id
     FROM telegram_chats tc
     LEFT JOIN group_settings gs ON gs.chat_id = tc.id
     WHERE tc.type IN ('group', 'supergroup') AND gs.chat_id IS NULL`
  );

  for (const row of rows) {
    await db.query(
      `INSERT INTO group_settings (chat_id, rules_text, welcome_message, max_messages_per_minute, language)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (chat_id) DO NOTHING`,
      [
        row.id,
        "1. Be kind.\n2. No spam.\n3. English or Kiswahili only.",
        "Karibu! Please read and accept the rules.",
        10,
        "en",
      ]
    );
  }

  console.log(`[cron] settings-reconciliation: created ${rows.length} missing settings row(s)`);
}

// ─── 2. Cleanup old broadcasts ──────────────────────────────────────────────
// Lesson's "cleanup" deletes stale sessions/tokens. Our sessions already
// expire via Redis TTL (see session.service.js), so there's nothing stale
// to clean there. Instead, this trims old broadcast history: delivery
// records and broadcast rows older than 90 days, since that data is only
// useful for near-term auditing, not indefinitely.
async function cleanupOldBroadcasts(bot, db) {
  const deliveriesResult = await db.query(
    `DELETE FROM broadcast_deliveries
     WHERE broadcast_id IN (SELECT id FROM broadcasts WHERE created_at < NOW() - INTERVAL '90 days')`
  );
  const broadcastsResult = await db.query(
    `DELETE FROM broadcasts WHERE created_at < NOW() - INTERVAL '90 days'`
  );

  console.log(
    `[cron] cleanup-old-broadcasts: deleted ${deliveriesResult.rowCount} deliveries, ${broadcastsResult.rowCount} broadcasts`
  );
}

// ─── 3. Daily owner report ──────────────────────────────────────────────────
// Lesson's "daily report" sends the shop owner a summary via WhatsApp. We
// don't have WhatsApp wired up, so this sends the same idea via a private
// Telegram message to BOT_OWNER_ID instead — yesterday's contribution
// totals across all groups.
async function sendDailyOwnerReport(bot, db) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int AS contribution_count,
       COALESCE(SUM(amount)::int, 0) AS total_amount
     FROM contributions
     WHERE contributed_at::date = CURRENT_DATE - INTERVAL '1 day'
       AND status = 'completed'`
  );
  const r = rows[0];

  const message =
    `Yesterday's report:\n` +
    `- Contributions: ${r.contribution_count}\n` +
    `- Total: KSh ${r.total_amount.toLocaleString()}`;

  await bot.telegram.sendMessage(BOT_OWNER_ID, message);
}

// ─── 4. Daily group reminder (moved here from scheduled-jobs.js) ───────────
// Same logic as Day 4's scheduleDailyReminder, now run through the registry
// instead of its own separate cron.schedule call, so all scheduled jobs are
// visible and logged in one place.
async function sendDailyGroupReminder(bot, db) {
  const { rows } = await db.query(`SELECT chat_id FROM group_settings`);

  for (const row of rows) {
    try {
      await bot.telegram.sendMessage(
        row.chat_id,
        "Good morning! Reminder: log today's contribution with /contribute"
      );
    } catch (err) {
      console.error(`Daily group reminder send failed for chat ${row.chat_id}:`, err.message);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

// ─── 5. Overdue contribution reminder (moved here from scheduled-jobs.js) ──
// Same logic as Day 4's scheduleOverdueReminder — private DM first, falls
// back to a group @mention if the user hasn't started a private chat.
async function sendOverdueReminders(bot, db) {
  const { rows } = await db.query(
    `SELECT gm.chat_id, gm.user_id, gm.first_name, MAX(c.contributed_at) AS last_contribution
     FROM group_members gm
     LEFT JOIN contributions c ON c.user_id = gm.user_id AND c.chat_id = gm.chat_id
     WHERE gm.left_at IS NULL
     GROUP BY gm.chat_id, gm.user_id, gm.first_name
     HAVING MAX(c.contributed_at) < NOW() - INTERVAL '7 days' OR MAX(c.contributed_at) IS NULL`
  );

  for (const row of rows) {
    try {
      await bot.telegram.sendMessage(
        row.user_id,
        `Hi ${row.first_name}, friendly reminder that your chama contribution is overdue.`
      );
    } catch (err) {
      const errorCode = err.response?.error_code;
      if (errorCode === 403) {
        try {
          await bot.telegram.sendMessage(
            row.chat_id,
            `<a href="tg://user?id=${row.user_id}">${row.first_name}</a>, your contribution is overdue.`,
            { parse_mode: "HTML" }
          );
        } catch (groupErr) {
          console.error(
            `Overdue reminder group fallback failed for user ${row.user_id}:`,
            groupErr.message
          );
        }
      } else {
        console.error(`Overdue reminder failed for user ${row.user_id}:`, err.message);
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ─── 6. Health ping ──────────────────────────────────────────────────────────
// Lesson's version pings payment provider APIs. We don't have external
// payment providers integrated yet, so this checks the two things this bot
// actually depends on staying alive: Postgres and Redis. Logs a warning
// (doesn't throw) if either is unreachable — this is meant to surface
// problems in logs/cron_runs, not to crash the job.
async function healthPing(bot, db) {
  const { getClient } = require("../config/redis");

  try {
    await db.query("SELECT 1");
  } catch (err) {
    console.warn("[cron] health-ping: Postgres check failed:", err.message);
  }

  try {
    const client = await getClient();
    await client.ping();
  } catch (err) {
    console.warn("[cron] health-ping: Redis check failed:", err.message);
  }
}

module.exports = {
  reconcileGroupSettings,
  cleanupOldBroadcasts,
  sendDailyOwnerReport,
  sendDailyGroupReminder,
  sendOverdueReminders,
  healthPing,
};