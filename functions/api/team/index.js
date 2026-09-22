// GET  /api/team            — the roster (?all=1 includes deactivated people)
// POST /api/team            — add a team member
//
// Two owners today (Michael and Noah). This exists so a third installer can be
// added without a migration — the consult brief goes to whoever is assigned.
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";
import { listTeam } from "../../_lib/team.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const includeInactive = new URL(context.request.url).searchParams.get("all") === "1";
  return json({ team: await listTeam(context.env.DB, { includeInactive }) });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!name || !email) return json({ error: "Name and email are required" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "That email doesn't look right" }, 400);

  const existing = await context.env.DB.prepare(`SELECT id FROM team_members WHERE LOWER(email)=?1`).bind(email).first();
  if (existing) return json({ error: "Someone on the team already uses that email" }, 409);

  const r = await context.env.DB.prepare(
    `INSERT INTO team_members (name, email, phone, role) VALUES (?1,?2,?3,?4) RETURNING id`
  ).bind(name, email, body.phone || null, body.role || null).first();

  await recordActivity(context.env.DB, {
    entityType: "team_member", entityId: r.id, action: "created",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { name, email },
  }).catch(() => {});
  return json({ id: r.id }, 201);
}
