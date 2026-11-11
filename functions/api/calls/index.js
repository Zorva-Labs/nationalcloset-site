// GET /api/calls — the phone calls CallRail has reported, newest first.
// ?lead_id=N one lead's calls · ?choice=estimate|service|message|none · ?limit=
// admin and sales (_lib/roles.js).
import { requireAuth, json } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;

  const url = new URL(context.request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10) || 200, 500);
  const where = [];
  const binds = [];

  const leadId = parseInt(url.searchParams.get("lead_id") || "", 10);
  if (leadId > 0) { binds.push(leadId); where.push(`c.lead_id = ?${binds.length}`); }

  const choice = url.searchParams.get("choice");
  if (choice === "none") where.push("c.menu_choice IS NULL");
  else if (["estimate", "service", "message"].includes(choice)) { binds.push(choice); where.push(`c.menu_choice = ?${binds.length}`); }

  const stmt = context.env.DB.prepare(
    `SELECT c.id, c.menu_choice, c.tracking_number, c.caller_number, c.caller_name, c.caller_city, c.caller_state,
            c.source, c.started_at, c.duration, c.answered, c.voicemail, c.spam, c.recording_url, c.agent, c.intake,
            CASE WHEN c.lead_id > 0 THEN c.lead_id END AS lead_id, l.name AS lead_name,
            c.contact_id, ct.name AS contact_name
       FROM calls c
       LEFT JOIN leads l ON l.id = c.lead_id
       LEFT JOIN contacts ct ON ct.id = c.contact_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY c.started_at DESC
      LIMIT ${limit}`
  );
  const { results } = await (binds.length ? stmt.bind(...binds) : stmt).all();
  return json({ calls: results || [] });
}
