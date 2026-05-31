// GET  /api/email-templates           — list active templates (?kind=… filter)
// POST /api/email-templates           — create a new template
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const kind = url.searchParams.get("kind");
  const includeInactive = url.searchParams.get("all") === "1";

  let sql = `SELECT * FROM email_templates WHERE 1=1`;
  const binds = [];
  if (!includeInactive) sql += ` AND is_active=1`;
  if (kind) { binds.push(kind); sql += ` AND kind=?${binds.length}`; }
  sql += ` ORDER BY is_default DESC, kind, name`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ templates: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  if (!body.name || !body.kind || !body.subject) {
    return json({ error: "name, kind, and subject are required" }, 400);
  }
  // If this template is being marked default, demote any sibling defaults first
  if (body.is_default) {
    await context.env.DB.prepare(`UPDATE email_templates SET is_default=0 WHERE kind=?1`).bind(body.kind).run();
  }
  const r = await context.env.DB.prepare(
    `INSERT INTO email_templates (name, kind, subject, body_text, body_html, variables_used,
       bind_lead_status, bind_project_status, is_default, is_active, author_user_id)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10) RETURNING id`
  ).bind(
    body.name, body.kind, body.subject,
    body.body_text || null, body.body_html || null,
    body.variables_used ? JSON.stringify(body.variables_used) : null,
    body.bind_lead_status || null, body.bind_project_status || null,
    body.is_default ? 1 : 0,
    auth.id,
  ).first();
  await recordActivity(context.env.DB, {
    entityType: "email_template", entityId: r.id, action: "created",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { kind: body.kind, name: body.name },
  });
  return json({ id: r.id }, 201);
}
