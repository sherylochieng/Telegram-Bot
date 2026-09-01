// const { getSession, setSession } = require("../services/session.service");
// const { confirmContribution } = require("./callback.handler");

// async function handleMessage(bot, message) {
//   const chatId = message.chat.id;
//   const userId = message.from.id;
//   const text = message.text || "";

//   const session = await getSession(chatId, userId);

//   // State: awaiting custom contribution amount
//   if (session.state === "awaiting_custom_amount") {
//     const amount = parseInt(text, 10);
//     if (isNaN(amount) || amount <= 0) {
//       await bot.telegram.sendMessage(chatId, "Please type a number greater than 0.");
//       return;
//     }
//     await confirmContribution(bot, chatId, userId, amount);
//     return;
//   }

//   // Default: command parsing
//   if (text === "/start") {
//     await bot.telegram.sendMessage(chatId, "Welcome! Use /help for commands.");
//     return;
//   }

//   if (text === "/help") {
//     await bot.telegram.sendMessage(chatId,
//       "Available commands:\n" +
//       "/start - start the bot\n" +
//       "/help - show this message\n" +
//       "/echo <text> - echo back\n"
//     );
//     return;
//   }

//   if (text.startsWith("/echo ")) {
//     await bot.telegram.sendMessage(chatId, text.slice(6));
//     return;
//   }

//   await bot.telegram.sendMessage(chatId, `You said: ${text}`);
// }

// module.exports = { handleMessage };


//UPDATED DAY  3 SPAM CHECK

const { getSession, setSession } = require("../services/session.service");
const { confirmContribution } = require("./callback.handler");
const { getClient } = require("../config/redis"); // CHANGE 1: needed for spam counter

// ─── CHANGE 2 ───────────────────────────────────────────────────────────────
// New helper: tracks how many messages a user has sent in the current group
// within a rolling 60-second window, using Redis INCR + EXPIRE.
//
// Why Redis and not Postgres: this gets written on EVERY message, from
// every active user. Postgres would work but is slower for this kind of
// high-frequency, short-lived counter. Redis keys with a TTL are the
// standard pattern for "N per time window" checks like rate limiting.
//
// How it works:
//   - Key is spam:<chatId>:<userId>, unique per user per group.
//   - INCR increments the count and returns the new value atomically.
//   - The FIRST time a key is created (count === 1), we set it to expire
//     in 60 seconds. Every increment after that just adds to the same
//     key until it expires, then the cycle starts fresh.
async function incrementMessageCount(chatId, userId) {
  const client = await getClient();
  const key = `spam:${chatId}:${userId}`;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, 60); // reset window every 60s
  return count;
}
// ──────────────────────────────────────────────────────────────────────────

// ─── CHANGE 4 ───────────────────────────────────────────────────────────────
// New helper: checks whether a given user is an admin (or the creator) of
// a given chat. Used to gate the /kick command so only admins can run it.
//
// Why check via the Telegram API instead of our own DB: admin status can
// change at any time from within Telegram itself (promotions/demotions),
// and we don't currently sync that into our own tables. Asking Telegram
// directly (getChatMember) is always accurate, at the cost of one extra
// API call per /kick attempt — an acceptable tradeoff since /kick is rare
// compared to regular messages.
async function isGroupAdmin(bot, chatId, userId) {
  try {
    const member = await bot.telegram.getChatMember(chatId, userId);
    return member.status === "creator" || member.status === "administrator";
  } catch (err) {
    console.error("Error checking admin status:", err.message);
    return false;
  }
}
// ──────────────────────────────────────────────────────────────────────────

async function handleMessage(bot, message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || "";

  // ─── CHANGE 3 ───────────────────────────────────────────────────────────
  // Spam check runs FIRST, before any command parsing or session logic.
  // Why first: if someone is spamming, we want to mute them immediately
  // and stop processing that message any further — no point routing a
  // spam message into command handling or session state.
  //
  // We only apply this in group chats (not private chats with the bot),
  // since "spamming" only makes sense as a group-disruption concept —
  // muting someone in a 1-on-1 chat with the bot doesn't mean anything.
  if (message.chat.type === "group" || message.chat.type === "supergroup") {
    try {
      const count = await incrementMessageCount(chatId, userId);
      if (count > 10) {
        await bot.telegram.sendMessage(
          chatId,
          `${message.from.first_name} is posting too fast. Muted for 5 minutes.`
        );
        await bot.telegram.restrictChatMember(chatId, userId, {
          permissions: { can_send_messages: false },
          until_date: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
        });
        return; // stop here — don't process this message any further
      }
    } catch (err) {
      console.error("Error checking spam count:", err.message);
      // If Redis fails, we don't want to block normal bot function —
      // just log it and let the message continue processing normally.
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const session = await getSession(chatId, userId);

  // State: awaiting custom contribution amount
  if (session.state === "awaiting_custom_amount") {
    const amount = parseInt(text, 10);
    if (isNaN(amount) || amount <= 0) {
      await bot.telegram.sendMessage(chatId, "Please type a number greater than 0.");
      return;
    }
    await confirmContribution(bot, chatId, userId, amount);
    return;
  }

  // Default: command parsing
  if (text === "/start") {
    await bot.telegram.sendMessage(chatId, "Welcome! Use /help for commands.");
    return;
  }

  if (text === "/help") {
    await bot.telegram.sendMessage(chatId,
      "Available commands:\n" +
      "/start - start the bot\n" +
      "/help - show this message\n" +
      "/echo <text> - echo back\n"
    );
    return;
  }

  if (text.startsWith("/echo ")) {
    await bot.telegram.sendMessage(chatId, text.slice(6));
    return;
  }

  // ─── CHANGE 5 ───────────────────────────────────────────────────────────
  // New command: /kick, used as a REPLY to the offending user's message.
  // This is Telegram idiom for "target this user" — the admin doesn't type
  // a username or ID, they just reply to the person's message with /kick.
  //
  // Steps:
  //   1. Require it to be a reply (message.reply_to_message) — if it's not,
  //      we don't know who to kick, so we tell the admin how to use it.
  //   2. Require the caller to be a group admin (via isGroupAdmin above) —
  //      otherwise anyone could kick anyone, which defeats the purpose.
  //   3. "Kick" on Telegram = banChatMember followed immediately by
  //      unbanChatMember. A ban alone would be permanent and prevent
  //      rejoining; ban+unban removes them now but lets them rejoin later
  //      via invite link, which is the intended "kick" behavior (as
  //      opposed to a permanent ban).
  if (text === "/kick") {
    if (!message.reply_to_message) {
      await bot.telegram.sendMessage(
        chatId,
        "Reply to the user's message with /kick to remove them."
      );
      return;
    }

    if (!(await isGroupAdmin(bot, chatId, userId))) {
      await bot.telegram.sendMessage(chatId, "Only admins can kick members.");
      return;
    }

    const targetId = message.reply_to_message.from.id;
    try {
      await bot.telegram.banChatMember(chatId, targetId);
      await bot.telegram.unbanChatMember(chatId, targetId); // "kick" = ban + unban
      await bot.telegram.sendMessage(chatId, "Kicked.");
    } catch (err) {
      console.error("Error kicking member:", err.message);
      await bot.telegram.sendMessage(chatId, "Failed to kick member.");
    }
    return;
  }
  // ──────────────────────────────────────────────────────────────────────────

  await bot.telegram.sendMessage(chatId, `You said: ${text}`);
}

module.exports = { handleMessage };