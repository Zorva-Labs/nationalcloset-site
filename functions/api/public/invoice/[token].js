// GET /api/public/invoice/[token]
// Public (token-gated) endpoint backing the on-site card form. Returns the
// invoice summary + the Stripe publishable key + a PaymentIntent client_secret
// so Stripe Elements can collect a card. Creates the PaymentIntent lazily and
// reuses it across reloads.
import { json } from "../../../_lib/auth.js";
import { createPaymentIntent, retrievePaymentIntent } from "../../../_lib/stripe.js";
import { markInvoicePaid } from "../../../_lib/invoices.js";

function publicView(inv, project) {
  return {
    number: inv.number,
    amount_cents: inv.amount_cents,
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

  try {
    let pi = null;
    if (inv.stripe_payment_intent_id) {
      pi = await retrievePaymentIntent(context.env, inv.stripe_payment_intent_id).catch(() => null);
      // If a prior intent already succeeded, sync + report paid.
      if (pi && pi.status === "succeeded") {
        await markInvoicePaid(context.env, inv, { method: "card", paymentIntentId: pi.id });
        return json({ paid: true, invoice: publicView({ ...inv, status: "paid" }, project) });
      }
      // Reuse only if still chargeable for the same amount.
      if (pi && (pi.status === "canceled" || pi.amount !== inv.amount_cents)) pi = null;
    }
    if (!pi) {
      pi = await createPaymentIntent(context.env, {
        amountCents: inv.amount_cents,
        currency: inv.currency || "usd",
        description: `${inv.number} — ${inv.description}`,
        receiptEmail: project?.contact_email || undefined,
        metadata: { invoice_id: String(inv.id), invoice_number: inv.number, project_id: String(inv.project_id) },
        idempotencyKey: `inv_${inv.id}`,
      });
      await db.prepare(`UPDATE invoices SET stripe_payment_intent_id=?1, updated_at=datetime('now') WHERE id=?2`).bind(pi.id, inv.id).run();
    }
    return json({
      invoice: publicView(inv, project),
      publishable_key: context.env.STRIPE_PUBLISHABLE_KEY,
      client_secret: pi.client_secret,
    });
  } catch (e) {
    return json({ error: e.message || "Stripe error" }, 502);
  }
}
