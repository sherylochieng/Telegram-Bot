const { getSession, setSession } = require("../services/session.service");
const { initializeTransaction } = require("../services/paystack.service"); // CHANGE 14: card/Airtel Money payment link

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

// ─── CHANGE 12 ───────────────────────────────────────────────────────────────
// Real balance lookup, replacing the "coming soon" stub. Balance = total
// amount this user has ever contributed in THIS chat (a chama group's
// balance is naturally scoped per-group, since someone could be in multiple
// groups with separate contribution histories).
async function showBalance(bot, chatId, userId, db) {
  if (!db) {
    await bot.telegram.sendMessage(chatId, "Balance is unavailable right now. Try again shortly.");
    return;
  }

  try {
    const result = await db.query(
      `SELECT COALESCE(SUM(amount), 0)::int AS total
       FROM contributions
       WHERE chat_id = $1 AND user_id = $2 AND status = 'completed'`,
      [chatId, userId]
    );
    const total = result.rows[0].total;
    await bot.telegram.sendMessage(chatId, `Your total contribution: KSh ${total.toLocaleString()}`);
  } catch (err) {
    console.error("Error fetching balance:", err.message);
    await bot.telegram.sendMessage(chatId, "Couldn't fetch your balance. Please try again.");
  }
}
// ──────────────────────────────────────────────────────────────────────────

// ─── CHANGE 13 ───────────────────────────────────────────────────────────────
// Real group stats, replacing the "coming soon" stub. Shows total
// contributed by the whole group, number of contributions, and number of
// distinct members who've contributed at least once — all scoped to this
// chat only.
//
// ─── CHANGE 16 ────────────────────────────────────────────────────────────
// Extended to also list a PER-MEMBER breakdown: each contributing member's
// name and their individual total, sorted highest-to-lowest. Uses
// group_members for first_name (since contributions only stores user_id,
// not a display name), and falls back to the raw Telegram ID if for some
// reason a member row is missing (e.g. they joined before Day 3's
// chat_member tracking existed).
async function showStats(bot, chatId, db) {
  if (!db) {
    await bot.telegram.sendMessage(chatId, "Group stats are unavailable right now. Try again shortly.");
    return;
  }

  try {
    const summaryResult = await db.query(
      `SELECT
         COALESCE(SUM(amount), 0)::int AS total,
         COUNT(*)::int AS contribution_count,
         COUNT(DISTINCT user_id)::int AS contributor_count
       FROM contributions
       WHERE chat_id = $1 AND status = 'completed'`,
      [chatId]
    );
    const r = summaryResult.rows[0];

    const perMemberResult = await db.query(
      `SELECT
         c.user_id,
         COALESCE(gm.first_name, c.user_id::text) AS display_name,
         SUM(c.amount)::int AS member_total
       FROM contributions c
       LEFT JOIN group_members gm ON gm.chat_id = c.chat_id AND gm.user_id = c.user_id
       WHERE c.chat_id = $1 AND c.status = 'completed'
       GROUP BY c.user_id, gm.first_name
       ORDER BY member_total DESC`,
      [chatId]
    );

    let message =
      `Group stats:\n` +
      `- Total contributed: KSh ${r.total.toLocaleString()}\n` +
      `- Contributions made: ${r.contribution_count}\n` +
      `- Members who've contributed: ${r.contributor_count}\n\n` +
      `Per member:\n`;

    if (perMemberResult.rows.length === 0) {
      message += "No contributions recorded yet.";
    } else {
      message += perMemberResult.rows
        .map((row) => `- ${row.display_name}: KSh ${row.member_total.toLocaleString()}`)
        .join("\n");
    }

    await bot.telegram.sendMessage(chatId, message);
  } catch (err) {
    console.error("Error fetching group stats:", err.message);
    await bot.telegram.sendMessage(chatId, "Couldn't fetch group stats. Please try again.");
  }
}
// ──────────────────────────────────────────────────────────────────────────

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
    await showBalance(bot, chatId, userId, db);
  } else if (data === "stats") {
    console.log("→ Routing to showStats");
    await showStats(bot, chatId, db);

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
    console.log("→ Confirming contribution — asking payment method");

    // ─── CHANGE 18 ────────────────────────────────────────────────────────
    // Instead of jumping straight to a card payment link, ask which
    // payment method the user wants first. Card and Airtel Money both use
    // Paystack's hosted checkout page (a link) — no STK-push equivalent
    // exists for those. M-Pesa DOES support a direct STK push via
    // Paystack's Charge API, which is a noticeably better experience (a
    // native phone prompt, no browser at all) — so it gets its own path.
    await bot.telegram.sendMessage(chatId, "How would you like to pay?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Card / Airtel Money", callback_data: "pay:card" }],
          [{ text: "M-Pesa", callback_data: "pay:mpesa" }],
        ],
      },
    });
    // ──────────────────────────────────────────────────────────────────────
  } else if (data === "pay:card") {
    console.log("→ Card/Airtel Money payment selected");
    const session = await getSession(chatId, userId);
    const amount = session.context.amount;

    // Same card/Airtel Money flow as before (CHANGE 15), now triggered by
    // an explicit method choice instead of running automatically.
    try {
      const { reference, authorizationUrl } = await initializeTransaction({
        chatId,
        userId,
        amount,
      });

      if (db) {
        await db.query(
          `INSERT INTO contributions (chat_id, user_id, amount, status, reference)
           VALUES ($1, $2, $3, 'pending', $4)`,
          [chatId, userId, amount, reference]
        );
      }

      await bot.telegram.sendMessage(chatId, `Tap below to complete your KSh ${amount} contribution:`, {
        reply_markup: {
          inline_keyboard: [[{ text: "Pay now", url: authorizationUrl }]],
        },
      });

      await setSession(chatId, userId, { state: "idle", context: {} });
    } catch (err) {
      console.error("Error initializing payment:", err.message);
      await bot.telegram.sendMessage(chatId, "Couldn't start payment. Please try again.");
    }
  } else if (data === "pay:mpesa") {
    console.log("→ M-Pesa payment selected — asking for phone number");

    // ─── CHANGE 19 ────────────────────────────────────────────────────────
    // M-Pesa's STK push needs a phone number to send the prompt to — we
    // don't have one on file for the user, so we ask for it and store the
    // "awaiting_mpesa_phone" state. The actual charge call happens in
    // message.handler.js once they reply with a number (see that file for
    // the continuation of this flow).
    const session = await getSession(chatId, userId);
    const amount = session.context.amount;
    await setSession(chatId, userId, { state: "awaiting_mpesa_phone", context: { amount } });
    await bot.telegram.sendMessage(
      chatId,
      "Enter your M-Pesa phone number (format: 2547XXXXXXXX):"
    );
    // ──────────────────────────────────────────────────────────────────────
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