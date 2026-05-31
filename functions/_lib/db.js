// Shared D1 helpers — keeps API route files thin.

export async function recordActivity(db, {
  entityType, entityId, action,
  actorKind = "system", actorId = null, actorName = null,
  details = null,
}) {
  await db
    .prepare(
      `INSERT INTO activity_log (entity_type, entity_id, action, actor_kind, actor_id, actor_name, details)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(entityType, entityId, action, actorKind, actorId, actorName, details ? JSON.stringify(details) : null)
    .run();
}

// Find or create a contact by email
export async function upsertContact(db, { name, email, phone, address }) {
  const existing = await db.prepare(`SELECT id FROM contacts WHERE email = ?1`).bind(email).first();
  if (existing) {
    await db
      .prepare(
        `UPDATE contacts SET name=?1, phone=?2,
           address_street=COALESCE(?3, address_street),
           address_city=COALESCE(?4, address_city),
           address_state=COALESCE(?5, address_state),
           address_zip=COALESCE(?6, address_zip),
           updated_at=datetime('now') WHERE id=?7`
      )
      .bind(
        name, phone || null,
        address?.street || null, address?.city || null, address?.state || null, address?.zip || null,
        existing.id
      )
      .run();
    return existing.id;
  }
  const r = await db
    .prepare(
      `INSERT INTO contacts (name, email, phone, address_street, address_city, address_state, address_zip)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id`
    )
    .bind(
      name, email, phone || null,
      address?.street || null, address?.city || null, address?.state || null, address?.zip || null,
    )
    .first();
  return r.id;
}

// Get an estimate's current totals (sum of lines), use to refresh cached totals
export async function recomputeEstimateTotals(db, estimateId) {
  const sum = await db
    .prepare(`SELECT COALESCE(SUM(line_total_cents), 0) AS subtotal FROM estimate_lines WHERE estimate_id = ?1`)
    .bind(estimateId)
    .first();
  const e = await db
    .prepare(`SELECT discount_cents, tax_cents FROM estimates WHERE id = ?1`)
    .bind(estimateId)
    .first();
  const total = (sum.subtotal || 0) - (e.discount_cents || 0) + (e.tax_cents || 0);
  await db
    .prepare(`UPDATE estimates SET subtotal_cents=?1, total_cents=?2, updated_at=datetime('now') WHERE id=?3`)
    .bind(sum.subtotal || 0, total, estimateId)
    .run();
  return { subtotal: sum.subtotal || 0, total };
}

export async function recomputeTierTotals(db, tierId) {
  const sum = await db
    .prepare(`SELECT COALESCE(SUM(line_total_cents), 0) AS subtotal FROM proposal_tier_lines WHERE tier_id = ?1`)
    .bind(tierId)
    .first();
  const t = await db.prepare(`SELECT tax_cents FROM proposal_tiers WHERE id = ?1`).bind(tierId).first();
  const total = (sum.subtotal || 0) + (t.tax_cents || 0);
  await db
    .prepare(`UPDATE proposal_tiers SET subtotal_cents=?1, total_cents=?2 WHERE id=?3`)
    .bind(sum.subtotal || 0, total, tierId)
    .run();
  return { subtotal: sum.subtotal || 0, total };
}

export async function trackView(db, table, id) {
  await db
    .prepare(
      `UPDATE ${table}
         SET view_count = view_count + 1,
             last_viewed_at = datetime('now'),
             first_viewed_at = COALESCE(first_viewed_at, datetime('now'))
       WHERE id = ?1`
    )
    .bind(id)
    .run();
}
