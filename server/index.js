// require('dotenv').config();
// const express = require("express");
// const app = express();
// const PORT = process.env.PORT || 3000;
// const telegram = require("./services/telegram.service");
// const env = require("./config/env");

// app.use("/telegram", require("./routes/telegram.routes"));

// const server = app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });

// // Launch bot
// (async () => {
//   try {
//     if (env.PUBLIC_URL) {
//       const webhookUrl = `${env.PUBLIC_URL}/telegram/webhook`;
//       console.log("Registering webhook at:", webhookUrl);
//       await telegram.bot.telegram.setWebhook(webhookUrl);
//       console.log("✓ Webhook registered");
//       console.log("Bot is ready to receive webhook updates");
//     } else {
//       console.log("No PUBLIC_URL set, launching in polling mode");
//       await telegram.bot.launch();
//       console.log("✓ Bot polling started");
//     }
//   } catch (err) {
//     console.error("Failed to launch bot:", err.message);
//   }
// })();

// // // Graceful shutdown
// // process.once("SIGINT", () => {
// //   console.log("Shutting down...");
// //   telegram.bot.stop("SIGINT");
// //   server.close();
// // });

// // process.once("SIGTERM", () => {
// //   console.log("Shutting down...");
// //   telegram.bot.stop("SIGTERM");
// //   server.close();
// // });
// ;
// // Graceful shutdown
// async function shutdown(signal) {
//   console.log("Shutting down...");
//   try {
//     if (telegram.bot) {
//       await telegram.bot.stop(signal).catch(() => {});
//     }
//   } catch (e) {}
//   try {
//     if (telegram.db) {
//       await telegram.db.end().catch(() => {});
//     }
//   } catch (e) {}
//   server.close();
//   process.exit(0);
// }

// process.once("SIGINT", () => shutdown("SIGINT"));
// process.once("SIGTERM", () => shutdown("SIGTERM"));

// function closeServer() {
//   return new Promise((resolve) => {
//     server.close(() => resolve());
//   });
// }

// async function shutdown(signal) {
//   console.log("Shutting down...");

//   // Force-exit if graceful shutdown takes too long
//   const forceExit = setTimeout(() => {
//     console.error("Forced shutdown after timeout");
//     process.exit(1);
//   }, 10000);
//   forceExit.unref();

//   try {
//     if (telegram.bot) {
//       await telegram.bot.stop(signal).catch(() => {});
//     }
//   } catch (e) {}

//   try {
//     if (telegram.db) {
//       await telegram.db.end().catch(() => {});
//     }
//   } catch (e) {}

//   try {
//     await closeServer();
//   } catch (e) {}

//   clearTimeout(forceExit);
//   process.exit(0);
// }

// process.once("SIGINT", () => shutdown("SIGINT"));
// process.once("SIGTERM", () => shutdown("SIGTERM"));

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
function closeServer() {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function shutdown(signal) {
  console.log("Shutting down...");

  // Force-exit if graceful shutdown takes too long
  const forceExit = setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    if (telegram.bot) {
      await telegram.bot.stop(signal).catch(() => {});
    }
  } catch (e) {}

  try {
    if (telegram.db) {
      await telegram.db.end().catch(() => {});
    }
  } catch (e) {}

  try {
    await closeServer();
  } catch (e) {}

  clearTimeout(forceExit);
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));