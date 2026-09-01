// const { getSession, setSession } = require("../services/session.service");

// async function promptContribution(bot, chatId, userId) {
//   await setSession(chatId, userId, { state: "awaiting_amount", context: {} });
//   await bot.telegram.sendMessage(chatId, "How much are you contributing?", {
//     reply_markup: {
//       inline_keyboard: [
//         [
//           { text: "KSh 500", callback_data: "amt:500" },
//           { text: "KSh 1000", callback_data: "amt:1000" },
//           { text: "KSh 2000", callback_data: "amt:2000" },
//         ],
//         [{ text: "Custom amount", callback_data: "amt:custom" }],
//       ],
//     },
//   });
// }

// async function confirmContribution(bot, chatId, userId, amount) {
//   await setSession(chatId, userId, { state: "confirming", context: { amount } });
//   await bot.telegram.sendMessage(chatId, `Confirm contribution of KSh ${amount}?`, {
//     reply_markup: {
//       inline_keyboard: [
//         [
//           { text: "Yes, contribute", callback_data: "cnf:yes" },
//           { text: "Cancel", callback_data: "cnf:no" },
//         ],
//       ],
//     },
//   });
// }

// async function showBalance(bot, chatId, userId) {
//   // TODO: Fetch user balance from contributions table
//   await bot.telegram.sendMessage(chatId, "Balance view coming soon.");
// }

// async function showStats(bot, chatId) {
//   // TODO: Fetch group stats from contributions table
//   await bot.telegram.sendMessage(chatId, "Group stats coming soon.");
// }

// async function handleCallbackQuery(bot, ctx, db) {
//   const query = ctx.callbackQuery;
//   const chatId = query.message.chat.id;
//   const data = query.data;
//   const userId = query.from.id;

//   console.log("📍 handleCallbackQuery - data:", data, "chatId:", chatId, "userId:", userId);

//   // Always acknowledge so the spinning icon goes away
//   await ctx.answerCbQuery();

//   if (data === "contribute") {
//     console.log("→ Routing to promptContribution");
//     await promptContribution(bot, chatId, userId);
//   } else if (data === "balance") {
//     console.log("→ Routing to showBalance");
//     await showBalance(bot, chatId, userId);
//   } else if (data === "stats") {
//     console.log("→ Routing to showStats");
//     await showStats(bot, chatId);
//   } else if (data.startsWith("amt:")) {
//     const amount = parseInt(data.slice(4), 10);
//     console.log("→ Routing to confirmContribution, amount:", amount);
//     await confirmContribution(bot, chatId, userId, amount);
//   } else if (data === "amt:custom") {
//     console.log("→ Routing to custom amount prompt");
//     await setSession(chatId, userId, { state: "awaiting_custom_amount", context: {} });
//     await bot.telegram.sendMessage(chatId, "Type the amount in KSh:");
//   } else if (data === "cnf:yes") {
//     console.log("→ Confirming contribution");
//     const session = await getSession(chatId, userId);
//     const amount = session.context.amount;

//     try {
//       // Write contribution to database
//       if (db) {
//         await db.query(
//           `INSERT INTO contributions (chat_id, user_id, amount, status)
//            VALUES ($1, $2, $3, 'completed')`,
//           [chatId, userId, amount]
//         );
//         console.log("✓ Saved to DB - chatId:", chatId, "userId:", userId, "amount:", amount);
//       }

//       await bot.telegram.sendMessage(chatId, `✓ Contribution of KSh ${amount} recorded!`);
//       await setSession(chatId, userId, { state: "idle", context: {} });
//     } catch (err) {
//       console.error("Error saving contribution:", err.message);
//       await bot.telegram.sendMessage(chatId, "Error saving contribution. Please try again.");
//     }
//   } else if (data === "cnf:no") {
//     console.log("→ Cancelling contribution");
//     await bot.telegram.sendMessage(chatId, "Contribution cancelled.");
//     await setSession(chatId, userId, { state: "idle", context: {} });
//   } else {
//     console.log("⚠️ Unknown callback data:", data);
//   }
// }

