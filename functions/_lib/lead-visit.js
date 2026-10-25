// Saves the visit on a lead row that is already stored (functions/_lib/visit.js
// is the estate's one copy and stays byte-identical to ~/site-kit/form's).
//
// One difference from its saveVisit(): this table already has utm_source,
// utm_medium and gclid, holding what the form sent (the gclid is the click id
// itself, TEXT). The kit's UPDATE would overwrite them with the cookie's
// values and its 0/1 flag, so those three are left out here. Every other
// visit column (migration 0080) is written. Never throws: a lead is already
// saved, and a table without the columns only logs why.
import { visitRow } from "./visit.js";

const KEEP_FORMS_OWN = ["utm_source", "utm_medium", "gclid"];

export async function saveLeadVisit(db, id, visit) {
  if (!db || id == null) return false;
  const row = visitRow(visit);
  for (const c of KEEP_FORMS_OWN) delete row[c];
  const cols = Object.keys(row);
  try {
    await db.prepare(`UPDATE leads SET ${cols.map((c, i) => `${c} = ?${i + 1}`).join(", ")} WHERE id = ?${cols.length + 1}`)
      .bind(...cols.map((c) => row[c]), id).run();
    return true;
  } catch (e) {
    console.error("[lead] the visit was not saved on the row", (e && e.message) || e);
    return false;
  }
}
