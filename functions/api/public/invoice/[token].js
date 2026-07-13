// GET /api/public/invoice/[token] — invoice summary + Stripe key + PaymentIntent
// client_secret. Every payment method enabled in the Stripe Dashboard is offered
// (automatic_payment_methods) and there is no surcharge — the amount charged is
// exactly the balance due for every method.
import { json } from "../../../_lib/auth.js";
import { createPaymentIntent, retrievePaymentIntent, updatePaymentIntentAmount, getChargeFee } from "../../../_lib/stripe.js";
import { markInvoicePaid, markInvoiceProcessing, getProjectBilling } from "../../../_lib/invoices.js";

// A stored PI is reusable only if it was created with automatic_payment_methods.
// Legacy intents built from an explicit payment_method_types list are recreated
// so the customer gets the full set of enabled methods with no surcharge.
function piAcceptable(pi) {
  return !!(pi && pi.automatic_payment_methods && pi.automatic_payment_methods.enabled);
}

// On a deposit/full invoice that hasn't been paid yet, the customer can choose
// to pay just the deposit or the whole job. Returns { deposit_cents, full_cents,
// current_plan } when a real choice exists, else null.
async function planInfo(db, inv) {
  if (!["deposit", "full"].includes(inv.type)) return null;
  if ((inv.amount_paid_cents || 0) > 0) return null;
  const billing = await getProjectBilling(db, inv.project_id).catch(() => null);
  const total = billing?.totalCents || 0;
  if (total <= 0) return null;
  const paidElsewhere = (await db.prepare(
    `SELECT COALESCE(SUM(amount_paid_cents),0) AS n FROM invoices WHERE project_id=?1 AND id != ?2 AND status != 'void'`
  ).bind(inv.project_id, inv.id).first().catch(() => null))?.n || 0;
  const depositCents = Math.min(billing.depositCents || 0, total);
  const fullCents = Math.max(depositCents, total - paidElsewhere);
  if (fullCents <= depositCents) return null; // deposit already covers the job
  return { deposit_cents: depositCents, full_cents: fullCents, current_plan: inv.type === "full" ? "full" : "deposit" };
}

// Resolve the target amount + invoice type for a chosen plan.
async function planTarget(db, inv, plan) {
  const billing = await getProjectBilling(db, inv.project_id).catch(() => null);
  const total = billing?.totalCents || 0;
  const paidElsewhere = (await db.prepare(
    `SELECT COALESCE(SUM(amount_paid_cents),0) AS n FROM invoices WHERE project_id=?1 AND id != ?2 AND status != 'void'`
  ).bind(inv.project_id, inv.id).first().catch(() => null))?.n || 0;
  const depositCents = Math.min(billing?.depositCents || 0, total);
  if (plan === "full") {
    return { amount: Math.max(depositCents, total - paidElsewhere), type: "full", description: "Payment in full for your custom closet project" };
  }
  return { amount: depositCents, type: "deposit", description: "Deposit to begin your custom closet project" };
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
    po_number: project?.po_number || "",
  };
}

export async function onRequestGet(context) {
  const token = context.params.token;
  const db = context.env.DB;
  const inv = await db.prepare(`SELECT * FROM invoices WHERE view_token=?1`).bind(token).first();
  if (!inv) return json({ error: "Invoice not found" }, 404);
  const project = await db.prepare(
    `SELECT p.id, p.name, p.po_number, c.name AS contact_name, c.email AS contact_email
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
        const feeCents = await getChargeFee(context.env, pi);
        await markInvoicePaid(context.env, inv, { method, paymentIntentId: pi.id, feeCents });
        return json({ paid: true, invoice: publicView({ ...inv, status: "paid" }, project) });
      }
      // Redirect-based methods (Klarna) and ACH come back as "processing" — the
      // customer is done; the webhook finalizes it. Show a processing state so
      // they don't try to pay again.
      if (pi && pi.status === "processing") {
        const method = pi.charges?.data?.[0]?.payment_method_details?.type || "us_bank_account";
        await markInvoiceProcessing(context.env, inv, { method, paymentIntentId: pi.id }).catch(() => {});
        return json({ processing: true, invoice: publicView({ ...inv, status: "processing" }, project) });
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
      plan: await planInfo(db, inv),
    });
  } catch (e) {
    return json({ error: e.message || "Stripe error" }, 502);
  }
}

// POST { action: "set_plan", plan: "deposit" | "full" } — switch the invoice
// between paying the deposit and paying the whole job, before the customer
// confirms. Updates the invoice amount/type and the live PaymentIntent amount.
export async function onRequestPost(context) {
  const token = context.params.token;
  const db = context.env.DB;
  const body = await context.request.json().catch(() => ({}));
  if (body.action !== "set_plan") return json({ error: "Unknown action" }, 400);
  const plan = body.plan === "full" ? "full" : "deposit";

  const inv = await db.prepare(`SELECT * FROM invoices WHERE view_token=?1`).bind(token).first();
  if (!inv) return json({ error: "Invoice not found" }, 404);
  if (inv.status === "paid") return json({ paid: true });
  if (inv.status === "void") return json({ error: "Invoice canceled" }, 400);
  if (!["deposit", "full"].includes(inv.type)) return json({ error: "This invoice can't be split" }, 400);
  if ((inv.amount_paid_cents || 0) > 0) return json({ error: "A payment has already been recorded" }, 400);

  const t = await planTarget(db, inv, plan);
  if (!t.amount || t.amount <= 0) return json({ error: "Nothing to charge" }, 400);
  await db.prepare(
    `UPDATE invoices SET amount_cents=?1, type=?2, description=?3, updated_at=datetime('now') WHERE id=?4`
  ).bind(t.amount, t.type, t.description, inv.id).run();
  if (inv.stripe_payment_intent_id) {
    await updatePaymentIntentAmount(context.env, inv.stripe_payment_intent_id, t.amount).catch(() => {});
  }
  return json({ ok: true, amount_cents: t.amount, plan: t.type });
}
