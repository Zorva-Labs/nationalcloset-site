// GET  /api/public/invoice/[token]  — invoice summary + Stripe key + PaymentIntent client_secret
// POST /api/public/invoice/[token]  { action: "set_method", method: "card" | "bank" }
//   Card payments carry a processing-fee surcharge; bank (ACH) does not. This
//   sets the PaymentIntent amount to base (bank) or base + surcharge (card)
//   right before the customer confirms.
import { json } from "../../../_lib/auth.js";
import { createPaymentIntent, retrievePaymentIntent, updatePaymentIntentAmount } from "../../../_lib/stripe.js";
import { markInvoicePaid } from "../../../_lib/invoices.js";

// Card surcharge rate (e.g. 0.03 = 3%). Configurable via wrangler [vars]
// CARD_SURCHARGE_RATE; defaults to 3% and is clamped to a sane range.
function surchargeRate(env) {
  const r = parseFloat(env.CARD_SURCHARGE_RATE);
  return Number.isFinite(r) && r >= 0 && r <= 0.06 ? r : 0.03;
}
const surchargeCents = (baseCents, rate) => Math.round(baseCents * rate);

// A PI is "restricted" (good) only if it offers exactly card + ACH. Older
// intents created with automatic_payment_methods still offer Klarna/Affirm/Link,
// so we recreate those.
const ALLOWED_PM = ["card", "us_bank_account"];
function piIsRestricted(pi) {
  if (!pi) return false;
  if (pi.automatic_payment_methods && pi.automatic_payment_methods.enabled) return false;
  const types = pi.payment_method_types || [];
  return types.length > 0 && types.every((t) => ALLOWED_PM.includes(t));
}

function publicView(inv, project) {
  return {
    number: inv.number,
    amount_cents: inv.amount_cents,
    amount_paid_cents: inv.amount_paid_cents || 0,
    currency: inv.currency,
    description: inv.description,
    type: inv.type,
    status: inv.status,
    contact_name: project?.contact_name || "",
    project_name: project?.name || "",
  };
}

export async function onRequestGet(context) {
  const token = context.params.token;
  const db = context.env.DB;
  const inv = await db.prepare(`SELECT * FROM invoices WHERE view_token=?1`).bind(token).first();
  if (!inv) return json({ error: "Invoice not found" }, 404);
  const project = await db.prepare(
    `SELECT p.id, p.name, c.name AS contact_name, c.email AS contact_email
       FROM projects p JOIN contacts c ON c.id=p.contact_id WHERE p.id=?1`
  ).bind(inv.project_id).first().catch(() => null);

  if (inv.status === "void") return json({ voided: true, invoice: publicView(inv, project) });
  if (inv.status === "paid") return json({ paid: true, invoice: publicView(inv, project) });

  if (!context.env.STRIPE_SECRET_KEY) return json({ error: "Payments not configured" }, 500);

  // Only the unpaid balance is charged online (in-person payments may have
  // already covered part of it).
  const due = Math.max(0, (inv.amount_cents || 0) - (inv.amount_paid_cents || 0));
  if (due <= 0) {
    await markInvoicePaid(context.env, inv, { method: inv.paid_method || "manual" }).catch(() => {});
    return json({ paid: true, invoice: publicView({ ...inv, status: "paid" }, project) });
  }

  const rate = surchargeRate(context.env);
  try {
    let pi = null;
    if (inv.stripe_payment_intent_id) {
      pi = await retrievePaymentIntent(context.env, inv.stripe_payment_intent_id).catch(() => null);
      // If a prior intent already succeeded, sync + report paid.
      if (pi && pi.status === "succeeded") {
        const method = pi.charges?.data?.[0]?.payment_method_details?.type || "card";
        await markInvoicePaid(context.env, inv, { method, paymentIntentId: pi.id });
        return json({ paid: true, invoice: publicView({ ...inv, status: "paid" }, project) });
      }
      // Recreate stale intents: canceled, or ones that still offer methods other
      // than card + ACH (e.g. Klarna from the old automatic_payment_methods setup).
      if (pi && (pi.status === "canceled" || !piIsRestricted(pi))) pi = null;
      // Otherwise reset to the current balance (also clears any leftover surcharge).
      else if (pi && pi.amount !== due) {
        pi = await updatePaymentIntentAmount(context.env, pi.id, due).catch(() => pi);
      }
    }
    if (!pi) {
      pi = await createPaymentIntent(context.env, {
        amountCents: due,
        currency: inv.currency || "usd",
        description: `${inv.number} — ${inv.description}`,
        receiptEmail: project?.contact_email || undefined,
        metadata: { invoice_id: String(inv.id), invoice_number: inv.number, project_id: String(inv.project_id) },
        idempotencyKey: `inv_${inv.id}_cardach`,   // namespaced so old Klarna-enabled intents aren't replayed
      });
      await db.prepare(`UPDATE invoices SET stripe_payment_intent_id=?1, updated_at=datetime('now') WHERE id=?2`).bind(pi.id, inv.id).run();
    }
    return json({
      invoice: publicView(inv, project),
      due_cents: due,
      publishable_key: context.env.STRIPE_PUBLISHABLE_KEY,
      client_secret: pi.client_secret,
      surcharge_rate: rate,
      card_surcharge_cents: surchargeCents(due, rate),
    });
  } catch (e) {
    return json({ error: e.message || "Stripe error" }, 502);
  }
}

// Set the PaymentIntent amount to match the chosen method, right before confirm.
export async function onRequestPost(context) {
  const token = context.params.token;
  const db = context.env.DB;
  const body = await context.request.json().catch(() => ({}));
  if (body.action !== "set_method") return json({ error: "Unknown action" }, 400);

  const inv = await db.prepare(`SELECT * FROM invoices WHERE view_token=?1`).bind(token).first();
  if (!inv) return json({ error: "Invoice not found" }, 404);
  if (inv.status === "paid") return json({ paid: true });
  if (inv.status === "void") return json({ error: "Invoice canceled" }, 400);
  if (!inv.stripe_payment_intent_id) return json({ error: "No payment in progress" }, 400);

  const rate = surchargeRate(context.env);
  const base = Math.max(0, (inv.amount_cents || 0) - (inv.amount_paid_cents || 0));  // remaining balance
  const isCard = body.method === "card";
  const amount = isCard ? base + surchargeCents(base, rate) : base;
  try {
    const pi = await updatePaymentIntentAmount(context.env, inv.stripe_payment_intent_id, amount);
    return json({ ok: true, amount_cents: pi.amount, surcharged: isCard });
  } catch (e) {
    return json({ error: e.message || "Stripe error" }, 502);
  }
}
