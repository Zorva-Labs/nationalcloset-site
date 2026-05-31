import { requireAuth, json } from "../../../_lib/auth.js";
import { recomputeTierTotals, recordActivity } from "../../../_lib/db.js";
import { syncLeadQuotedFromProposal } from "../../../_lib/lifecycle.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const proposal = await context.env.DB.prepare(
    `SELECT pr.*, p.name AS project_name, p.site_address, c.id AS contact_id,
            c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone
     FROM proposals pr JOIN projects p ON p.id=pr.project_id JOIN contacts c ON c.id=p.contact_id
     WHERE pr.id=?1`
  ).bind(id).first();
  if (!proposal) return json({ error: "Not found" }, 404);
  const tiers = (await context.env.DB.prepare(`SELECT * FROM proposal_tiers WHERE proposal_id=?1 ORDER BY CASE tier WHEN 'good' THEN 1 WHEN 'better' THEN 2 WHEN 'best' THEN 3 END`).bind(id).all()).results || [];
  for (const t of tiers) {
    t.lines = (await context.env.DB.prepare(`SELECT * FROM proposal_tier_lines WHERE tier_id=?1 ORDER BY position, id`).bind(t.id).all()).results || [];
  }
  const comments = (await context.env.DB.prepare(`SELECT * FROM proposal_comments WHERE proposal_id=?1 ORDER BY created_at DESC`).bind(id).all()).results || [];
  return json({ proposal, tiers, comments });
}

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));

  // Update proposal-level fields
  const allowed = ["status","intro","notes_internal","valid_until","default_contract_type"];
  const fields = []; const binds = [];
  for (const k of allowed) {
    if (body[k] !== undefined) { fields.push(`${k}=?${binds.length+1}`); binds.push(body[k]); }
  }
  if (fields.length) {
    fields.push(`updated_at=datetime('now')`);
    binds.push(id);
    await context.env.DB.prepare(`UPDATE proposals SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  }

  // Update tiers (title, description, tax, lines) — body.tiers = [{ id, title, description, tax_cents, lines: [...] }]
  if (Array.isArray(body.tiers)) {
    for (const t of body.tiers) {
      if (!t.id) continue;
      const tFields = []; const tBinds = [];
      for (const k of ["title","description","tax_cents"]) {
        if (t[k] !== undefined) { tFields.push(`${k}=?${tBinds.length+1}`); tBinds.push(t[k]); }
      }
      if (tFields.length) {
        tBinds.push(t.id);
        await context.env.DB.prepare(`UPDATE proposal_tiers SET ${tFields.join(", ")} WHERE id=?${tBinds.length}`).bind(...tBinds).run();
      }
      if (Array.isArray(t.lines)) {
        await context.env.DB.prepare(`DELETE FROM proposal_tier_lines WHERE tier_id=?1`).bind(t.id).run();
        for (let i = 0; i < t.lines.length; i++) {
          const l = t.lines[i];
          if (!l.description) continue;
          const qty = Number(l.quantity || 1);
          const unit = parseInt(l.unit_price_cents || 0, 10);
          await context.env.DB.prepare(
            `INSERT INTO proposal_tier_lines (tier_id, description, room, quantity, unit_price_cents, line_total_cents, position, product_id, width_in, height_in, color, options)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
          ).bind(
            t.id, l.description, l.room || null, qty, unit, Math.round(qty*unit), i,
            l.product_id || null,
            l.width_in != null ? Number(l.width_in) : null,
            l.height_in != null ? Number(l.height_in) : null,
            l.color || null,
            l.options || null,
          ).run();
        }
        await recomputeTierTotals(context.env.DB, t.id);
      }
    }
    // Tier line items changed → push the new "best"-tier total back to the lead
    await syncLeadQuotedFromProposal(context.env.DB, id);
  }
  await recordActivity(context.env.DB, {
    entityType: "proposal", entityId: id, action: "updated",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  await context.env.DB.prepare(`DELETE FROM proposals WHERE id=?1`).bind(parseInt(context.params.id, 10)).run();
  return json({ ok: true });
}
