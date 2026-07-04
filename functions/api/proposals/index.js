import { requireAuth, json } from "../../_lib/auth.js";
import { genToken, nextSequence, formatDocNumber } from "../../_lib/tokens.js";
import { recordActivity } from "../../_lib/db.js";
import { syncLeadQuotedFromProposal } from "../../_lib/lifecycle.js";
import { proposalTiersForKind, defaultContractTypeForKind, introForKind } from "../../_lib/proposal-tiers.js";
import { resolveFinancials } from "../../_lib/financials.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("project_id");
  // Headline tier = the selected option if one is picked, else the highest-total
  // option. (D1 rejects a correlated pr.selected_tier inside a subquery ORDER BY,
  // so the selected tier is pulled via WHERE and the top tier via ORDER BY; we
  // pick between them in JS.) net = proposed total, gross (subtotal) = cost basis.
  let sql = `SELECT pr.*, p.name AS project_name, c.name AS contact_name, c.email AS contact_email,
               (SELECT t.total_cents    FROM proposal_tiers t WHERE t.proposal_id=pr.id AND t.tier=pr.selected_tier LIMIT 1) AS sel_net,
               (SELECT t.subtotal_cents FROM proposal_tiers t WHERE t.proposal_id=pr.id AND t.tier=pr.selected_tier LIMIT 1) AS sel_gross,
               (SELECT t.title          FROM proposal_tiers t WHERE t.proposal_id=pr.id AND t.tier=pr.selected_tier LIMIT 1) AS sel_title,
               (SELECT t.total_cents    FROM proposal_tiers t WHERE t.proposal_id=pr.id ORDER BY t.total_cents DESC LIMIT 1) AS top_net,
               (SELECT t.subtotal_cents FROM proposal_tiers t WHERE t.proposal_id=pr.id ORDER BY t.total_cents DESC LIMIT 1) AS top_gross
             FROM proposals pr
             JOIN projects p ON p.id = pr.project_id
             JOIN contacts c ON c.id = p.contact_id WHERE 1=1`;
  const binds = [];
  if (status) { binds.push(status); sql += ` AND pr.status=?${binds.length}`; }
  if (projectId) { binds.push(parseInt(projectId, 10)); sql += ` AND pr.project_id=?${binds.length}`; }
  sql += ` ORDER BY pr.created_at DESC LIMIT 200`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];

  // Proposed total + estimated profit (formula-based; proposals are pre-job).
  for (const r of rows) {
    const net = (r.sel_net != null) ? r.sel_net : r.top_net;
    const grossRaw = (r.sel_net != null) ? r.sel_gross : r.top_gross;
    const tot = net != null ? net : (r.selected_total_cents || 0);
    const sub = grossRaw != null ? grossRaw : tot;
    const gross = sub > tot ? sub : tot;
    const discount = sub > tot ? sub - tot : 0;
    r.proposed_total_cents = tot;
    r.selected_title = r.selected_tier ? (r.sel_title || null) : null;  // name of the option the client picked
    r.profit_cents = tot ? resolveFinancials(gross, discount, null).profit_cents : null;
  }
  return json({ proposals: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  if (!body.project_id) return json({ error: "Missing project_id" }, 400);
  const year = new Date().getUTCFullYear();
  const seq = await nextSequence(context.env.DB, `proposal-${year}`);
  const number = formatDocNumber("PROP", year, seq);
  const token = genToken(16);
  const validDays = parseInt(body.valid_days || 30, 10);
  const validUntil = new Date(Date.now() + validDays * 86400 * 1000).toISOString().slice(0, 10);
  // Select the proposal template: by explicit id, by kind (subkind), or default.
  let tpl = null;
  if (body.template_id) {
    tpl = await context.env.DB.prepare(`SELECT * FROM document_templates WHERE id=?1`).bind(body.template_id).first();
  } else if (body.proposal_kind) {
    tpl = await context.env.DB.prepare(`SELECT * FROM document_templates WHERE kind='proposal' AND subkind=?1 ORDER BY id LIMIT 1`).bind(body.proposal_kind).first();
  }
  if (!tpl) tpl = await context.env.DB.prepare(`SELECT * FROM document_templates WHERE kind='proposal' AND (is_default=1 OR subkind='custom') ORDER BY is_default DESC, id LIMIT 1`).first();

  // Map the proposal kind to its option(s) + per-option contract type.
  const kind = body.proposal_kind || tpl?.subkind || "custom";
  const intro = body.intro || tpl?.intro || introForKind(kind);
  const tiers = proposalTiersForKind(kind, tpl);
  const defaultContractType = defaultContractTypeForKind(kind);

  const r = await context.env.DB.prepare(
    `INSERT INTO proposals (project_id, number, view_token, status, intro, notes_internal, valid_until, default_contract_type, author_user_id)
     VALUES (?1,?2,?3,'draft',?4,?5,?6,?7,?8) RETURNING id`
  ).bind(body.project_id, number, token, intro, body.notes_internal || null, validUntil, defaultContractType, auth.id).first();

  for (const t of tiers) {
    await context.env.DB.prepare(`INSERT INTO proposal_tiers (proposal_id, tier, title, contract_type) VALUES (?1,?2,?3,?4)`).bind(r.id, t.key, t.title, t.contract_type).run();
  }

  // Tiers start empty — the admin adds closet line items from the catalog.
  // Mirror the proposal total back to the lead's quoted_amount_cents
  await syncLeadQuotedFromProposal(context.env.DB, r.id);
  await recordActivity(context.env.DB, {
    entityType: "proposal", entityId: r.id, action: "created",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  return json({ id: r.id, number, view_token: token });
}

function defaultTitle(t) {
  return { good: "Option 1 · Design & Install (walls as-is)", better: "Option 2 · Design & Install + Wall Repair & Fresh Paint" }[t];
}
