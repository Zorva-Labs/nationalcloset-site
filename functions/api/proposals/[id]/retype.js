// POST /api/proposals/:id/retype  { proposal_kind: "custom" | "install_only" | "repair" }
// Rebuilds a draft proposal's options to match the chosen type and links each
// option to its corresponding contract. Replaces existing tiers (and their line
// items), so it is intended for drafts before line items are finalized.

import { requireAuth, json } from "../../../_lib/auth.js";
import { recordActivity } from "../../../_lib/db.js";
import { proposalTiersForKind, defaultContractTypeForKind } from "../../../_lib/proposal-tiers.js";

const KINDS = ["custom", "install_only", "repair"];

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const kind = KINDS.includes(body.proposal_kind) ? body.proposal_kind : "custom";

  const p = await context.env.DB.prepare(`SELECT * FROM proposals WHERE id=?1`).bind(id).first();
  if (!p) return json({ error: "Not found" }, 404);
  if (p.status !== "draft") return json({ error: "Only draft proposals can change type." }, 400);

  // Template for this kind (for intro + tier titles)
  const tpl = await context.env.DB.prepare(
    `SELECT * FROM document_templates WHERE kind='proposal' AND subkind=?1 ORDER BY id LIMIT 1`
  ).bind(kind).first();

  // Wipe existing options (proposal_tier_lines cascade off proposal_tiers)
  await context.env.DB.prepare(`DELETE FROM proposal_tiers WHERE proposal_id=?1`).bind(id).run();

  const tiers = proposalTiersForKind(kind, tpl);
  for (const t of tiers) {
    await context.env.DB.prepare(
      `INSERT INTO proposal_tiers (proposal_id, tier, title, description, contract_type) VALUES (?1,?2,?3,?4,?5)`
    ).bind(id, t.key, t.title, t.description || null, t.contract_type).run();
  }

  await context.env.DB.prepare(
    `UPDATE proposals SET intro=?1, default_contract_type=?2, updated_at=datetime('now') WHERE id=?3`
  ).bind(tpl?.intro || p.intro, defaultContractTypeForKind(kind), id).run();

  await recordActivity(context.env.DB, {
    entityType: "proposal", entityId: id, action: "retyped",
    actorKind: "admin", actorId: auth.id, actorName: auth.email, details: { kind },
  });

  return json({ ok: true, kind, options: tiers.length });
}
