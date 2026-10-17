// Option 2 of a proposal (contract_type 'wallprep') is the closet plus wall
// repair and paint, so a job booked on it needs the painter booked (Michael,
// 2026-10-17). "Booked on it" = a live Option 2 contract the customer has
// signed; a draft or a voided one (the customer switched back) doesn't count.
// The CRM flags the job until projects.painter_booked_at is stamped.
export function wallPaintSql(alias = "p") {
  return `EXISTS (SELECT 1 FROM contracts kpaint WHERE kpaint.project_id = ${alias}.id
            AND kpaint.contract_type = 'wallprep'
            AND kpaint.status IN ('signed_by_customer','counter_signed','fully_executed'))`;
}

// Jobs still waiting on the painter: Option 2, not ticked, not finished.
export function painterNeededSql(alias = "p") {
  return `(${wallPaintSql(alias)} AND ${alias}.painter_booked_at IS NULL AND ${alias}.status NOT IN ('completed','lost'))`;
}
