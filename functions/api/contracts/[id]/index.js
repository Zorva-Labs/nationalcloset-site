import { requireAuth, json } from "../../../_lib/auth.js";
import { recordActivity } from "../../../_lib/db.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const contract = await context.env.DB.prepare(
    `SELECT k.*, p.name AS project_name, p.site_address, c.id AS contact_id,
            c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone,
            c.address_street, c.address_city, c.address_state, c.address_zip
     FROM contracts k JOIN projects p ON p.id=k.project_id JOIN contacts c ON c.id=p.contact_id
     WHERE k.id=?1`
  ).bind(id).first();
  if (!contract) return json({ error: "Not found" }, 404);
  const lines = (await context.env.DB.prepare(`SELECT * FROM contract_lines WHERE contract_id=?1 ORDER BY position, id`).bind(id).all()).results || [];
  return json({ contract, lines });
}

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));

  if (Array.isArray(body.lines)) {
    await context.env.DB.prepare(`DELETE FROM contract_lines WHERE contract_id=?1`).bind(id).run();
    let total = 0;
    for (let i = 0; i < body.lines.length; i++) {
      const l = body.lines[i];
      if (!l.description) continue;
      const qty = Number(l.quantity || 1);
      const unit = parseInt(l.unit_price_cents || 0, 10);
      const lt = Math.round(qty * unit);
      total += lt;
      await context.env.DB.prepare(
        `INSERT INTO contract_lines (contract_id, description, room, width_in, height_in, quantity, unit_price_cents, line_total_cents, position)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
      ).bind(
        id, l.description, l.room || null,
        l.width_in != null ? Number(l.width_in) : null,
        l.height_in != null ? Number(l.height_in) : null,
        qty, unit, lt, i,
      ).run();
    }
    await context.env.DB.prepare(`UPDATE contracts SET total_cents=?1 WHERE id=?2`).bind(total, id).run();
  }

  const allowed = ["status","intro","scope_html","terms_html","estimated_install_window","deposit_cents","deposit_paid","deposit_paid_method","deposit_paid_at"];
  const fields = []; const binds = [];
  for (const k of allowed) {
    if (body[k] !== undefined) {
      fields.push(`${k}=?${binds.length+1}`);
      binds.push(typeof body[k] === "boolean" ? (body[k] ? 1 : 0) : body[k]);
    }
  }
  if (fields.length) {
    fields.push(`updated_at=datetime('now')`);
    binds.push(id);
    await context.env.DB.prepare(`UPDATE contracts SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  }
  await recordActivity(context.env.DB, {
    entityType: "contract", entityId: id, action: "updated",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  await context.env.DB.prepare(`DELETE FROM contracts WHERE id=?1`).bind(parseInt(context.params.id, 10)).run();
  return json({ ok: true });
}
