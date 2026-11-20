// Crew pay and Gusto (Michael, 2026-11-20). Admin only: /api/payouts is not in
// _lib/roles.js, so requireAuth refuses sales and installers.
//
// Logged against the bill, never the job: the job's history is open to sales.
//
// GET  /api/payouts?project_id=N — that job's crew pay, and the roster to pay from
// GET  /api/payouts               — every crew pay bill, and Gusto's side as of the
//                                  last sync (contractors, payments, payrolls, to-dos)
// POST /api/payouts { project_id, team_member_id, amount_cents, kind: "job"|"commission", note }
//      — what a person is owed for a completed job. It is a bill (expenses row,
//        source 'crew_pay', gusto_status 'owed'), so Payables and Cash flow carry
//        it. tools/crm/gusto.mjs prepares the Gusto payment from it and marks it
//        paid once Gusto funds it. Nothing here moves money.
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";
import { todayCentral } from "../../_lib/dates.js";

const KIND = { job: "Crew pay", commission: "Commission" };

const PAYOUT_SQL = `
  SELECT e.id, e.project_id, p.name AS project_name, e.team_member_id, t.name AS person,
         t.gusto_contractor_uuid, e.vendor, e.description, e.category, e.amount_cents,
         e.amount_paid_cents, e.status, e.gusto_status, e.gusto_ref, e.prepared_at,
         e.paid_at, e.bill_date, e.notes, e.created_by, e.created_at
    FROM expenses e
    LEFT JOIN projects p ON p.id = e.project_id
    LEFT JOIN team_members t ON t.id = e.team_member_id
   WHERE e.source = 'crew_pay' AND e.status != 'void'`;

async function roster(DB) {
  return (await DB.prepare(
    `SELECT id, name, role, gusto_contractor_uuid FROM team_members WHERE active = 1 ORDER BY name`
  ).all()).results || [];
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const DB = context.env.DB;
  const projectId = parseInt(new URL(context.request.url).searchParams.get("project_id") || "", 10);

  if (projectId) {
    const payouts = (await DB.prepare(PAYOUT_SQL + ` AND e.project_id = ?1 ORDER BY e.id`).bind(projectId).all()).results || [];
    return json({ payouts, team: await roster(DB) });
  }

  const year = todayCentral().slice(0, 4);
  const [payouts, contractors, payments, payrolls, tasks, lastSync] = await Promise.all([
    DB.prepare(PAYOUT_SQL + ` ORDER BY CASE e.gusto_status WHEN 'owed' THEN 0 WHEN 'prepared' THEN 1 ELSE 2 END, e.bill_date DESC, e.id DESC LIMIT 300`).all(),
    DB.prepare(`SELECT c.*, t.name AS team_name FROM gusto_contractors c LEFT JOIN team_members t ON t.id = c.team_member_id ORDER BY c.is_active DESC, c.name`).all(),
    DB.prepare(`SELECT g.*, c.name AS contractor_name, e.project_id, p.name AS project_name
                  FROM gusto_payments g
                  LEFT JOIN gusto_contractors c ON c.uuid = g.contractor_uuid
                  LEFT JOIN expenses e ON e.id = g.expense_id
                  LEFT JOIN projects p ON p.id = e.project_id
                 WHERE substr(g.pay_date, 1, 4) >= ?1
                 ORDER BY g.pay_date DESC LIMIT 200`).bind(String(Number(year) - 1)).all(),
    DB.prepare(`SELECT * FROM gusto_payrolls ORDER BY check_date DESC LIMIT 50`).all(),
    DB.prepare(`SELECT * FROM gusto_tasks ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, COALESCE(due_at, '9999') LIMIT 50`).all(),
    DB.prepare(`SELECT ran_at, summary FROM gusto_sync ORDER BY id DESC LIMIT 1`).first(),
  ]);
  const rows = payouts.results || [];
  const sum = (s) => rows.filter((r) => r.gusto_status === s).reduce((a, r) => a + (r.amount_cents - (r.amount_paid_cents || 0)), 0);
  return json({
    payouts: rows,
    owed_cents: sum("owed"),
    prepared_cents: sum("prepared"),
    year,
    gusto: {
      contractors: contractors.results || [],
      payments: payments.results || [],
      payrolls: payrolls.results || [],
      tasks: tasks.results || [],
      last_sync: lastSync || null,
    },
    team: await roster(DB),
  });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const DB = context.env.DB;
  const b = await context.request.json().catch(() => ({}));
  const projectId = parseInt(b.project_id, 10);
  const memberId = parseInt(b.team_member_id, 10);
  const amount = Math.round(Number(b.amount_cents) || 0);
  const kind = KIND[b.kind] ? b.kind : "job";
  if (!projectId || !memberId) return json({ error: "Pick the job and the person." }, 400);
  if (!(amount > 0)) return json({ error: "Amount must be greater than 0." }, 400);

  const project = await DB.prepare(`SELECT id, name FROM projects WHERE id = ?1`).bind(projectId).first();
  if (!project) return json({ error: "Job not found." }, 404);
  const member = await DB.prepare(`SELECT id, name, gusto_contractor_uuid FROM team_members WHERE id = ?1 AND active = 1`).bind(memberId).first();
  if (!member) return json({ error: "That person isn't on the active roster." }, 404);

  const today = todayCentral();
  const note = String(b.note || "").trim().slice(0, 500) || null;
  const r = await DB.prepare(
    `INSERT INTO expenses (vendor, description, category, project_id, amount_cents, bill_date, due_date, notes,
                           created_by, team_member_id, source, gusto_status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7, ?8, ?9, 'crew_pay', 'owed') RETURNING id`
  ).bind(member.name, `${KIND[kind]} — ${project.name}`, KIND[kind], projectId, amount, today, note, auth.email, memberId).first();

  await recordActivity(DB, {
    entityType: "expense", entityId: r.id, action: "created",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { crew_pay: true, project_id: projectId, person: member.name, amount_cents: amount, kind },
  }).catch(() => {});
  return json({ id: r.id, in_gusto: !!member.gusto_contractor_uuid });
}
