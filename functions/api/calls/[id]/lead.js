// POST /api/calls/:id/lead — make a lead from a call: the button on /crm/calls.html
// for a caller who didn't press 1 but should be worked. A call that already has
// a lead answers with that lead.
import { requireAuth, json } from "../../../_lib/auth.js";
import { leadFromCall } from "../../../_lib/calls.js";

export async function onRequestPost(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;
  const { DB } = context.env;
  const id = parseInt(context.params.id, 10);

  const row = await DB.prepare("SELECT * FROM calls WHERE id = ?1").bind(id).first();
  if (!row) return json({ error: "Call not found" }, 404);
  if (row.lead_id > 0) return json({ id: row.lead_id, existing: true });
  if (!row.caller_number) return json({ error: "This call has no caller number." }, 400);

  try {
    const leadId = await leadFromCall(DB, row, { kind: "admin", id: guard.id, name: guard.email });
    return json({ id: leadId });
  } catch (err) {
    console.error("[calls] lead failed:", err?.message || err);
    return json({ error: "The lead could not be saved." }, 503);
  }
}
