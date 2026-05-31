// POST /api/public/cancel — customer self-cancels via token
import { json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => ({}));
  const token = body.token;
  if (!token) return json({ error: "Missing token" }, 400);
  const appt = await context.env.DB
    .prepare(`SELECT id, status, start_at FROM appointments WHERE cancel_token = ?1`)
    .bind(token)
    .first();
  if (!appt) return json({ error: "Not found" }, 404);
  if (appt.status === "cancelled") return json({ ok: true, already: true });
  await context.env.DB
    .prepare(`UPDATE appointments SET status='cancelled', updated_at=datetime('now') WHERE id=?1`)
    .bind(appt.id)
    .run();
  await recordActivity(context.env.DB, {
    entityType: "appointment", entityId: appt.id, action: "cancelled-by-customer",
    actorKind: "customer", details: { token_used: token },
  });
  return json({ ok: true });
}
