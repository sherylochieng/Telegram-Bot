const express = require("express");
const router = express.Router();
const { verifyWebhookSignature } = require("../services/paystack.service");
const { bot, db } = require("../services/telegram.service");

// ─── Paystack webhook ────────────────────────────────────────────────────────
// Paystack calls this URL when a transaction's status changes (success,
// failed, etc). We use express.raw() here instead of express.json() because
// signature verification needs the EXACT raw bytes Paystack sent — parsing
// the body into a JS object first and re-stringifying it would very likely
// produce different bytes (key order, spacing) and make every signature
// check fail.
//
// Flow:
//   1. Verify the x-paystack-signature header against our own computed
//      signature of the raw body. If it doesn't match, reject — this
//      request did not genuinely come from Paystack.
//   2. Parse the (now-verified) body as JSON.
//   3. On a "charge.success" event, find the matching `contributions` row
//      by its `reference` (the one we generated and saved as 'pending'
//      when the payment link was created) and mark it 'completed'.
//   4. Notify the user in Telegram that their contribution went through.
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  const rawBody = req.body; // a Buffer, thanks to express.raw()

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    console.error("Paystack webhook: invalid signature — rejecting");
    return res.status(401).send("Invalid signature");
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch (err) {
    console.error("Paystack webhook: failed to parse body:", err.message);
    return res.status(400).send("Invalid payload");
  }

  // Always respond 200 quickly so Paystack doesn't retry unnecessarily —
  // we do the actual work below, but Paystack just needs to know we
  // received it.
  res.status(200).send("OK");

  if (event.event !== "charge.success") {
    console.log(`Paystack webhook: ignoring event type "${event.event}"`);
    return;
  }

  const reference = event.data.reference;
  console.log("Paystack webhook: charge.success for reference", reference);

  try {
    const result = await db.query(
      `UPDATE contributions SET status = 'completed'
       WHERE reference = $1 AND status = 'pending'
       RETURNING chat_id, user_id, amount`,
      [reference]
    );

    if (result.rows.length === 0) {
      console.log(`Paystack webhook: no pending row found for reference ${reference}`);
      return;
    }

    const { chat_id, user_id, amount } = result.rows[0];
    await bot.telegram.sendMessage(
      chat_id,
      `✓ Payment confirmed! Your contribution of KSh ${amount} has been recorded.`
    );
  } catch (err) {
    console.error("Paystack webhook: error updating contribution:", err.message);
  }
});

module.exports = router;