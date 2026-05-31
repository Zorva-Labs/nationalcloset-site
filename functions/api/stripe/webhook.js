// POST /api/stripe/webhook — Stripe event receiver. The source of truth for
// marking an invoice paid. Verifies the signature against STRIPE_WEBHOOK_SECRET.
import { verifyStripeSignature } from "../../_lib/stripe.js";
import { markInvoicePaid } from "../../_lib/invoices.js";

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
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const invoiceId = pi.metadata?.invoice_id ? parseInt(pi.metadata.invoice_id, 10) : null;
      const db = context.env.DB;
      const inv = invoiceId
        ? await db.prepare(`SELECT * FROM invoices WHERE id=?1`).bind(invoiceId).first()
        : await db.prepare(`SELECT * FROM invoices WHERE stripe_payment_intent_id=?1`).bind(pi.id).first();
      if (inv && inv.status !== "paid") {
        const method = pi.charges?.data?.[0]?.payment_method_details?.type || "card";
        await markInvoicePaid(context.env, inv, { method, paymentIntentId: pi.id });
      }
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error", String(e));
    // Still 200 so Stripe doesn't hammer retries on our own bug; we logged it.
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "Content-Type": "application/json" } });
}