// module.exports = {
//   handleCallbackQuery,
//   promptContribution,
//   confirmContribution,
//   showBalance,
//   showStats,
// };
// const { getSession, setSession } = require("../services/session.service");

// async function promptContribution(bot, chatId, userId) {
//   await setSession(chatId, userId, { state: "awaiting_amount", context: {} });
//   await bot.telegram.sendMessage(chatId, "How much are you contributing?", {
//     reply_markup: {
//       inline_keyboard: [
//         [
//           { text: "KSh 500", callback_data: "amt:500" },
//           { text: "KSh 1000", callback_data: "amt:1000" },
//           { text: "KSh 2000", callback_data: "amt:2000" },
//         ],
//         [{ text: "Custom amount", callback_data: "amt:custom" }],
//       ],
//     },
//   });
// }

// async function confirmContribution(bot, chatId, userId, amount) {
//   await setSession(chatId, userId, { state: "confirming", context: { amount } });
//   await bot.telegram.sendMessage(chatId, `Confirm contribution of KSh ${amount}?`, {
//     reply_markup: {
//       inline_keyboard: [
//         [
//           { text: "Yes, contribute", callback_data: "cnf:yes" },
//           { text: "Cancel", callback_data: "cnf:no" },
//         ],
//       ],
//     },
//   });
// }

// async function showBalance(bot, chatId, userId) {
//   // TODO: Fetch user balance from contributions table
//   await bot.telegram.sendMessage(chatId, "Balance view coming soon.");
// }

// async function showStats(bot, chatId) {
//   // TODO: Fetch group stats from contributions table
//   await bot.telegram.sendMessage(chatId, "Group stats coming soon.");
// }

// async function handleCallbackQuery(bot, ctx, db) {
//   const query = ctx.callbackQuery;
//   const chatId = query.message.chat.id;
//   const data = query.data;
//   const userId = query.from.id;

//   console.log("📍 handleCallbackQuery - data:", data, "chatId:", chatId, "userId:", userId);

//   // Always acknowledge so the spinning icon goes away
//   await ctx.answerCbQuery();

//   if (data === "contribute") {
//     console.log("→ Routing to promptContribution");
//     await promptContribution(bot, chatId, userId);
//   } else if (data === "balance") {
//     console.log("→ Routing to showBalance");
//     await showBalance(bot, chatId, userId);
//   } else if (data === "stats") {
//     console.log("→ Routing to showStats");
//     await showStats(bot, chatId);

//     // FIX: "amt:custom" moved ABOVE the "amt:" startsWith check.
//     // Previously data.startsWith("amt:") matched "amt:custom" too (since
//     // "amt:custom" starts with "amt:"), so this branch was unreachable —
//     // tapping "Custom amount" fell into the amount-parsing branch instead,
//     // producing parseInt("custom") => NaN and a broken "KSh NaN" message.
//   } else if (data === "amt:custom") {
//     console.log("→ Routing to custom amount prompt");
//     await setSession(chatId, userId, { state: "awaiting_custom_amount", context: {} });
//     await bot.telegram.sendMessage(chatId, "Type the amount in KSh:");
//   } else if (data.startsWith("amt:")) {
//     const amount = parseInt(data.slice(4), 10);
//     console.log("→ Routing to confirmContribution, amount:", amount);
//     await confirmContribution(bot, chatId, userId, amount);
//   } else if (data === "cnf:yes") {
//     console.log("→ Confirming contribution");
//     const session = await getSession(chatId, userId);
//     const amount = session.context.amount;

//     try {
//       // Write contribution to database
//       if (db) {
//         await db.query(
//           `INSERT INTO contributions (chat_id, user_id, amount, status)
//            VALUES ($1, $2, $3, 'completed')`,
//           [chatId, userId, amount]
//         );
//         console.log("✓ Saved to DB - chatId:", chatId, "userId:", userId, "amount:", amount);
//       }

