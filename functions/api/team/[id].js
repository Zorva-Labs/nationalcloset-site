// PATCH  /api/team/[id]   — edit a team member (name, email, phone, role, active)
// DELETE /api/team/[id]   — deactivate. Never a hard delete: assignments cascade
//                           on DELETE, and wiping a person would erase the record
//                           of who went out on past jobs.
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const fields = []; const binds = [];
  for (const k of ["name", "email", "phone", "role"]) {
    if (body[k] !== undefined) {
      const v = k === "email" ? String(body[k]).trim().toLowerCase() : (String(body[k]).trim() || null);
      fields.push(`${k}=?${binds.length + 1}`); binds.push(v);
    }
  }
  if (body.active !== undefined) { fields.push(`active=?${binds.length + 1}`); binds.push(body.active ? 1 : 0); }
  if (!fields.length) return json({ error: "Nothing to update" }, 400);
  fields.push(`updated_at=datetime('now')`);
  binds.push(id);
  await context.env.DB.prepare(`UPDATE team_members SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  await recordActivity(context.env.DB, {
    entityType: "team_member", entityId: id, action: "updated",
    actorKind: "admin", actorId: auth.id, actorName: auth.email, details: body,
  }).catch(() => {});
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  await context.env.DB.prepare(`UPDATE team_members SET active=0, updated_at=datetime('now') WHERE id=?1`).bind(id).run();
  // Take them off anything still in the future; past assignments stay as history.
  await context.env.DB.prepare(
    `DELETE FROM assignments
      WHERE team_member_id=?1 AND entity_type='appointment'
        AND entity_id IN (SELECT id FROM appointments WHERE start_at >= datetime('now'))`
  ).bind(id).run().catch(() => {});
  await recordActivity(context.env.DB, {
    entityType: "team_member", entityId: id, action: "deactivated",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  }).catch(() => {});
  return json({ ok: true });
}
