// ─── Cron job registry ───────────────────────────────────────────────────────
// Single place where every scheduled job in this project is defined. Adding
// a new job means adding one object to `jobs` and writing its function in
// tasks.js — no scattered cron.schedule() calls across the codebase.

const cron = require("node-cron");
const tasks = require("./tasks");

const jobs = [
  {
    name: "settings-reconciliation",
    schedule: "0 2 * * *", // 02:00 daily
    timezone: "Africa/Nairobi",
    run: tasks.reconcileGroupSettings,
  },
  {
    name: "cleanup-old-broadcasts",
    schedule: "0 3 * * *", // 03:00 daily
    timezone: "Africa/Nairobi",
    run: tasks.cleanupOldBroadcasts,
  },
  {
    name: "daily-owner-report",
    schedule: "0 8 * * *", // 08:00 daily
    // schedule: "*/1 * * * *", // TEMP: every minute for testing — change back to "0 8 * * *" after confirming it works
    timezone: "Africa/Nairobi",
    run: tasks.sendDailyOwnerReport,
  },
  {
    name: "daily-group-reminder",
    schedule: "0 8 * * *", // 08:00 daily
    timezone: "Africa/Nairobi",
    run: tasks.sendDailyGroupReminder,
  },
  {
    name: "overdue-reminders",
    schedule: "0 18 * * *", // 18:00 daily
    timezone: "Africa/Nairobi",
    run: tasks.sendOverdueReminders,
  },
  {
    name: "health-ping",
    schedule: "*/5 * * * *", // every 5 minutes
    timezone: "Africa/Nairobi",
    run: tasks.healthPing,
  },
];

// ─── Logged, error-safe job runner ──────────────────────────────────────────
// Wraps a single job's execution with:
//   1. An INSERT into cron_runs before it starts (status 'running'), so a
//      run that's currently in progress (or that crashed the whole process
//      mid-run) is still visible in the audit table.
//   2. An UPDATE to 'success' or 'failed' when it finishes, with duration
//      and (on failure) the error message.
//   3. A try/catch around the job itself — a thrown error is logged and
//      swallowed here, so it never crashes the server or prevents cron
//      from firing this same job again at its next scheduled time.
async function runJobWithLogging(job, bot, db) {
  let runId = null;

  try {
    const insertResult = await db.query(
      `INSERT INTO cron_runs (job_name, status) VALUES ($1, 'running') RETURNING id`,
      [job.name]
    );
    runId = insertResult.rows[0].id;
  } catch (err) {
    console.error(`[cron] ${job.name}: failed to write run-start log:`, err.message);
  }

  const start = Date.now();
  console.log(`[cron] ${job.name} starting`);

  try {
    await job.run(bot, db);
    const duration = Date.now() - start;
    console.log(`[cron] ${job.name} finished in ${duration}ms`);

    if (runId) {
      await db.query(
        `UPDATE cron_runs SET finished_at = NOW(), status = 'success', duration_ms = $1 WHERE id = $2`,
        [duration, runId]
      );
    }
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`[cron] ${job.name} failed:`, err.message);

    if (runId) {
      try {
        await db.query(
          `UPDATE cron_runs SET finished_at = NOW(), status = 'failed', error_message = $1, duration_ms = $2 WHERE id = $3`,
          [err.message, duration, runId]
        );
      } catch (logErr) {
        console.error(`[cron] ${job.name}: failed to write failure log:`, logErr.message);
      }
    }
  }
}

// ─── Start every job ────────────────────────────────────────────────────────
// Called once from telegram.service.js after the DB connection is confirmed
// working (jobs need `db` to run their queries).
function startAll(bot, db) {
  for (const job of jobs) {
    cron.schedule(
      job.schedule,
      () => runJobWithLogging(job, bot, db),
      { timezone: job.timezone }
    );
    console.log(`[cron] scheduled ${job.name} (${job.schedule}, ${job.timezone})`);
  }
}

module.exports = { startAll };