//       await bot.telegram.sendMessage(chatId, `✓ Contribution of KSh ${amount} recorded!`);
//       await setSession(chatId, userId, { state: "idle", context: {} });
//     } catch (err) {
//       console.error("Error saving contribution:", err.message);
//       await bot.telegram.sendMessage(chatId, "Error saving contribution. Please try again.");
//     }
//   } else if (data === "cnf:no") {
//     console.log("→ Cancelling contribution");
//     await bot.telegram.sendMessage(chatId, "Contribution cancelled.");
//     await setSession(chatId, userId, { state: "idle", context: {} });
//   } 
//     } else if (data.startsWith("acc:")) {
//     const allowedUserId = parseInt(data.slice(4), 10);
//     console.log("→ Routing to accept rules, allowedUserId:", allowedUserId);

//     if (userId !== allowedUserId) {
//       await ctx.answerCbQuery("This button is not for you.", { show_alert: true });
//       return;
//     }

//     try {
//       await bot.telegram.restrictChatMember(chatId, allowedUserId, {
//         permissions: {
//           can_send_messages: true,
//           can_send_audios: true,
//           can_send_documents: true,
//           can_send_photos: true,
//           can_send_videos: true,
//           can_send_video_notes: true,
//           can_send_voice_notes: true,
//           can_send_polls: true,
//           can_send_other_messages: true,
//           can_add_web_page_previews: true,
//         },
//       });

//       await bot.telegram.editMessageText(
//         chatId,
//         query.message.message_id,
//         undefined,
//         `Thanks ${query.from.first_name}! You can now participate.`
//       );
//     } catch (err) {
//       console.error("Error accepting rules:", err.message);
//     }
  
//   else {
//     console.log("⚠️ Unknown callback data:", data);
//   }
// }

// module.exports = {
//   handleCallbackQuery,
//   promptContribution,
//   confirmContribution,
//   showBalance,
//   showStats,
// };

//UPDATED DAY 3

const { getSession, setSession } = require("../services/session.service");

async function promptContribution(bot, chatId, userId) {
  await setSession(chatId, userId, { state: "awaiting_amount", context: {} });
  await bot.telegram.sendMessage(chatId, "How much are you contributing?", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "KSh 500", callback_data: "amt:500" },
          { text: "KSh 1000", callback_data: "amt:1000" },
          { text: "KSh 2000", callback_data: "amt:2000" },
        ],
        [{ text: "Custom amount", callback_data: "amt:custom" }],
      ],
    },
  });
}

async function confirmContribution(bot, chatId, userId, amount) {
  await setSession(chatId, userId, { state: "confirming", context: { amount } });
  await bot.telegram.sendMessage(chatId, `Confirm contribution of KSh ${amount}?`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Yes, contribute", callback_data: "cnf:yes" },
          { text: "Cancel", callback_data: "cnf:no" },
        ],
      ],
    },
  });
}

async function showBalance(bot, chatId, userId) {
  // TODO: Fetch user balance from contributions table
  await bot.telegram.sendMessage(chatId, "Balance view coming soon.");
}

async function showStats(bot, chatId) {
  // TODO: Fetch group stats from contributions table
  await bot.telegram.sendMessage(chatId, "Group stats coming soon.");
}

