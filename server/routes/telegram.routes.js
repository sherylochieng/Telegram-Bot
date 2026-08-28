// // server/routes/telegram.routes.js
// const express = require("express");
// const router = express.Router();
// const telegram = require("../services/telegram.service");



// router.post("/webhook", express.json(), async (req, res) => {
//   res.json({ ok: true });
//   await telegram.processUpdate(req.body);
// });


// module.exports = router;

// // server/routes/telegram.routes.js
// const express = require("express");
// const router = express.Router();
// const telegram = require("../services/telegram.service");

// router.post("/webhook", express.json(), async (req, res) => {
//   res.json({ ok: true });
//   try {
//     await telegram.processUpdate(req.body);
//   } catch (err) {
//     console.error("Error processing Telegram update:", err);
//   }
// });

// module.exports = router;


// // server/routes/telegram.routes.js
// const express = require("express");
// const router = express.Router();
// const telegram = require("../services/telegram.service");
// router.post("/webhook", express.json(), async (req, res) => {
//   const update = req.body;

//   // Log all incoming updates
//   if (update.message) {
//     console.log("📨 UPDATE: message from", update.message.from.id, "-", update.message.text);
//   } else if (update.callback_query) {
//     console.log("🔔 UPDATE: callback_query from", update.callback_query.from.id, "-", update.callback_query.data);
//   } else if (update.edited_message) {
//     console.log("✏️ UPDATE: edited_message");
//   } else {
//     console.log("❓ UPDATE: other type -", Object.keys(update));
//   }

//   // Send response immediately to Telegram
//   res.json({ ok: true });
//   await telegram.processUpdate(req.body);

//   // Process update asynchronously
//   try {
//     await telegram.processUpdate(update);
//   } catch (err) {
//     console.error("❌ Webhook processing error:", err.message);
//   }
// });

// module.exports = router;

// server/routes/telegram.routes.js
const express = require("express");
const router = express.Router();
const telegram = require("../services/telegram.service");

router.post("/webhook", express.json(), async (req, res) => {
  const update = req.body;

  // Log all incoming updates
  if (update.message) {
    console.log("📨 UPDATE: message from", update.message.from.id, "-", update.message.text);
  } else if (update.callback_query) {
    console.log("🔔 UPDATE: callback_query from", update.callback_query.from.id, "-", update.callback_query.data);
  } else if (update.edited_message) {
    console.log("✏️ UPDATE: edited_message");
  } else {
    console.log("❓ UPDATE: other type -", Object.keys(update));
  }

  // Send response immediately to Telegram (must respond fast to avoid retries)
  res.json({ ok: true });

  // Process update asynchronously
  try {
    await telegram.processUpdate(update);
  } catch (err) {
    console.error("❌ Webhook processing error:", err.message);
  }
});

module.exports = router;