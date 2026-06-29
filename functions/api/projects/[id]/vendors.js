// GET    /api/projects/[id]/vendors  — vendors assigned to a job + the cost each
//                                       role carries + whether a bill exists yet
// POST   /api/projects/[id]/vendors   { vendor_id, role }   — assign / replace
// DELETE /api/projects/[id]/vendors?role=installer          — unassign
//
// Role → cost mapping (mirrors the job cost model):
//   manufacturer → materials cost (paid up front when ordered)
//   installer    → labor cost     (A/P after the job is complete)
import { requireAuth, json } from "../../../_lib/auth.js";
import { getProjectBilling } from "../../../_lib/invoices.js";
import { resolveFinancials } from "../../../_lib/financials.js";

export const JOB_VENDOR_ROLES = [
  { role: "manufacturer", label: "Manufacturer", cost: "materials", blurb: "Supplies the materials — paid up front when the job is ordered." },
  { role: "installer", label: "Installer", cost: "labor", blurb: "Installs the job — paid after the job is complete (accounts payable)." },
];

// Gross (pre-discount) cost basis + dollar discount — same logic as the
// financials endpoint's defaultBasis.
async function defaultBasis(env, projectId) {
  const tier = await env.DB.prepare(
    `SELECT t.subtotal_cents AS gross, t.total_cents AS net
       FROM proposals p JOIN proposal_tiers t ON t.proposal_id = p.id AND t.tier = p.selected_tier
      WHERE p.project_id = ?1 AND p.status = 'accepted'
      ORDER BY datetime(p.created_at) DESC LIMIT 1`
  ).bind(projectId).first().catch(() => null);
  if (tier && (tier.gross || tier.net)) {
    const sub = tier.gross || 0, tot = tier.net || 0;
    if (sub > tot) return { grossCents: sub, discountCents: sub - tot };
    return { grossCents: tot || sub, discountCents: 0 };
  }
  const b = await getProjectBilling(env.DB, projectId).catch(() => null);
  return { grossCents: b?.totalCents || 0, discountCents: 0 };
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const { DB } = context.env;
  const project = await DB.prepare(`SELECT id, status FROM projects WHERE id=?1`).bind(id).first();
  if (!project) return json({ error: "Not found" }, 404);

  const row = await DB.prepare(`SELECT * FROM job_financials WHERE project_id=?1`).bind(id).first().catch(() => null);
  const basis = await defaultBasis(context.env, id);
  const fin = resolveFinancials(basis.grossCents, basis.discountCents, row);
  const costFor = { materials: fin.materials_cents, labor: fin.labor_cents };

  // Assigned vendors for this job.
  const assigned = (await DB.prepare(
    `SELECT pv.role, v.id AS vendor_id, v.name, v.company, v.role AS vendor_role
       FROM project_vendors pv JOIN vendors v ON v.id = pv.vendor_id
      WHERE pv.project_id = ?1`
  ).bind(id).all()).results || [];
  const byRole = {}; for (const a of assigned) byRole[a.role] = a;

  // Any bill already logged to that vendor for this job (so the UI can show
  // "Billed ✓" instead of offering to create a duplicate).
  const roles = [];
  for (const def of JOB_VENDOR_ROLES) {
    const a = byRole[def.role] || null;
    let bill = null;
    if (a) {
      bill = await DB.prepare(
        `SELECT id, amount_cents, amount_paid_cents, status FROM expenses
          WHERE project_id=?1 AND vendor_id=?2 AND status!='void'
          ORDER BY id DESC LIMIT 1`
      ).bind(id, a.vendor_id).first().catch(() => null);
    }
    roles.push({
      role: def.role, label: def.label, cost: def.cost, blurb: def.blurb,
      cost_cents: costFor[def.cost] || 0,
      vendor: a ? { id: a.vendor_id, name: a.name, company: a.company, role: a.vendor_role } : null,
      bill,
    });
  }

  // Vendor picker — installers first for the installer slot, manufacturers for
  // the manufacturer slot; the client filters/sorts. Send the whole book.
  const vendors = (await DB.prepare(`SELECT id, name, company, role, title FROM vendors ORDER BY name`).all()).results || [];

  return json({ project_id: id, status: project.status, roles, vendors });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const b = await context.request.json().catch(() => ({}));
  const role = (b.role || "").toString();
  const vendorId = parseInt(b.vendor_id, 10);
  if (!JOB_VENDOR_ROLES.some((r) => r.role === role)) return json({ error: "Invalid role" }, 400);
  if (!vendorId) return json({ error: "vendor_id required" }, 400);
  const vendor = await context.env.DB.prepare(`SELECT id FROM vendors WHERE id=?1`).bind(vendorId).first();
  if (!vendor) return json({ error: "Vendor not found" }, 404);
  await context.env.DB.prepare(
    `INSERT INTO project_vendors (project_id, vendor_id, role) VALUES (?1,?2,?3)
     ON CONFLICT(project_id, role) DO UPDATE SET vendor_id=?2, created_at=datetime('now')`
  ).bind(id, vendorId, role).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const url = new URL(context.request.url);
  const role = url.searchParams.get("role");
  if (!role) return json({ error: "role required" }, 400);
  await context.env.DB.prepare(`DELETE FROM project_vendors WHERE project_id=?1 AND role=?2`).bind(id, role).run();
  return json({ ok: true });
}
