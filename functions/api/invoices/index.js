// GET  /api/invoices?project_id=… | ?lead_id=…   — list invoices (admin)
// POST /api/invoices                              — create + send an invoice (admin, manual)
import { requireAuth, json } from "../../_lib/auth.js";
import { createInvoice, markInvoicePaid } from "../../_lib/invoices.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const projectId = parseInt(url.searchParams.get("project_id") || "", 10);
  const leadId = parseInt(url.searchParams.get("lead_id") || "", 10);
  let rows;
  if (Number.isFinite(projectId)) {
    rows = (await context.env.DB.prepare(
      `SELECT * FROM invoices WHERE project_id=?1 ORDER BY created_at DESC`
    ).bind(projectId).all()).results || [];
  } else if (Number.isFinite(leadId)) {
    // A lead's invoices = invoices on any project that descends from the lead.
    rows = (await context.env.DB.prepare(
      `SELECT * FROM invoices WHERE project_id IN (SELECT id FROM projects WHERE lead_id=?1) ORDER BY created_at DESC`
    ).bind(leadId).all()).results || [];
  } else {
    // No project/lead filter → list ALL invoices for the global Invoices page,
    // joined with customer + project names. Optional ?status=open|paid|void
    // narrows the set (the UI also filters client-side for instant tabs).
    const status = (url.searchParams.get("status") || "").toLowerCase();
    const allowed = { open: "open", paid: "paid", void: "void", draft: "draft" };
    const where = allowed[status] ? `WHERE i.status = '${allowed[status]}'` : "";
    rows = (await context.env.DB.prepare(
      `SELECT i.*, c.name AS contact_name, p.name AS project_name
         FROM invoices i
         LEFT JOIN contacts c ON c.id = i.contact_id
         LEFT JOIN projects p ON p.id = i.project_id
         ${where}
        ORDER BY i.created_at DESC`
    ).all()).results || [];
  }
  return json({ invoices: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  if (!body.project_id) return json({ error: "project_id required" }, 400);
  const type = body.type || "custom";
  try {
    const result = await createInvoice(context.env, {
      projectId: parseInt(body.project_id, 10),
      type,
      amountCents: body.amount_cents != null ? parseInt(body.amount_cents, 10) : undefined,
      description: body.description || undefined,
      send: body.send !== false,
      actor: { id: auth.id, name: auth.email },
    });
    if (result.skipped) return json({ error: result.reason || "skipped" }, 400);

    // "Record a payment" with no invoice behind it: create the custom invoice
    // (never emailed) and settle it in the same call, so money taken outside the
    // normal milestones still lands in the ledger, the job balance and Reports.
    // A standalone payments table would be invisible to everything that reads
    // invoices, so this reuses the machinery instead of running beside it.
    if (body.mark_paid && result.invoice) {
      await markInvoicePaid(context.env, result.invoice, {
        method: (body.method || "manual").toString().slice(0, 60),
        paidAt: /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at || "") ? `${body.paid_at} 12:00:00` : null,
        sendReceipt: body.send_receipt === true,   // off unless explicitly asked
      });
      return json({ ok: true, invoice: result.invoice, paid: true });
    }
    return json({ ok: true, invoice: result.invoice, deduped: !!result.deduped });
  } catch (e) {
    return json({ error: e.message || "Could not create invoice" }, 500);
  }
}
