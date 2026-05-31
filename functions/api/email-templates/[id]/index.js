// GET    /api/email-templates/[id]
// PATCH  /api/email-templates/[id]
// DELETE /api/email-templates/[id]    — soft delete (is_active=0)
import { requireAuth, json } from "../../../_lib/auth.js";
import { recordActivity } from "../../../_lib/db.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const row = await context.env.DB.prepare(`SELECT * FROM email_templates WHERE id=?1`).bind(id).first();
  if (!row) return json({ error: "Not found" }, 404);
  return json({ template: row });
}

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const cur = await context.env.DB.prepare(`SELECT * FROM email_templates WHERE id=?1`).bind(id).first();
  if (!cur) return json({ error: "Not found" }, 404);

  const allowed = ["name", "kind", "subject", "body_text", "body_html",
                   "variables_used", "bind_lead_status", "bind_project_status",
                   "is_default", "is_active"];
  const fields = []; const binds = [];
  for (const k of allowed) {
    if (body[k] !== undefined) {
      let v = body[k];
      if (k === "variables_used" && typeof v !== "string") v = JSON.stringify(v);
      if (k === "is_default" || k === "is_active") v = v ? 1 : 0;
      fields.push(`${k}=?${binds.length + 1}`);
      binds.push(v);
    }
  }
  if (!fields.length) return json({ ok: true });

  // If we're promoting this template to default, demote siblings of same kind
  if (body.is_default) {
    await context.env.DB.prepare(`UPDATE email_templates SET is_default=0 WHERE kind=?1 AND id<>?2`)
      .bind(body.kind || cur.kind, id).run();
  }
  fields.push(`updated_at=datetime('now')`);
  binds.push(id);
  await context.env.DB.prepare(`UPDATE email_templates SET ${fields.join(", ")} WHERE id=?${binds.length}`)
    .bind(...binds).run();

  await recordActivity(context.env.DB, {
    entityType: "email_template", entityId: id, action: "updated",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  // Soft delete — preserves historical messages that referenced this template
  await context.env.DB.prepare(`UPDATE email_templates SET is_active=0, updated_at=datetime('now') WHERE id=?1`)
    .bind(id).run();
  await recordActivity(context.env.DB, {
    entityType: "email_template", entityId: id, action: "deleted",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  return json({ ok: true });
}
