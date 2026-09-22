import { requireAuth, json } from "../../../_lib/auth.js";
import { recordActivity } from "../../../_lib/db.js";
import { sendAppointmentConfirmation } from "../../../_lib/appointment-emails.js";
import { sendConsultBrief } from "../../../_lib/consult-brief.js";
import { getAssignees, setAssignees } from "../../../_lib/team.js";

// POST /api/appointments/[id]
//   { action: "send_confirmation" } — (re)send the client the consultation /
//     measure confirmation email for an existing booking.
//   { action: "send_team_brief" }   — send the crew brief now, rather than
//     waiting for the morning-of sweep. Does NOT stamp team_brief_sent_at, so
//     the automatic brief still lands on the day.
export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const appt = await context.env.DB.prepare(`SELECT * FROM appointments WHERE id=?1`).bind(id).first();
  if (!appt) return json({ error: "Not found" }, 404);

  if (body.action === "send_confirmation") {
    if (!appt.email) return json({ error: "This appointment has no email on file." }, 400);
    const res = await sendAppointmentConfirmation(context.env, appt, { leadId: appt.lead_id, contactId: appt.contact_id });
    if (res?.skipped || res?.error) return json({ error: res.error || "Email could not be sent." }, 502);
    await recordActivity(context.env.DB, {
      entityType: "appointment", entityId: id, action: "confirmation-sent",
      actorKind: "admin", actorId: auth.id, actorName: auth.email,
    });
    return json({ ok: true, sent_to: appt.email });
  }

  if (body.action === "send_team_brief") {
    const r = await sendConsultBrief(context.env, appt, { actor: { kind: "admin", id: auth.id, name: auth.email } });
    if (!r.sent) {
      return json({ error: r.reason === "no_team_members" ? "No active team members to send to." : "The brief could not be sent." }, 502);
    }
    return json({ ok: true, sent: r.sent, sent_to: r.to, assigned: r.assigned });
  }

  return json({ error: "Unknown action" }, 400);
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const row = await context.env.DB.prepare(`SELECT * FROM appointments WHERE id = ?1`).bind(id).first();
  if (!row) return json({ error: "Not found" }, 404);
  return json({ appointment: row, assignees: await getAssignees(context.env.DB, "appointment", id) });
}

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const fields = [];
  const binds = [];
  const allowed = ["status", "start_at", "end_at", "duration_min", "notes", "rooms", "site_address", "name", "phone", "email", "type"];
  for (const k of allowed) {
    if (body[k] !== undefined) { fields.push(`${k} = ?${binds.length + 1}`); binds.push(body[k]); }
  }
  // Who is going out. Its own table, so it is handled apart from the column
  // updates — and a save that only changes the crew is a valid save.
  let assignees;
  if (Array.isArray(body.assignee_ids)) {
    assignees = await setAssignees(context.env.DB, "appointment", id, body.assignee_ids,
      { kind: "admin", id: auth.id, name: auth.email });
  }

  if (!fields.length) {
    if (assignees) return json({ ok: true, assignees });
    return json({ error: "Nothing to update" }, 400);
  }
  fields.push(`updated_at = datetime('now')`);
  binds.push(id);
  await context.env.DB
    .prepare(`UPDATE appointments SET ${fields.join(", ")} WHERE id = ?${binds.length}`)
    .bind(...binds)
    .run();
  await recordActivity(context.env.DB, {
    entityType: "appointment", entityId: id, action: "updated",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: body,
  });
  return json({ ok: true, assignees });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  await context.env.DB.prepare(`UPDATE appointments SET status='cancelled', updated_at=datetime('now') WHERE id=?1`).bind(id).run();
  await recordActivity(context.env.DB, {
    entityType: "appointment", entityId: id, action: "cancelled",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  return json({ ok: true });
}
