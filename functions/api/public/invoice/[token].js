// GET /api/public/invoice/[token] — invoice summary + Stripe key + PaymentIntent
// client_secret. Every payment method enabled in the Stripe Dashboard is offered
// (automatic_payment_methods) and there is no surcharge — the amount charged is
// exactly the balance due for every method.
import { json } from "../../../_lib/auth.js";
import { createPaymentIntent, retrievePaymentIntent, updatePaymentIntentAmount } from "../../../_lib/stripe.js";
import { markInvoicePaid } from "../../../_lib/invoices.js";

// A stored PI is reusable only if it was created with automatic_payment_methods.
// Legacy intents built from an explicit payment_method_types list are recreated
// so the customer gets the full set of enabled methods with no surcharge.
function piAcceptable(pi) {
  return !!(pi && pi.automatic_payment_methods && pi.automatic_payment_methods.enabled);
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
      // Redirect-based methods (Klarna) and ACH come back as "processing" — the
      // customer is done; the webhook finalizes it. Show a processing state so
      // they don't try to pay again.
      if (pi && pi.status === "processing") {
        return json({ processing: true, invoice: publicView(inv, project) });
      }
      // Recreate stale intents: canceled, or legacy explicit-method-list intents.
      if (pi && (pi.status === "canceled" || !piAcceptable(pi))) pi = null;
      // Otherwise reset to the current balance (in case a partial in-person
      // payment reduced it since the intent was created).
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
        idempotencyKey: `inv_${inv.id}_v3`,   // v3 = automatic_payment_methods, no surcharge
      });
      await db.prepare(`UPDATE invoices SET stripe_payment_intent_id=?1, updated_at=datetime('now') WHERE id=?2`).bind(pi.id, inv.id).run();
    }
    return json({
      invoice: publicView(inv, project),
      due_cents: due,
      publishable_key: context.env.STRIPE_PUBLISHABLE_KEY,
      client_secret: pi.client_secret,
    });
  } catch (e) {
    return json({ error: e.message || "Stripe error" }, 502);
  }
}
