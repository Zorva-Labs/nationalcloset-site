// GET  /api/invoices?project_id=…   — list invoices for a project (admin)
// POST /api/invoices                 — create + send an invoice (admin, manual)
import { requireAuth, json } from "../../_lib/auth.js";
import { createInvoice } from "../../_lib/invoices.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const projectId = parseInt(url.searchParams.get("project_id") || "", 10);
  if (!Number.isFinite(projectId)) return json({ error: "project_id required" }, 400);
  const rows = (await context.env.DB.prepare(
    `SELECT * FROM invoices WHERE project_id=?1 ORDER BY created_at DESC`
  ).bind(projectId).all()).results || [];
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
