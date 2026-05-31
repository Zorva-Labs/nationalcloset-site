import { requireAuth, json } from "../../_lib/auth.js";
import { genToken, nextSequence, formatDocNumber } from "../../_lib/tokens.js";
import { recordActivity } from "../../_lib/db.js";
import { syncLeadQuotedFromProposal } from "../../_lib/lifecycle.js";

const TIERS = ["good", "better"];

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("project_id");
  let sql = `SELECT pr.*, p.name AS project_name, c.name AS contact_name, c.email AS contact_email
             FROM proposals pr
             JOIN projects p ON p.id = pr.project_id
             JOIN contacts c ON c.id = p.contact_id WHERE 1=1`;
  const binds = [];
  if (status) { binds.push(status); sql += ` AND pr.status=?${binds.length}`; }
  if (projectId) { binds.push(parseInt(projectId, 10)); sql += ` AND pr.project_id=?${binds.length}`; }
  sql += ` ORDER BY pr.created_at DESC LIMIT 200`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];
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
  // Load default proposal template
  const tpl = body.template_id
    ? await context.env.DB.prepare(`SELECT * FROM document_templates WHERE id=?1`).bind(body.template_id).first()
    : await context.env.DB.prepare(`SELECT * FROM document_templates WHERE kind='proposal' AND is_default=1 ORDER BY id LIMIT 1`).first();

  const intro = body.intro || tpl?.intro || "Thank you for the opportunity to design your custom closets. Below are two options: Option 1 installs your new system with the walls left as-is, and Option 2 adds patching and fresh paint of the area where your old shelving or cabinets were, before we install. Pick the one that fits.";
  const tierTitles = {
    good:   tpl?.tier_good_title   || "Option 1 · Design & Install (walls as-is)",
    better: tpl?.tier_better_title || "Option 2 · Design & Install + Wall Repair & Fresh Paint",
  };

  const r = await context.env.DB.prepare(
    `INSERT INTO proposals (project_id, number, view_token, status, intro, notes_internal, valid_until, author_user_id)
     VALUES (?1,?2,?3,'draft',?4,?5,?6,?7) RETURNING id`
  ).bind(body.project_id, number, token, intro, body.notes_internal || null, validUntil, auth.id).first();

  for (const t of TIERS) {
    await context.env.DB.prepare(`INSERT INTO proposal_tiers (proposal_id, tier, title) VALUES (?1,?2,?3)`).bind(r.id, t, tierTitles[t]).run();
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
