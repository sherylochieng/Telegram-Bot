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

module.exports = { scheduleDailyReminder };