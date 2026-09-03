const { Telegraf } = require("telegraf");
const { Client } = require("pg");
const env = require("../config/env");
const { handleMessage } = require("../handlers/message.handler");
const { handleCallbackQuery } = require("../handlers/callback.handler");
const { handleChatMemberUpdate } = require("../handlers/member.handler"); // CHANGE A: group management (Day 3)
const { scheduleDailyReminder } = require("./scheduled-jobs"); // CHANGE F: cron jobs (Day 4)

const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

// Database connection
let db = null;
if (process.env.DATABASE_URL) {
  db = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  db.connect()
    .then(() => {
      // ─── CHANGE G ─────────────────────────────────────────────────────────
      // Start the daily reminder cron job once we have a working DB
      // connection. We wait for the connection to succeed first because
      // the cron job needs `db` to query group_settings when it fires —
      // starting it before we know the connection works risks silent
      // failures every day at 8am if the DB was never actually available.
      scheduleDailyReminder(bot, db);
      // ──────────────────────────────────────────────────────────────────────
    })
    .catch(err => {
      console.error("Database connection error:", err.message);
      db = null;
    });
}

// Save chat to database
async function saveChat(chat) {
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO telegram_chats (id, type, title, username, last_active_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET last_active_at = NOW()`,
      [chat.id, chat.type, chat.title || null, chat.username || null]
    );
  } catch (err) {
    console.error("Error saving chat:", err.message);
  }
}

// Main menu
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "Contribute", callback_data: "contribute" }],
      [{ text: "My balance", callback_data: "balance" }],
      [{ text: "Group stats", callback_data: "stats" }],
    ],
  },
};

bot.start(async (ctx) => {
  console.log("User started bot:", ctx.from.id);
  await saveChat(ctx.message.chat);
  await ctx.reply("Welcome to Chama Bot! What would you like to do?", mainMenu);
});

bot.help(async (ctx) => {
  console.log("User requested help:", ctx.from.id);
  await saveChat(ctx.message.chat);
  await ctx.reply(
    "Available commands:\n" +
    "/start - start the bot\n" +
    "/help - show this message\n" +
    "/echo <text> - echo back\n"
  );
});

bot.command("echo", async (ctx) => {
  const text = ctx.message.text.slice(6).trim();
  await saveChat(ctx.message.chat);
  if (!text) {
    await ctx.reply("Usage: /echo <text>");
    return;
  }
  console.log("Echo command:", text);
  await ctx.reply(text);
});

bot.on("message", async (ctx) => {
  console.log("Received message:", ctx.message.text, "from", ctx.from.id);
  await saveChat(ctx.message.chat);
  await handleMessage(bot, ctx.message, db); // CHANGE B: pass db through for group settings lookup
});

bot.on("callback_query", async (ctx) => {
  console.log("🔔 CALLBACK QUERY RECEIVED:", ctx.callbackQuery.data, "from", ctx.from.id);
  try {
    await handleCallbackQuery(bot, ctx, db);
    console.log("✓ Callback handled successfully");
  } catch (err) {
    console.error("❌ Callback handler error:", err.message);
    try {
      await ctx.answerCbQuery("Error processing request");
    } catch (e) {}
  }
});

// ─── CHANGE C ─────────────────────────────────────────────────────────────
// New listener: chat_member fires when someone joins/leaves a group we're
// in. Requires "chat_member" to be in the webhook's allowed_updates (set
// via setWebhook earlier) — Telegram won't send this event otherwise.
// Delegates to handleChatMemberUpdate in member.handler.js, which handles
// the welcome/mute/rules-accept flow.
bot.on("chat_member", async (ctx) => {
  console.log("Chat member update received");
  await handleChatMemberUpdate(ctx, db);
});
// ──────────────────────────────────────────────────────────────────────────

bot.catch((err) => {
  console.error("Bot error:", err);
});

async function sendMessage(chatId, text, extra = {}) {
  return bot.telegram.sendMessage(chatId, text, extra);
}

async function processUpdate(update) {
  try {
    await bot.handleUpdate(update);
  } catch (err) {
    console.error("Update error:", err);
  }
}

module.exports = {
  bot,
  db,
  sendMessage,
  processUpdate,
  saveChat,
};