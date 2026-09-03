// ─── Broadcast service ──────────────────────────────────────────────────────
// Sends a message to every group/supergroup the bot is in, paced to avoid
// Telegram's rate limits, and idempotent — safe to resume after a crash
// without re-sending to chats that already got the message.

const RATE_MS = 50; // 50ms between sends = 20 msg/sec, under Telegram's ~30/sec global limit

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Idempotency ────────────────────────────────────────────────────────────
// Before sending to a chat, we check broadcast_deliveries for an existing
// row with status 'sent' for this (broadcast_id, chat_id) pair. If found,
// we skip it. This means if the whole process crashes partway through a
// broadcast and gets restarted with the same broadcast_id, it picks up
// exactly where it left off instead of re-sending to chats already reached.
async function alreadyDelivered(db, broadcastId, chatId) {
  const result = await db.query(
    `SELECT status FROM broadcast_deliveries WHERE broadcast_id = $1 AND chat_id = $2`,
    [broadcastId, chatId]
  );
  return result.rows.length > 0 && result.rows[0].status === "sent";
}

async function recordDelivery(db, broadcastId, chatId, status) {
  await db.query(
    `INSERT INTO broadcast_deliveries (broadcast_id, chat_id, sent_at, status)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (broadcast_id, chat_id) DO UPDATE SET sent_at = NOW(), status = $3`,
    [broadcastId, chatId, status]
  );
}

// ─── Main broadcast function ────────────────────────────────────────────────
// Creates a broadcasts row up front (so we have a broadcastId to track
// deliveries against), then loops through every group/supergroup chat and
// sends the message, handling three cases per Telegram's own error codes:
//   - 403 Forbidden: bot was removed from that chat. Delete the stale
//     telegram_chats row so future broadcasts don't waste a send on it.
//   - 429 Too Many Requests: we're being rate-limited. Telegram tells us
//     how long to wait via retry_after; we sleep that long, then retry once.
//   - Anything else: log it as failed and move on — one bad chat shouldn't
//     stop the whole broadcast.
async function broadcast(bot, db, text) {
  const broadcastResult = await db.query(
    `INSERT INTO broadcasts (text) VALUES ($1) RETURNING id`,
    [text]
  );
  const broadcastId = broadcastResult.rows[0].id;

  const { rows: chats } = await db.query(
    `SELECT id FROM telegram_chats WHERE type IN ('group', 'supergroup')`
  );

  let sent = 0;
  let failed = 0;

  for (const chat of chats) {
    const chatId = chat.id;

    // Skip if we already sent to this chat for this broadcast (idempotency)
    if (await alreadyDelivered(db, broadcastId, chatId)) {
      sent++;
      continue;
    }

    try {
      await bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML" });
      await recordDelivery(db, broadcastId, chatId, "sent");
      sent++;
    } catch (err) {
      // Telegraf's error shape: err.response?.error_code (not err.response.body.error_code
      // like node-telegram-bot-api — this is the Telegraf-specific adaptation)
      const errorCode = err.response?.error_code;

      if (errorCode === 403) {
        // Bot was removed from this chat — clean up the stale record
        await db.query(`DELETE FROM telegram_chats WHERE id = $1`, [chatId]);
        await recordDelivery(db, broadcastId, chatId, "failed_removed");
        failed++;
      } else if (err.response?.parameters?.migrate_to_chat_id) {
        // ─── CHANGE: handle group -> supergroup migration ───────────────────
        // Telegram returns this specific error when a group we have on
        // record was upgraded to a supergroup, which changes its chat_id
        // entirely. The error response includes the NEW id in
        // parameters.migrate_to_chat_id, so instead of just marking this
        // send as failed, we update our own telegram_chats row to the new
        // id and retry the send immediately — self-healing instead of
        // leaving a permanently-dead row that fails on every future
        // broadcast.
        const newChatId = err.response.parameters.migrate_to_chat_id;
        console.log(`Chat ${chatId} migrated to supergroup ${newChatId} — updating record`);
        try {
          await db.query(`UPDATE telegram_chats SET id = $1 WHERE id = $2`, [newChatId, chatId]);
          await bot.telegram.sendMessage(newChatId, text, { parse_mode: "HTML" });
          await recordDelivery(db, broadcastId, newChatId, "sent");
          sent++;
        } catch (migrateErr) {
          console.error(`Failed to handle migration for chat ${chatId}:`, migrateErr.message);
          await recordDelivery(db, broadcastId, chatId, "failed");
          failed++;
        }
        // ──────────────────────────────────────────────────────────────────
      } else if (errorCode === 429) {
        const retryAfter = (err.response?.parameters?.retry_after || 1) * 1000;
        await sleep(retryAfter);
        try {
          await bot.telegram.sendMessage(chatId, text, { parse_mode: "HTML" });
          await recordDelivery(db, broadcastId, chatId, "sent");
          sent++;
        } catch {
          await recordDelivery(db, broadcastId, chatId, "failed");
          failed++;
        }
      } else {
        console.error(`Broadcast send failed for chat ${chatId}:`, err.message);
        await recordDelivery(db, broadcastId, chatId, "failed");
        failed++;
      }
    }

    await sleep(RATE_MS);
  }

  await db.query(`UPDATE broadcasts SET completed_at = NOW() WHERE id = $1`, [broadcastId]);

  return { broadcastId, sent, failed };
}

module.exports = { broadcast };