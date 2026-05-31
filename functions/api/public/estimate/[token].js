// GET /api/public/estimate/[token]  → estimate data for customer view
// POST /api/public/estimate/[token]  body: { action: "approve" | "decline", name?, note? }
import { json, hashIp } from "../../../_lib/auth.js";
import { trackView, recordActivity } from "../../../_lib/db.js";

export async function onRequestGet(context) {
  const token = context.params.token;
  const e = await context.env.DB.prepare(
    `SELECT e.*, p.name AS project_name, c.name AS contact_name, c.email AS contact_email
     FROM estimates e JOIN projects p ON p.id=e.project_id JOIN contacts c ON c.id=p.contact_id
     WHERE e.view_token=?1`
  ).bind(token).first();
  if (!e) return json({ error: "Not found" }, 404);
  const lines = (await context.env.DB.prepare(`SELECT * FROM estimate_lines WHERE estimate_id=?1 ORDER BY position, id`).bind(e.id).all()).results || [];
  await trackView(context.env.DB, "estimates", e.id);
  if (e.status === "sent") {
    await context.env.DB.prepare(`UPDATE estimates SET status='viewed' WHERE id=?1`).bind(e.id).run();
  }
  // Strip internal fields from the customer view
  const safe = { ...e };
  delete safe.notes_internal;
  delete safe.author_user_id;
  return json({ estimate: safe, lines });
}

export async function onRequestPost(context) {
  const token = context.params.token;
  const body = await context.request.json().catch(() => ({}));
  const e = await context.env.DB.prepare(`SELECT * FROM estimates WHERE view_token=?1`).bind(token).first();
  if (!e) return json({ error: "Not found" }, 404);
  if (e.status === "approved" || e.status === "declined") return json({ error: "Already actioned" }, 400);

  const ipHash = await hashIp(context.request.headers.get("CF-Connecting-IP"));
  if (body.action === "approve") {
    if (!body.name) return json({ error: "Please type your name to approve." }, 400);
    await context.env.DB.prepare(
      `UPDATE estimates SET status='approved', approved_at=datetime('now'),
         approved_by_name=?1, approved_ip_hash=?2, updated_at=datetime('now') WHERE id=?3`
    ).bind(body.name, ipHash, e.id).run();
    await recordActivity(context.env.DB, {
      entityType: "estimate", entityId: e.id, action: "approved",
      actorKind: "customer", actorName: body.name,
      details: { ip_hash: ipHash, note: body.note || null },
    });
    return json({ ok: true, status: "approved" });
  }
  if (body.action === "decline") {
    await context.env.DB.prepare(
      `UPDATE estimates SET status='declined', declined_at=datetime('now'), updated_at=datetime('now') WHERE id=?1`
    ).bind(e.id).run();
    await recordActivity(context.env.DB, {
      entityType: "estimate", entityId: e.id, action: "declined",
      actorKind: "customer", actorName: body.name || null,
      details: { ip_hash: ipHash, note: body.note || null },
    });
    return json({ ok: true, status: "declined" });
  }
  return json({ error: "Unknown action" }, 400);
}
