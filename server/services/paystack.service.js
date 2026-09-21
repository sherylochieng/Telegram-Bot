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
// NOTE: originally used a ".local" TLD (user<id>@telegrambot.local), but
// Paystack's email validator rejects that as not a valid email format —
// switched to ".com" instead, which passes validation without issue.
async function initializeTransaction({ chatId, userId, amount }) {
  const reference = `chama_${chatId}_${userId}_${Date.now()}`;
  const email = `user${userId}@telegrambot.com`;

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

// ─── M-Pesa STK push charge ──────────────────────────────────────────────────
// Uses Paystack's /charge endpoint (different from /transaction/initialize
// above) with a mobile_money payload. For M-Pesa specifically, this makes
// Paystack trigger a genuine STK push — the "Enter M-Pesa PIN to pay" prompt
// that appears directly on the phone tied to that number. No link, no
// browser — the user confirms payment right on their phone's own prompt.
//
// Same reference pattern as initializeTransaction: we generate our own
// reference up front so the webhook can later match this specific attempt
// back to the correct `contributions` row.
async function initializeMpesaCharge({ chatId, userId, amount, phone }) {
  const reference = `chama_${chatId}_${userId}_${Date.now()}`;
  const email = `user${userId}@telegrambot.com`;

  // ─── Phone format fix ─────────────────────────────────────────────────────
  // We collect the number from the user in international format
  // (2547XXXXXXXX), which is the clearer format to ask for and validate.
  // However, Paystack's Kenya mobile money charge endpoint actually expects
  // LOCAL format (07XXXXXXXX) — sending the 254-prefixed version returns
  // "Invalid phone number format" even though it's a perfectly valid
  // number. So we convert here, right before the API call, keeping the
  // international format everywhere else in the app (validation regex,
  // what we show the user, etc).
  const localPhone = "0" + phone.slice(3);

  const response = await fetch(`${PAYSTACK_BASE_URL}/charge`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amount * 100,
      currency: "KES",
      reference,
      mobile_money: {
        phone: localPhone,
        provider: "mpesa",
      },
    }),
  });

  const data = await response.json();

  if (!data.status) {
    console.error("Paystack M-Pesa charge full response:", JSON.stringify(data, null, 2));
    throw new Error(data.message || "Paystack M-Pesa charge failed");
  }

  // Paystack returns status "pay_offline" or "pending" here while it waits
  // for the user to approve the STK push on their phone — this is expected
  // and not an error. The actual success/failure comes later via webhook.
  return { reference, displayText: data.data.display_text || null };
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

module.exports = { initializeTransaction, initializeMpesaCharge, verifyWebhookSignature };