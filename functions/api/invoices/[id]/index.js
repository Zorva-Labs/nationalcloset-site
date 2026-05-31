// POST /api/invoices/[id]  { action: "resend" | "void" | "mark_paid" }  (admin)
import { requireAuth, json } from "../../../_lib/auth.js";
import { sendInvoiceEmail, markInvoicePaid } from "../../../_lib/invoices.js";
import { recordActivity } from "../../../_lib/db.js";

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const action = body.action;
  const inv = await context.env.DB.prepare(`SELECT * FROM invoices WHERE id=?1`).bind(id).first();
  if (!inv) return json({ error: "Not found" }, 404);

  if (action === "resend") {
    if (inv.status === "void") return json({ error: "Invoice is void" }, 400);
    const r = await sendInvoiceEmail(context.env, inv);
    return json({ ok: !!r.ok, ...(r.skipped ? { skipped: r.reason } : {}) });
  }
  if (action === "void") {
    await context.env.DB.prepare(`UPDATE invoices SET status='void', updated_at=datetime('now') WHERE id=?1`).bind(id).run();
    await recordActivity(context.env.DB, {
      entityType: "project", entityId: inv.project_id, action: "invoice-voided",
      actorKind: "admin", actorId: auth.id, actorName: auth.email, details: { invoice_id: id, number: inv.number },
    }).catch(() => {});
    return json({ ok: true });
  }
  if (action === "mark_paid") {
    await markInvoicePaid(context.env, inv, { method: body.method || "manual" });
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
}
