require('dotenv').config();
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;
const telegram = require("./services/telegram.service");
const env = require("./config/env");

app.use("/telegram", require("./routes/telegram.routes"));

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Launch bot
(async () => {
  try {
    if (env.PUBLIC_URL) {
      const webhookUrl = `${env.PUBLIC_URL}/telegram/webhook`;
      console.log("Registering webhook at:", webhookUrl);
      await telegram.bot.telegram.setWebhook(webhookUrl);
      console.log("✓ Webhook registered");
      console.log("Bot is ready to receive webhook updates");
    } else {
      console.log("No PUBLIC_URL set, launching in polling mode");
      await telegram.bot.launch();
      console.log("✓ Bot polling started");
    }
  } catch (err) {
    console.error("Failed to launch bot:", err.message);
  }
})();

// Graceful shutdown
process.once("SIGINT", () => {
  console.log("Shutting down...");
  telegram.bot.stop("SIGINT");
  server.close();
});

process.once("SIGTERM", () => {
  console.log("Shutting down...");
  telegram.bot.stop("SIGTERM");
  server.close();
});