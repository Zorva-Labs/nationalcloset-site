// GET  /api/invoices?project_id=… | ?lead_id=…   — list invoices (admin)
// POST /api/invoices                              — create + send an invoice (admin, manual)
import { requireAuth, json } from "../../_lib/auth.js";
import { createInvoice } from "../../_lib/invoices.js";

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
    return json({ error: "project_id or lead_id required" }, 400);
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
    return json({ ok: true, invoice: result.invoice, deduped: !!result.deduped });
  } catch (e) {
    return json({ error: e.message || "Could not create invoice" }, 500);
  }
}
