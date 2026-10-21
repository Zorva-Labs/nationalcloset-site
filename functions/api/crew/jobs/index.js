// GET /api/crew/jobs — the jobs the signed-in person is assigned to (the
// installer's "My jobs"; any role may call it, and it always means "mine").
// No money: no price, payments, invoices or costs (_lib/roles.js).
import { requireAuth, json } from "../../../_lib/auth.js";
import { getAssigneeMap } from "../../../_lib/team.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const db = context.env.DB;
  if (!auth.teamMemberId) return json({ jobs: [], no_team_member: true });
  const jobs = (await db.prepare(
    `SELECT p.id, p.name, p.status, p.install_date, p.site_address, p.po_number,
            c.name AS contact_name, c.phone AS contact_phone
       FROM assignments a
       JOIN projects p ON p.id = a.entity_id
       LEFT JOIN contacts c ON c.id = p.contact_id
      WHERE a.entity_type = 'project' AND a.team_member_id = ?1
      ORDER BY (p.status = 'completed'), COALESCE(p.install_date, '9999-12-31'), p.id DESC`
  ).bind(auth.teamMemberId).all()).results || [];
  const crew = await getAssigneeMap(db, "project", jobs.map((j) => j.id));
  for (const j of jobs) j.assignees = crew[j.id] || [];
  return json({ jobs });
}
