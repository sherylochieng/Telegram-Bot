const crypto = require("crypto");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// ─── Initialize a transaction ───────────────────────────────────────────────
// Calls Paystack's /transaction/initialize endpoint, which returns an
// authorization_url — a hosted Paystack payment page we send the user as a
// link. Paystack requires an email per transaction; since Telegram users
// don't have one, we generate a placeholder (fine for test mode, since no
// real email is ever contacted).
//
// `reference` is OUR unique ID for this transaction (not Paystack's) — we
// generate it up front so we can save a `pending` row in `contributions`
// immediately, then match it against the webhook event later to confirm
// which specific attempt succeeded.
async function initializeTransaction({ chatId, userId, amount }) {
  const reference = `chama_${chatId}_${userId}_${Date.now()}`;
  const email = `user${userId}@telegrambot.local`;

  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amount * 100, // Paystack expects the amount in kobo/cents, not whole currency units
      reference,
      currency: "KES", // test mode — no real charge is made regardless of currency
    }),
  });

  const data = await response.json();

  if (!data.status) {
    throw new Error(data.message || "Paystack initialization failed");
  }

  return {
    reference,
    authorizationUrl: data.data.authorization_url,
  };
}

// ─── Verify webhook signature ───────────────────────────────────────────────
// Paystack signs every webhook payload with your secret key (HMAC SHA512),
// sent in the x-paystack-signature header. This function recomputes that
// signature ourselves and compares it, so we can trust that a webhook
// request genuinely came from Paystack — not from someone who just POSTs a
// fake "payment succeeded" JSON body to our webhook URL, which they could
// otherwise do freely since the URL itself is public.
function verifyWebhookSignature(rawBody, signature) {
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");
  return hash === signature;
}

module.exports = { initializeTransaction, verifyWebhookSignature };