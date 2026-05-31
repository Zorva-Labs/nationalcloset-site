import { requireAuth, json } from "../../../_lib/auth.js";
import { recomputeEstimateTotals, recordActivity } from "../../../_lib/db.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const estimate = await context.env.DB.prepare(
    `SELECT e.*, p.name AS project_name, p.site_address, c.id AS contact_id,
            c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone,
            c.address_street, c.address_city, c.address_state, c.address_zip
     FROM estimates e JOIN projects p ON p.id=e.project_id JOIN contacts c ON c.id=p.contact_id
     WHERE e.id=?1`
  ).bind(id).first();
  if (!estimate) return json({ error: "Not found" }, 404);
  const lines = (await context.env.DB.prepare(`SELECT * FROM estimate_lines WHERE estimate_id=?1 ORDER BY position, id`).bind(id).all()).results || [];
  return json({ estimate, lines });
}

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));

  // Handle line bulk save (admin saves the line-item table)
  if (Array.isArray(body.lines)) {
    await context.env.DB.prepare(`DELETE FROM estimate_lines WHERE estimate_id=?1`).bind(id).run();
    for (let i = 0; i < body.lines.length; i++) {
      const l = body.lines[i];
      if (!l.description) continue;
      const qty = Number(l.quantity || 1);
      const unit = parseInt(l.unit_price_cents || 0, 10);
      const total = Math.round(qty * unit);
      await context.env.DB.prepare(
        `INSERT INTO estimate_lines (estimate_id, window_id, product_id, description, room,
           width_in, height_in, quantity, unit_price_cents, line_total_cents, position)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
      ).bind(
        id, l.window_id || null, l.product_id || null,
        l.description, l.room || null,
        l.width_in != null ? Number(l.width_in) : null,
        l.height_in != null ? Number(l.height_in) : null,
        qty, unit, total, i,
      ).run();
    }
  }

  // Handle other field updates
  const allowed = ["status", "valid_until", "notes_customer", "notes_internal", "discount_cents", "tax_cents"];
  const fields = []; const binds = [];
  for (const k of allowed) {
    if (body[k] !== undefined) {
      fields.push(`${k}=?${binds.length+1}`);
      binds.push(body[k]);
    }
  }
  if (fields.length) {
    fields.push(`updated_at=datetime('now')`);
    binds.push(id);
    await context.env.DB.prepare(`UPDATE estimates SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  }

  // Always recompute totals after any save (line or rate change)
  const totals = await recomputeEstimateTotals(context.env.DB, id);

  await recordActivity(context.env.DB, {
    entityType: "estimate", entityId: id, action: "updated",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  return json({ ok: true, totals });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  await context.env.DB.prepare(`DELETE FROM estimates WHERE id=?1`).bind(id).run();
  return json({ ok: true });
}