async function handleCallbackQuery(bot, ctx, db) {
  const query = ctx.callbackQuery;
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id;

  console.log("📍 handleCallbackQuery - data:", data, "chatId:", chatId, "userId:", userId);

  // ─── CHANGE 1 ───────────────────────────────────────────────────────────
  // Added this early check for "acc:" (accept-rules) callbacks, BEFORE the
  // blanket ctx.answerCbQuery() below.
  //
  // Why: a Telegram callback query can only be "answered" once. The old code
  // always called ctx.answerCbQuery() unconditionally first. But the accept-
  // rules button needs to reject clicks from the WRONG user (someone other
  // than the person who joined) with a special alert message via
  // answerCbQuery(text, {show_alert:true}). If we'd already answered it
  // blank a few lines above, that second "wrong user" answer would fail
  // silently since Telegram only accepts one answer per callback query.
  // So we check identity here, first, and return early if it's not their
  // button — before anything else touches this callback query.
  if (data.startsWith("acc:")) {
    const allowedUserId = parseInt(data.slice(4), 10);
    if (userId !== allowedUserId) {
      await ctx.answerCbQuery("This button is not for you.", { show_alert: true });
      return;
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // Always acknowledge so the spinning icon goes away
  await ctx.answerCbQuery();

  if (data === "contribute") {
    console.log("→ Routing to promptContribution");
    await promptContribution(bot, chatId, userId);
  } else if (data === "balance") {
    console.log("→ Routing to showBalance");
    await showBalance(bot, chatId, userId);
  } else if (data === "stats") {
    console.log("→ Routing to showStats");
    await showStats(bot, chatId);

    // FIX: "amt:custom" moved ABOVE the "amt:" startsWith check.
    // Previously data.startsWith("amt:") matched "amt:custom" too (since
    // "amt:custom" starts with "amt:"), so this branch was unreachable —
    // tapping "Custom amount" fell into the amount-parsing branch instead,
    // producing parseInt("custom") => NaN and a broken "KSh NaN" message.
  } else if (data === "amt:custom") {
    console.log("→ Routing to custom amount prompt");
    await setSession(chatId, userId, { state: "awaiting_custom_amount", context: {} });
    await bot.telegram.sendMessage(chatId, "Type the amount in KSh:");
  } else if (data.startsWith("amt:")) {
    const amount = parseInt(data.slice(4), 10);
    console.log("→ Routing to confirmContribution, amount:", amount);
    await confirmContribution(bot, chatId, userId, amount);
  } else if (data === "cnf:yes") {
    console.log("→ Confirming contribution");
    const session = await getSession(chatId, userId);
    const amount = session.context.amount;

    try {
      // Write contribution to database
      if (db) {
        await db.query(
          `INSERT INTO contributions (chat_id, user_id, amount, status)
           VALUES ($1, $2, $3, 'completed')`,
          [chatId, userId, amount]
        );
        console.log("✓ Saved to DB - chatId:", chatId, "userId:", userId, "amount:", amount);
      }

      await bot.telegram.sendMessage(chatId, `✓ Contribution of KSh ${amount} recorded!`);
      await setSession(chatId, userId, { state: "idle", context: {} });
    } catch (err) {
      console.error("Error saving contribution:", err.message);
      await bot.telegram.sendMessage(chatId, "Error saving contribution. Please try again.");
    }
  } else if (data === "cnf:no") {
    console.log("→ Cancelling contribution");
    await bot.telegram.sendMessage(chatId, "Contribution cancelled.");
    await setSession(chatId, userId, { state: "idle", context: {} });

    // ─── CHANGE 2 ─────────────────────────────────────────────────────────
    // New branch: handles the "Accept rules" button added in Week 20 Day 3
    // (group management). When a new member joins a group, member.handler.js
    // mutes them and sends this button with callback_data "acc:<their_id>".
    // Identity was already verified above (CHANGE 1), so by the time we get
    // here we know it's safe to unmute this user.
    //
    // What it does:
    //   1. Un-restricts the member so they can send messages/media again
    //      (they were muted on join in member.handler.js).
    //   2. Edits the original rules message to a short thank-you, so the
    //      Accept button disappears and the chat shows they're confirmed.
  } else if (data.startsWith("acc:")) {
    const allowedUserId = parseInt(data.slice(4), 10);
    console.log("→ Accepting rules for user:", allowedUserId);

    try {
      await bot.telegram.restrictChatMember(chatId, allowedUserId, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
        },
      });

      await bot.telegram.editMessageText(
        chatId,
        query.message.message_id,
        undefined,
        `Thanks ${query.from.first_name}! You can now participate.`
      );
    } catch (err) {
      console.error("Error accepting rules:", err.message);
    }
    // ────────────────────────────────────────────────────────────────────────
  } else {
    console.log("⚠️ Unknown callback data:", data);
  }
}

module.exports = {
  handleCallbackQuery,
  promptContribution,
  confirmContribution,
  showBalance,
  showStats,
};