// POST /api/stripe/webhook — Stripe event receiver. The source of truth for
// marking an invoice paid. Verifies the signature against STRIPE_WEBHOOK_SECRET.
import { verifyStripeSignature, getChargeFee } from "../../_lib/stripe.js";
import { markInvoicePaid, markInvoiceProcessing, markInvoiceFailed } from "../../_lib/invoices.js";

// Best-effort chosen-method from a PaymentIntent (falls back to ACH, the usual
// async/"processing" method).
function piMethod(pi, fallback = "us_bank_account") {
  return pi.charges?.data?.[0]?.payment_method_details?.type || fallback;
}
async function findInvoice(db, pi) {
  const invoiceId = pi.metadata?.invoice_id ? parseInt(pi.metadata.invoice_id, 10) : null;
  return invoiceId
    ? await db.prepare(`SELECT * FROM invoices WHERE id=?1`).bind(invoiceId).first()
    : await db.prepare(`SELECT * FROM invoices WHERE stripe_payment_intent_id=?1`).bind(pi.id).first();
}

export async function onRequestPost(context) {
  const secret = context.env.STRIPE_WEBHOOK_SECRET;
  const sig = context.request.headers.get("Stripe-Signature") || "";
  const payload = await context.request.text();

  if (secret) {
    const ok = await verifyStripeSignature(payload, sig, secret);
    if (!ok) return new Response("bad signature", { status: 400 });
  }
  // If no secret is configured yet, we still parse (test mode) but log a warning.
  let event;
  try { event = JSON.parse(payload); } catch { return new Response("bad json", { status: 400 }); }
  if (!secret) console.warn("[stripe-webhook] no STRIPE_WEBHOOK_SECRET set — signature NOT verified");

  try {
    const db = context.env.DB;
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const inv = await findInvoice(db, pi);
      if (inv && inv.status !== "paid") {
        const feeCents = await getChargeFee(context.env, pi);
        await markInvoicePaid(context.env, inv, { method: piMethod(pi, "card"), paymentIntentId: pi.id, feeCents });
      }
    } else if (event.type === "payment_intent.processing") {
      // Async payment (ACH bank transfer, etc.) started — show it as processing
      // and email the office. It'll flip to paid on payment_intent.succeeded.
      const pi = event.data.object;
      const inv = await findInvoice(db, pi);
      if (inv && !["paid", "processing", "void"].includes(inv.status)) {
        await markInvoiceProcessing(context.env, inv, { method: piMethod(pi, "us_bank_account"), paymentIntentId: pi.id });
      }
    } else if (event.type === "payment_intent.payment_failed") {
      // A processing payment bounced (e.g. ACH failure) — revert to open and
      // alert the office (the job may have been booked from the processing PI).
      const pi = event.data.object;
      const inv = await findInvoice(db, pi);
      if (inv && inv.status === "processing") {
        await markInvoiceFailed(context.env, inv, { method: piMethod(pi) });
      }
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error", String(e));
    // Still 200 so Stripe doesn't hammer retries on our own bug; we logged it.
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
