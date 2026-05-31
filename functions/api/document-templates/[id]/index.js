import { requireAuth, json } from "../../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const t = await context.env.DB.prepare(`SELECT * FROM document_templates WHERE id = ?1`).bind(id).first();
  if (!t) return json({ error: "Not found" }, 404);
  return json({ template: t });
}

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const allowed = ["subkind","name","is_default","intro","scope_html","terms_html","notes_customer",
                   "tier_good_title","tier_better_title","tier_best_title","valid_days","estimated_install_window"];
  const fields = []; const binds = [];
  for (const k of allowed) {
    if (body[k] !== undefined) {
      fields.push(`${k}=?${binds.length+1}`);
      binds.push(typeof body[k] === "boolean" ? (body[k] ? 1 : 0) : body[k]);
    }
  }
  if (!fields.length) return json({ error: "Nothing to update" }, 400);
  fields.push(`updated_at=datetime('now')`);
  binds.push(id);
  // If this is being marked as default, unmark other defaults of the same kind+subkind
  if (body.is_default === true || body.is_default === 1) {
    const t = await context.env.DB.prepare(`SELECT kind, subkind FROM document_templates WHERE id=?1`).bind(id).first();
    if (t) {
      const subFilter = t.subkind ? "AND subkind=?2" : "AND subkind IS NULL";
      const params = t.subkind ? [t.kind, t.subkind] : [t.kind];
      await context.env.DB.prepare(`UPDATE document_templates SET is_default=0 WHERE kind=?1 ${subFilter}`).bind(...params).run();
    }
  }
  await context.env.DB.prepare(`UPDATE document_templates SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  await context.env.DB.prepare(`DELETE FROM document_templates WHERE id=?1`).bind(parseInt(context.params.id, 10)).run();
  return json({ ok: true });
}
