const { getClient } = require("../config/redis");

// ─── Per-group settings with Redis caching ─────────────────────────────────
// Why cache: settings are read on nearly every message (for the spam
// threshold) and every join (for welcome/rules text). Hitting Postgres that
// often for data that rarely changes is wasteful. Instead we cache each
// group's settings in Redis for 5 minutes — a good balance between "changes
// take effect reasonably fast" and "we're not hammering Postgres."
//
// Cache key: settings:<chatId>
// TTL: 300 seconds (5 minutes), matching the lesson's "reads new values
// within 5 minutes" checkpoint.
const CACHE_TTL_SECONDS = 300;

async function getGroupSettings(db, chatId) {
  const cacheKey = `settings:${chatId}`;
  const client = await getClient();

  // 1. Try Redis first
  try {
    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error("Error reading settings from cache:", err.message);
    // fall through to Postgres if Redis read fails
  }

  // 2. Cache miss (or Redis error) — read from Postgres
  let settings = defaultSettings();
  if (db) {
    try {
      const result = await db.query(
        `SELECT rules_text, welcome_message, max_messages_per_minute, language
         FROM group_settings WHERE chat_id = $1`,
        [chatId]
      );
      if (result.rows.length > 0) {
        settings = result.rows[0];
      }
    } catch (err) {
      console.error("Error reading settings from DB:", err.message);
      // fall back to defaults below
    }
  }

  // 3. Populate cache for next time (best-effort — don't fail the request
  //    if this write doesn't work)
  try {
    await client.set(cacheKey, JSON.stringify(settings), { EX: CACHE_TTL_SECONDS });
  } catch (err) {
    console.error("Error writing settings to cache:", err.message);
  }

  return settings;
}

// Fallback used when a group has no row in group_settings yet, or the DB
// read fails — keeps the bot functional with sane defaults rather than
// crashing or sending blank messages.
function defaultSettings() {
  return {
    rules_text: "1. Be kind.\n2. No spam.\n3. English or Kiswahili only.",
    welcome_message: "Karibu! Please read and accept the rules.",
    max_messages_per_minute: 10,
    language: "en",
  };
}

module.exports = { getGroupSettings };