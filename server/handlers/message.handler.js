const { getSession, setSession } = require("../services/session.service");
const { confirmContribution } = require("./callback.handler");

async function handleMessage(bot, message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || "";

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

  await bot.telegram.sendMessage(chatId, `You said: ${text}`);
}

module.exports = { handleMessage };