// GET /api/crew/jobs/:id — one job as the crew needs it: the customer and the
// site, the install date and status, the crew, the materials, the scope of
// work (the accepted option's lines without prices), what was promised, the
// drawings, the visits and the staff notes. No money of any kind.
//
// An installer gets only a job they are assigned to (404 otherwise, so a job
// id can't be probed); admin and sales get any job. The install worksheet
// (crm/worksheet.html) and the installer's job page (crm/my-job.html) read it.
import { requireAuth, json } from "../../../_lib/auth.js";
import { getAssignees, getAssigneeMap } from "../../../_lib/team.js";
import { canSeeProject } from "../../../_lib/roles.js";
import { wallPaintSql } from "../../../_lib/painter.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const db = context.env.DB;
  const id = parseInt(context.params.id, 10);
  if (!id || !(await canSeeProject(db, auth, id))) return json({ error: "Not found" }, 404);

  const project = await db.prepare(
    `SELECT p.id, p.name, p.description, p.status, p.site_address, p.install_date, p.po_number,
            p.materials_ordered_at, p.materials_received_at, p.materials_missing_at,
            p.materials_damaged_at, p.materials_installed_at, p.painter_booked_at,
            ${wallPaintSql("p")} AS wall_paint,
            c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email
       FROM projects p LEFT JOIN contacts c ON c.id = p.contact_id WHERE p.id = ?1`
  ).bind(id).first();
  if (!project) return json({ error: "Not found" }, 404);

  // Scope: the accepted proposal's chosen option, else the newest proposal's first.
  const proposals = (await db.prepare(
    `SELECT id, status, selected_tier, job_notes FROM proposals WHERE project_id=?1 ORDER BY created_at DESC`
  ).bind(id).all()).results || [];
  const acc = proposals.find((p) => p.status === "accepted") || proposals[0] || null;
  let scope = { title: "", lines: [] };
  if (acc) {
    const tiers = (await db.prepare(`SELECT id, tier, title FROM proposal_tiers WHERE proposal_id=?1 ORDER BY id`).bind(acc.id).all()).results || [];
    const tier = tiers.find((t) => t.tier === (acc.selected_tier || "good")) || tiers[0];
    if (tier) {
      const lines = (await db.prepare(
        `SELECT description, room, quantity, line_total_cents FROM proposal_tier_lines WHERE tier_id=?1 ORDER BY position, id`
      ).bind(tier.id).all()).results || [];
      // A discount line (negative) is money, not work.
      scope = { title: tier.title || "", lines: lines.filter((l) => (l.line_total_cents || 0) >= 0)
        .map((l) => ({ description: l.description, room: l.room, quantity: l.quantity || 1 })) };
    }
  }
  const noted = proposals.find((p) => p.status === "accepted" && p.job_notes) || proposals.find((p) => p.job_notes) || null;

  const contract = await db.prepare(
    `SELECT contract_type, status FROM contracts WHERE project_id=?1
      ORDER BY (status='fully_executed') DESC, created_at DESC LIMIT 1`
  ).bind(id).first();
  const drawings = (await db.prepare(
    `SELECT id, filename, size_bytes, created_at FROM proposal_attachments WHERE project_id=?1 ORDER BY created_at`
  ).bind(id).all()).results || [];
  const appointments = (await db.prepare(
    `SELECT id, type, start_at, end_at, status, site_address, rooms, notes FROM appointments
      WHERE project_id=?1 AND status NOT IN ('cancelled','canceled') ORDER BY start_at`
  ).bind(id).all().catch(() => ({ results: [] }))).results || [];
  const apptCrew = await getAssigneeMap(db, "appointment", appointments.map((a) => a.id));
  for (const a of appointments) a.assignees = apptCrew[a.id] || [];
  const notes = (await db.prepare(
    `SELECT id, body, author, created_at FROM project_notes WHERE project_id=?1 ORDER BY datetime(created_at) DESC`
  ).bind(id).all().catch(() => ({ results: [] }))).results || [];

  return json({
    project, scope, contract_type: contract ? contract.contract_type : null,
    job_notes: noted ? noted.job_notes : null, drawings, appointments, notes,
    assignees: await getAssignees(db, "project", id),
  });
}
