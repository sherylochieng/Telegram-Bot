const express = require("express");
const router = express.Router();
const { bot, db } = require("../services/telegram.service");

// ─── Daraja STK push callback ───────────────────────────────────────────────
// Safaricom calls this URL once the user has responded to the STK prompt —
// either entered their PIN (success) or cancelled/let it time out (failure).
// Unlike Paystack, Daraja has no signature verification step for sandbox
// callbacks — the callback URL itself, kept private via your ngrok tunnel,
// is the main safeguard here. (Production Daraja integrations typically add
// IP allowlisting on the receiving server; not needed for sandbox testing.)
//
// The payload shape is Safaricom's own format: Body.stkCallback contains
// ResultCode (0 = success, anything else = failure/cancelled) and
// CheckoutRequestID, which is what we saved against the pending
// contribution row when the STK push was first triggered.
router.post("/callback", express.json(), async (req, res) => {
  console.log("Daraja callback received:", JSON.stringify(req.body));

  // Always acknowledge quickly — Safaricom expects a fast response and may
  // retry if it doesn't get one.
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  const callback = req.body?.Body?.stkCallback;
  if (!callback) {
    console.error("Daraja callback: unexpected payload shape");
    return;
  }

  const { CheckoutRequestID, ResultCode, ResultDesc } = callback;

  if (ResultCode !== 0) {
    // User cancelled, entered wrong PIN too many times, or it timed out.
    // Mark the row failed so it doesn't sit as 'pending' forever, and let
    // them know so they can retry.
    console.log(`Daraja: STK push ${CheckoutRequestID} failed — ${ResultDesc}`);
    try {
      const result = await db.query(
        `UPDATE contributions SET status = 'failed'
         WHERE checkout_request_id = $1 AND status = 'pending'
         RETURNING chat_id, user_id, amount`,
        [CheckoutRequestID]
      );
      if (result.rows.length > 0) {
        const { chat_id } = result.rows[0];
        await bot.telegram.sendMessage(chat_id, `Payment was not completed: ${ResultDesc}`);
      }
    } catch (err) {
      console.error("Daraja callback: error updating failed contribution:", err.message);
    }
    return;
  }

  // ResultCode === 0 means success. The actual paid amount and M-Pesa
  // receipt number are buried inside CallbackMetadata.Item, an array of
  // {Name, Value} pairs rather than a normal object — we pull out what we
  // need from it.
  const items = callback.CallbackMetadata?.Item || [];
  const getValue = (name) => items.find((i) => i.Name === name)?.Value;
  const mpesaReceiptNumber = getValue("MpesaReceiptNumber");

  console.log(`Daraja: STK push ${CheckoutRequestID} succeeded, receipt ${mpesaReceiptNumber}`);

  try {
    const result = await db.query(
      `UPDATE contributions SET status = 'completed'
       WHERE checkout_request_id = $1 AND status = 'pending'
       RETURNING chat_id, user_id, amount`,
      [CheckoutRequestID]
    );

    if (result.rows.length === 0) {
      console.log(`Daraja callback: no pending row found for CheckoutRequestID ${CheckoutRequestID}`);
      return;
    }

    const { chat_id, amount } = result.rows[0];
    await bot.telegram.sendMessage(
      chat_id,
      `✓ Payment confirmed! Your contribution of KSh ${amount} has been recorded. (M-Pesa receipt: ${mpesaReceiptNumber})`
    );
  } catch (err) {
    console.error("Daraja callback: error updating contribution:", err.message);
  }
});

module.exports = router;