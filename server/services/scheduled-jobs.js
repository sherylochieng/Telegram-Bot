const cron = require("node-cron");

// ─── Daily group reminder ───────────────────────────────────────────────────
// Runs at 08:00 Africa/Nairobi time, every day. Sends a reminder to every
// group that has opted in via group_settings.
//
// Note on opt-in: the lesson's example checks a JSONB `settings` column
// (`settings->>'daily_reminder' = 'true'`), but our group_settings table
// doesn't have that column — it has explicit typed columns instead
// (rules_text, welcome_message, etc). Rather than bolt on an unused JSONB
// column just to match the lesson snippet, we send the daily reminder to
// EVERY group with a settings row for now (since you only have one test
// group). If you want real per-group opt-in later, add a boolean column
// like `daily_reminder_enabled` to group_settings and filter on that here.
function scheduleDailyReminder(bot, db) {
  cron.schedule(
    "0 8 * * *",
    async () => {
      console.log("Running daily chama reminder");
      try {
        const { rows } = await db.query(`SELECT chat_id FROM group_settings`);

        for (const row of rows) {
          try {
            await bot.telegram.sendMessage(
              row.chat_id,
              "Good morning! Reminder: log today's contribution with /contribute"
            );
          } catch (err) {
            console.error(`Daily reminder send failed for chat ${row.chat_id}:`, err.message);
          }
          await new Promise((r) => setTimeout(r, 50)); // same 50ms pacing as broadcasts
        }
      } catch (err) {
        console.error("Daily reminder job failed:", err.message);
      }
    },
    { timezone: "Africa/Nairobi" }
  );

  console.log("Daily reminder cron scheduled (08:00 Africa/Nairobi)");
}

// ─── 7-day-overdue personal reminder ────────────────────────────────────────
// Runs at 18:00 Africa/Nairobi time, every day. Finds group members who
// haven't contributed in the last 7 days (or have never contributed) and
// tries to remind them personally.
//
// Two-tier delivery, matching the lesson exactly:
//   1. Try a PRIVATE message first (bot.telegram.sendMessage(userId, ...)).
//      This only works if the user has started a private chat with the bot
//      at some point — Telegram blocks bots from DMing users who haven't
//      initiated contact.
//   2. If that fails with 403 (user hasn't DMd the bot), fall back to
//      @mentioning them in the GROUP chat instead, using a tg://user?id=X
//      deep link with HTML parse mode. This still notifies them on most
//      Telegram clients, just publicly instead of privately.
function scheduleOverdueReminder(bot, db) {
  cron.schedule(
    "0 18 * * *",
    async () => {
      console.log("Running 7-day overdue contribution reminder");
      try {
        const { rows } = await db.query(
          `SELECT gm.chat_id, gm.user_id, gm.first_name, MAX(c.created_at) AS last_contribution
           FROM group_members gm
           LEFT JOIN contributions c ON c.user_id = gm.user_id AND c.chat_id = gm.chat_id
           WHERE gm.left_at IS NULL
           GROUP BY gm.chat_id, gm.user_id, gm.first_name
           HAVING MAX(c.created_at) < NOW() - INTERVAL '7 days' OR MAX(c.created_at) IS NULL`
        );

        for (const row of rows) {
          try {
            // Try private message first
            await bot.telegram.sendMessage(
              row.user_id,
              `Hi ${row.first_name}, friendly reminder that your chama contribution is overdue.`
            );
          } catch (err) {
            const errorCode = err.response?.error_code;
            if (errorCode === 403) {
              // User hasn't started a private chat with the bot — fall back
              // to mentioning them in the group instead
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
          await new Promise((r) => setTimeout(r, 100)); // matches lesson's pacing for this job
        }
      } catch (err) {
        console.error("Overdue reminder job failed:", err.message);
      }
    },
    { timezone: "Africa/Nairobi" }
  );

  console.log("Overdue reminder cron scheduled (18:00 Africa/Nairobi)");
}

module.exports = { scheduleDailyReminder, scheduleOverdueReminder };