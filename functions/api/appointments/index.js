// /api/appointments — admin list + admin manual create
import { requireAuth, json } from "../../_lib/auth.js";
import { genToken } from "../../_lib/tokens.js";
import { recordActivity, upsertContact } from "../../_lib/db.js";
import { bumpLeadStatusForward } from "../../_lib/lifecycle.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const { DB } = context.env;
  const url = new URL(context.request.url);
  const from = url.searchParams.get("from") || "1900-01-01";
  const to = url.searchParams.get("to") || "2999-12-31";
  const status = url.searchParams.get("status");

  let sql = `SELECT a.*, c.name AS contact_name FROM appointments a
             LEFT JOIN contacts c ON c.id = a.contact_id
             WHERE a.start_at >= ?1 AND a.start_at <= ?2`;
  const binds = [from + "T00:00:00", to + "T23:59:59"];
  if (status) { sql += ` AND a.status = ?3`; binds.push(status); }
  sql += ` ORDER BY a.start_at ASC LIMIT 500`;
  const rows = (await DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ appointments: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const { DB } = context.env;
  const body = await context.request.json().catch(() => ({}));
  const required = ["start_at", "end_at", "name", "email"];
  for (const k of required) {
    if (!body[k]) return json({ error: `Missing ${k}` }, 400);
  }
  const contactId = await upsertContact(DB, {
    name: body.name, email: body.email, phone: body.phone,
    address: body.address || null,
  });
  const cancelToken = genToken(16);
  const r = await DB
    .prepare(
      `INSERT INTO appointments (contact_id, lead_id, project_id, type, start_at, end_at, duration_min, status, source,
        name, email, phone, site_address, rooms, notes, cancel_token)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
       RETURNING id`
    )
    .bind(
      contactId,
      body.lead_id || null,
      body.project_id || null,
      body.type || "consultation",
      body.start_at,
      body.end_at,
      body.duration_min || 60,
      body.status || "confirmed",
      body.source || "admin",
      body.name,
      body.email,
      body.phone || null,
      body.site_address || null,
      body.rooms || null,
      body.notes || null,
      cancelToken,
    )
    .first();
  // Auto-advance any lead this appointment is for to "consult". Two ways the
  // caller may identify the lead: body.lead_id (preferred — passed when
  // booking from the lead page) or a match on body.email (so anyone scheduling
  // a consult by email still bumps the right lead even without explicit FK).
  let leadIdForBump = body.lead_id || null;
  if (!leadIdForBump && body.email) {
    const lead = await DB.prepare(`SELECT id FROM leads WHERE LOWER(email)=?1 ORDER BY id DESC LIMIT 1`).bind(body.email.toLowerCase()).first().catch(() => null);
    if (lead) leadIdForBump = lead.id;
  }
  if (leadIdForBump && (body.type || "consultation") === "consultation") {
    await bumpLeadStatusForward(DB, leadIdForBump, "consult", { actor: { kind: "admin", id: auth.id, name: auth.email } });
  }

  await recordActivity(DB, {
    entityType: "appointment", entityId: r.id, action: "created",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { lead_id: leadIdForBump, type: body.type || "consultation" },
  });
  return json({ id: r.id, cancel_token: cancelToken });
}
