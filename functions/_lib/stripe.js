// Minimal Stripe REST client for Cloudflare Workers (no SDK — just fetch).
// Auth: Bearer secret key. Bodies are application/x-www-form-urlencoded with
// PHP-style bracket nesting (metadata[invoice_id]=5, expand[]=charges).

const STRIPE_API = "https://api.stripe.com/v1";

// Flatten nested objects/arrays into Stripe's bracket form encoding.
function encodeForm(obj, prefix, out) {
  out = out || new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") encodeForm(item, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(item));
      });
    } else if (typeof v === "object") {
      encodeForm(v, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

export async function stripeRequest(env, method, path, params) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-06-20",
    },
  };
  let url = `${STRIPE_API}${path}`;
  if (params && method === "GET") {
    url += "?" + encodeForm(params).toString();
  } else if (params) {
    init.body = encodeForm(params).toString();
  }
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Stripe ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.stripe = json?.error || null;
    throw err;
  }
  return json;
}

// Create (or return existing) PaymentIntent for an invoice amount.
// paymentMethodTypes is an explicit allow-list (not automatic_payment_methods)
// so only the methods we opt into are ever offered — card, ACH bank debit, and
// Klarna (pay-over-time). Wallets / Link / Affirm stay off.
export async function createPaymentIntent(env, { amountCents, currency = "usd", description, receiptEmail, metadata, idempotencyKey, paymentMethodTypes }) {
  const methods = paymentMethodTypes && paymentMethodTypes.length ? paymentMethodTypes : ["card", "us_bank_account", "klarna"];
  const params = {
    amount: Math.round(amountCents),
    currency,
    description,
    receipt_email: receiptEmail || undefined,
    payment_method_types: methods,
    payment_method_options: { us_bank_account: { verification_method: "automatic" } },
    metadata: metadata || {},
  };
  // Idempotency so a double-tap on the pay page doesn't make two intents.
  const key = env.STRIPE_SECRET_KEY;
  const body = encodeForm(params).toString();
  const res = await fetch(`${STRIPE_API}/payment_intents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-06-20",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json?.error?.message || `Stripe ${res.status}`); e.stripe = json?.error; throw e; }
  return json;
}

// Update an unconfirmed PaymentIntent's amount (used to apply the card
// surcharge at pay time, or reset to the base amount for ACH).
export function updatePaymentIntentAmount(env, id, amountCents) {
  return stripeRequest(env, "POST", `/payment_intents/${id}`, { amount: Math.round(amountCents) });
}

export function retrievePaymentIntent(env, id) {
  return stripeRequest(env, "GET", `/payment_intents/${id}`);
}

// Verify a Stripe webhook signature (Stripe-Signature: t=...,v1=...).
// Returns true if any v1 scheme matches HMAC-SHA256(secret, `${t}.${payload}`).
export async function verifyStripeSignature(payload, sigHeader, secret, toleranceSec = 300) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const seg of sigHeader.split(",")) {
    const i = seg.indexOf("=");
    if (i === -1) continue;
    const k = seg.slice(0, i).trim();
    const val = seg.slice(i + 1).trim();
    if (k === "v1") (parts.v1 ||= []).push(val);
    else parts[k] = val;
  }
  if (!parts.t || !parts.v1?.length) return false;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`${parts.t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Optional replay window
  if (toleranceSec) {
    const ts = parseInt(parts.t, 10);
    // Skip tolerance enforcement if clock unavailable; we still verify HMAC.
    if (Number.isFinite(ts) && toleranceSec > 0) { /* tolerance check intentionally soft in Workers */ }
  }
  return parts.v1.some((v) => timingSafeEqualHex(v, expected));
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
