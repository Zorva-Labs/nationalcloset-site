// Shared lifecycle helpers — used by both admin endpoints (manual conversion)
// and the public token endpoints (auto-conversion on customer accept/sign).
import { genToken, nextSequence, formatDocNumber } from "./tokens.js";
import { recordActivity, recomputeTierTotals } from "./db.js";
import { depositForTotal } from "./financials.js";

// Appended to every contract's terms so a renter confirms they have the owner's
// permission before we remove existing shelving/cabinets and install our systems.
const RENTAL_CLAUSE = `<h3>Rental or Leased Property</h3><p>If this property is rented or leased, you confirm that you have obtained the property owner's or landlord's written permission for National Closet Company to remove any existing shelving, cabinets or fixtures and to install our systems in their place. Obtaining this permission is the customer's responsibility, and National Closet Company is not liable for any dispute arising from the lack of it.</p>`;

// The payment policy for any contract that carries a custom material order:
// 50% up front (or whatever covers materials + shipping, if that's more),
// 25% when the install is scheduled, 25% the day of install. Kept in one const
// so custom_order and wallprep can't drift apart.
const PAYMENT_SCHEDULE = `<h3>Payment Schedule</h3><p>The total contract price is paid in three installments:</p><ul><li><strong>50% due at signing</strong> (the &ldquo;Deposit&rdquo;) — or, if greater, the amount required to cover the materials, shipping and payment-processing fees for this order. Manufacturing and scheduling begin only after the Deposit is received.</li><li><strong>25% due when installation is scheduled</strong> — invoiced once all materials have arrived and the install date is set.</li><li><strong>25% due the day of installation.</strong></li></ul><p><strong>Paying in full.</strong> Instead of the schedule above, you may pay in full at signing or at any point afterward, and you may pay any individual installment early. There is no penalty or added fee for paying early.</p><p>The Deposit is non-refundable once materials are released to the manufacturer.</p>`;

// Used when the proposal was marked pay-in-full: a single payment replaces the
// 50/25/25 schedule above.
const PAY_IN_FULL = `<h3>Payment</h3><p>The total contract price is due <strong>in full at signing</strong>. Manufacturing and scheduling begin once payment is received. Payment is non-refundable once materials are released to the manufacturer.</p>`;

const MATERIALS_LEADTIME = `<h3>Materials &amp; Manufacture</h3><p>Custom materials typically take 4 to 8 weeks to be manufactured and delivered after the Deposit, depending on holidays, shipping, supplier lead times and other unforeseen circumstances. Once all materials have arrived, any repairs and the installation are scheduled.</p>`;

const FALLBACK_TERMS = {
  custom_order: MATERIALS_LEADTIME + PAYMENT_SCHEDULE + `<h3>Warranty</h3><p>Full manufacturer warranty on components + a 1-year workmanship guarantee from the date of installation.</p>` + RENTAL_CLAUSE,
  wallprep: MATERIALS_LEADTIME + `<h3>Wall Repair &amp; Paint</h3><p>We remove the existing shelving, patch and repair the walls, and paint the immediate installation area before the new system goes in.</p>` + PAYMENT_SCHEDULE + `<h3>Warranty</h3><p>Full manufacturer warranty on components + a 1-year workmanship guarantee from the date of installation.</p>` + RENTAL_CLAUSE,
  install_only: `<h3>Scope</h3><p>Install only — customer-supplied product. No deposit. Pay on completion. 90-day workmanship warranty on the install only.</p>` + RENTAL_CLAUSE,
  repair: `<h3>Scope</h3><p>Repair service. Pay on completion. 90-day warranty on the repair.</p>` + RENTAL_CLAUSE,
};

const FALLBACK_INTROS = {
  custom_order: "This agreement is between National Closet Company (Gallatin, TN) and the customer below for the supply and installation of custom closets and storage systems at the project address listed.",
  wallprep: "This agreement is between National Closet Company (Gallatin, TN) and the customer below for the supply and installation of custom closets and storage systems at the project address listed, and includes wall repair and painting of the immediate installation area before the new system is installed.",
  install_only: "This agreement is between National Closet Company (Gallatin, TN) and the customer below for the professional installation of closets and storage systems supplied by the customer at the project address listed.",
  repair: "This agreement is between National Closet Company (Gallatin, TN) and the customer below for the repair service detailed in the scope of work below.",
};

const FALLBACK_WINDOWS = {
  custom_order: "Materials 4–8 weeks (holidays/shipping/unforeseen delays may affect timing); install scheduled once materials arrive",
  wallprep: "Materials 4–8 weeks (holidays/shipping/unforeseen delays may affect timing); repairs and install scheduled once materials arrive",
  install_only: "Scheduled within 1–2 weeks of customer-supplied products arriving on site",
  repair: "Single visit, typically within 1 week",
};

/**
 * Create a draft contract from an accepted proposal tier.
 * Used by both POST /api/proposals/[id]/convert (admin) and POST /api/public/proposal/[token] (customer auto-accept).
 *
 * @param {D1Database} db
 * @param {object} proposal - the proposal row (must have id, project_id, number, selected_tier)
 * @param {object|null} actor - { kind: 'admin'|'customer', id?, name? }
 * @returns {Promise<{ contract_id: number, contract_number: string, view_token: string }>}
 */
export async function createContractFromProposalTier(db, proposal, actor = { kind: "system" }) {
  // Determine which tier — prefer selected, fall back to "best"
  const tierKey = proposal.selected_tier || "best";
  const tier = await db.prepare(`SELECT * FROM proposal_tiers WHERE proposal_id=?1 AND tier=?2`).bind(proposal.id, tierKey).first();
  if (!tier) throw new Error(`Tier "${tierKey}" not found on proposal ${proposal.id}`);

  // Use the contract type tied to the SELECTED option (each proposal option maps
  // to its own contract). Fall back to the proposal default, then custom_order.
  const validTypes = ["custom_order", "wallprep", "install_only", "repair"];
  const contractType = validTypes.includes(tier.contract_type)
    ? tier.contract_type
    : validTypes.includes(proposal.default_contract_type)
      ? proposal.default_contract_type
      : "custom_order";

  // Load default template for this contract type
  const tpl = await db.prepare(`SELECT * FROM document_templates WHERE kind='contract' AND subkind=?1 AND is_default=1 ORDER BY id LIMIT 1`).bind(contractType).first();
  const intro = tpl?.intro || FALLBACK_INTROS[contractType];
  let terms = tpl?.terms_html || FALLBACK_TERMS[contractType];
  const installWindow = tpl?.estimated_install_window || FALLBACK_WINDOWS[contractType];
  const scopeHtml = (tpl?.scope_html || "");

  // Pay-in-full carries over from the proposal. It swaps the 50/25/25 schedule
  // for a single payment and (below) sets the contract deposit to the full
  // total, so exactly one 100% invoice is raised and the scheduling/balance
  // milestones self-skip (nothing is left to bill).
  const paymentPlan = proposal.payment_plan === "full" ? "full" : "installments";
  if (paymentPlan === "full") terms = terms.replace(PAYMENT_SCHEDULE, PAY_IN_FULL);

  const year = new Date().getUTCFullYear();
  const seq = await nextSequence(db, `contract-${year}`);
  const number = formatDocNumber("C", year, seq);
  const token = genToken(16);
  const totalCents = tier.total_cents || 0;
  // Deposit is figured from the pre-discount GROSS (tier subtotal), so a
  // discount (which lives between subtotal and total) never lowers it.
  const grossBasis = (tier.subtotal_cents || 0) > totalCents ? tier.subtotal_cents : totalCents;
  // Pay-in-full → deposit is the whole total (one 100% invoice); otherwise the
  // usual ≥50% hard-cost deposit.
  const depositCents = paymentPlan === "full" ? totalCents : depositForTotal(grossBasis, totalCents);

  const r = await db.prepare(
    `INSERT INTO contracts (project_id, proposal_id, number, view_token, status, contract_type, total_cents, deposit_cents,
       intro, scope_html, terms_html, estimated_install_window, author_user_id, payment_plan)
     VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13) RETURNING id`
  ).bind(
    proposal.project_id, proposal.id, number, token, contractType, totalCents, depositCents,
    intro,
    scopeHtml + `<p>Per the accepted <strong>${tierKey}</strong> tier of proposal ${proposal.number}. See the itemized line items above.</p>`,
    terms,
    installWindow,
    actor?.kind === "admin" ? actor.id : null,
    paymentPlan,
  ).first();

  // Copy lines from the accepted tier
  const lines = (await db.prepare(`SELECT description, room, width_in, height_in, quantity, unit_price_cents, line_total_cents, position FROM proposal_tier_lines WHERE tier_id=?1 ORDER BY position, id`).bind(tier.id).all()).results || [];
  for (const l of lines) {
    await db.prepare(
      `INSERT INTO contract_lines (contract_id, description, room, width_in, height_in, quantity, unit_price_cents, line_total_cents, position)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`
    ).bind(
      r.id, l.description, l.room || null,
      l.width_in ?? null, l.height_in ?? null,
      l.quantity, l.unit_price_cents, l.line_total_cents, l.position
    ).run();
  }
  // No separate tax or shipping line — the quote's line-item prices are all-
  // inclusive (shipping, tax and installation), so the contract lines already
  // reconcile to the contract total.

  // Option 2 (wallprep): split the accepted amount so the job screen prices the
  // CLOSET on the ÷divisor formula and the WALL FINISHING as its own line.
  // Option 2 = Option 1's closet lines + the wall-finishing line, so the wall
  // amount is (Option 2 subtotal − Option 1 subtotal) and the closet is Option 1's
  // subtotal — description-independent, robust to renamed wall lines. Writing it
  // onto job_financials (price override = closet, wall_total = wall) keeps the
  // card, jobs list, reports and P&L all consistent from one source.
  if (contractType === "wallprep") {
    const good = await db.prepare(`SELECT subtotal_cents FROM proposal_tiers WHERE proposal_id=?1 AND tier='good'`).bind(proposal.id).first().catch(() => null);
    const option2Sub = tier.subtotal_cents || totalCents || 0;
    const closetCents = (good && good.subtotal_cents != null) ? good.subtotal_cents : option2Sub;
    const wallCents = Math.max(0, option2Sub - closetCents);
    if (wallCents > 0) {
      await db.prepare(
        `INSERT INTO job_financials (project_id, price_cents, price_auto, wall_total_cents, updated_at)
         VALUES (?1, ?2, 0, ?3, datetime('now'))
         ON CONFLICT(project_id) DO UPDATE SET price_cents=?2, price_auto=0, wall_total_cents=?3, updated_at=datetime('now')`
      ).bind(proposal.project_id, closetCents, wallCents).run().catch(() => {});
    }
  }

  // Advance the project status — accepting a proposal moves the job into "proposed"
  await db.prepare(`UPDATE projects SET status='proposed', updated_at=datetime('now') WHERE id=?1`).bind(proposal.project_id).run();

  await recordActivity(db, {
    entityType: "contract", entityId: r.id, action: "created-from-proposal",
    actorKind: actor?.kind || "system", actorId: actor?.id || null, actorName: actor?.name || null,
    details: { proposal_id: proposal.id, tier: tierKey, total_cents: totalCents },
  });

  return { contract_id: r.id, contract_number: number, view_token: token };
}

/**
 * Auto-mirror: Option 2 (the "better" tier) defaults to "everything in Option 1
 * (the "good" tier) + a Wall Finishing line." This only fires when Option 2 is
 * EMPTY and Option 1 has line items, so manual edits to Option 2 are preserved.
 * The admin can re-sync any time with the "Copy Option 1 + Wall Finishing"
 * button in the proposal editor.
 */
export async function autoMirrorOption2(db, proposalId) {
  const good = await db.prepare(`SELECT id FROM proposal_tiers WHERE proposal_id=?1 AND tier='good'`).bind(proposalId).first();
  const better = await db.prepare(`SELECT id FROM proposal_tiers WHERE proposal_id=?1 AND tier='better'`).bind(proposalId).first();
  if (!good || !better) return;
  const betterCount = (await db.prepare(`SELECT COUNT(*) AS c FROM proposal_tier_lines WHERE tier_id=?1`).bind(better.id).first())?.c || 0;
  if (betterCount > 0) return; // Option 2 has its own content — leave it alone
  const goodLines = (await db.prepare(
    `SELECT description, room, color, options, width_in, height_in, quantity, unit_price_cents, line_total_cents, product_id
       FROM proposal_tier_lines WHERE tier_id=?1 ORDER BY position, id`
  ).bind(good.id).all()).results || [];
  if (!goodLines.length) return; // nothing to mirror yet
  let pos = 0;
  for (const l of goodLines) {
    await db.prepare(
      `INSERT INTO proposal_tier_lines (tier_id, description, room, color, options, width_in, height_in, quantity, unit_price_cents, line_total_cents, position, product_id)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
    ).bind(better.id, l.description, l.room, l.color, l.options, l.width_in, l.height_in, l.quantity, l.unit_price_cents, l.line_total_cents, pos++, l.product_id).run();
  }
  await db.prepare(
    `INSERT INTO proposal_tier_lines (tier_id, description, room, quantity, unit_price_cents, line_total_cents, position)
     VALUES (?1, 'Wall Finishing — wall repair & fresh paint', 'Whole project', 1, 0, 0, ?2)`
  ).bind(better.id, pos).run();
  await recomputeTierTotals(db, better.id);
}

/**
 * Seed every tier on a proposal with one line per window from the project,
 * pulling product + price from the catalog. Called when a proposal is
 * created so the admin doesn't have to manually re-enter what was already
 * captured during the consultation.
 *
 * Lines are clockwise-ordered (matches the project Windows tab's ordering).
 */
export async function seedTiersFromWindows(db, proposalId, projectId) {
  // Clockwise wall sort key (back → right → front → left, then unassigned)
  const wallOrderSQL = `
    CASE w.wall
      WHEN 'back'  THEN 0
      WHEN 'right' THEN 1
      WHEN 'front' THEN 2
      WHEN 'left'  THEN 3
      ELSE 99 END
  `;
  const windows = (await db.prepare(`
    SELECT w.*, p.name AS product_name, p.base_price_cents
    FROM windows w
    LEFT JOIN products p ON p.id = w.product_id
    WHERE w.project_id = ?1
    ORDER BY ${wallOrderSQL}, w.position, w.id
  `).bind(projectId).all()).results || [];

  if (!windows.length) return;

  const tiers = (await db.prepare(`SELECT id FROM proposal_tiers WHERE proposal_id = ?1`).bind(proposalId).all()).results || [];

  for (const tier of tiers) {
    let pos = 0;
    let subtotal = 0;
    for (const w of windows) {
      if (!w.product_id || !w.product_name) continue;
      const unit = w.base_price_cents || 0;
      const total = unit; // qty = 1 per window
      const desc = w.product_name;
      await db.prepare(
        `INSERT INTO proposal_tier_lines (tier_id, description, room, color, width_in, height_in, quantity, unit_price_cents, line_total_cents, position, product_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7, ?8, ?9)`
      ).bind(
        tier.id, desc,
        w.room || null,
        w.color || null,
        w.width_in,
        w.height_in,
        unit,
        pos++,
        w.product_id,
      ).run();
      subtotal += total;
    }
    // Recompute subtotal + 9.75% sales tax + total from the lines just inserted.
    await recomputeTierTotals(db, tier.id);
  }
}

/**
 * After windows change on a project, refresh any draft proposals on that
 * project whose tier line items are still empty — these are proposals that
 * were created before the admin picked products on the windows. We never
 * touch a tier that already has lines (the admin may have hand-edited it).
 *
 * Returns the number of tiers re-seeded.
 */
export async function reseedEmptyProposalTiers(db, projectId) {
  const drafts = (await db.prepare(
    `SELECT id FROM proposals WHERE project_id = ?1 AND status IN ('draft','sent','viewed','tier_selected')`
  ).bind(projectId).all()).results || [];
  if (!drafts.length) return 0;

  let reseeded = 0;
  for (const p of drafts) {
    // Count lines across all tiers — only re-seed if ALL are empty
    const row = await db.prepare(
      `SELECT COUNT(ptl.id) AS line_count
         FROM proposal_tiers pt
         LEFT JOIN proposal_tier_lines ptl ON ptl.tier_id = pt.id
        WHERE pt.proposal_id = ?1`
    ).bind(p.id).first();
    if ((row?.line_count || 0) > 0) continue;
    await seedTiersFromWindows(db, p.id, projectId);
    await syncLeadQuotedFromProposal(db, p.id);
    reseeded++;
  }
  return reseeded;
}

/**
 * Sync the originating lead's quoted_amount_cents to the proposal's "best"
 * tier total (or whichever tier is currently selected, if the customer has
 * accepted one). Called whenever a proposal is created or its line items
 * change so the kanban / lead list always shows a real number.
 *
 * Returns the new amount in cents, or null if no lead is attached.
 */
export async function syncLeadQuotedFromProposal(db, proposalId) {
  const proposal = await db.prepare(
    `SELECT pr.*, p.lead_id FROM proposals pr JOIN projects p ON p.id = pr.project_id WHERE pr.id = ?1`
  ).bind(proposalId).first();
  if (!proposal || !proposal.lead_id) return null;

  // Pick the customer-selected tier if any, otherwise prefer 'best' → 'better' → 'good'
  const preferred = proposal.selected_tier || "best";
  const tiers = (await db.prepare(
    `SELECT tier, total_cents FROM proposal_tiers WHERE proposal_id = ?1`
  ).bind(proposalId).all()).results || [];
  if (!tiers.length) return null;

  const tierOrder = { best: 0, better: 1, good: 2 };
  const sorted = [...tiers].sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9));
  const tier = tiers.find((t) => t.tier === preferred) || sorted[0];
  const amount = tier?.total_cents || 0;

  await db.prepare(
    `UPDATE leads SET quoted_amount_cents = ?1, updated_at = datetime('now') WHERE id = ?2`
  ).bind(amount, proposal.lead_id).run();
  return amount;
}

// Lead pipeline rank — only forward transitions are allowed. A lead at
// "proposal" stays there when someone sends a follow-up email (no downgrade
// to "replied"); a lead at "booked" stays booked when someone schedules a
// post-install service call (no downgrade to "consult"). "installed" is
// terminal forward-progress and only set manually; "lost" is a hard terminal
// the admin chose, and we never auto-revive a lost lead.
const LEAD_STATUS_RANK = {
  new: 1, contacted: 2, replied: 3, consult: 4, proposal: 5, booked: 6, installed: 7, lost: 99,
};

/**
 * Move a lead's status forward to `target` IF the current status ranks lower
 * AND the lead isn't terminal (lost). No-op otherwise. Always logs activity
 * when a transition actually happens.
 *
 * Returns the new status (string), or null if no change.
 */
export async function bumpLeadStatusForward(db, leadId, target, { actor } = {}) {
  if (!leadId || !target || !(target in LEAD_STATUS_RANK)) return null;
  const lead = await db.prepare(`SELECT id, status FROM leads WHERE id=?1`).bind(leadId).first().catch(() => null);
  if (!lead) return null;
  const curRank = LEAD_STATUS_RANK[lead.status] ?? 0;
  const newRank = LEAD_STATUS_RANK[target];
  if (lead.status === "lost") return null;            // never auto-revive
  if (newRank <= curRank) return null;                 // forward-only
  await db.prepare(`UPDATE leads SET status=?1, updated_at=datetime('now') WHERE id=?2`).bind(target, leadId).run();
  await recordActivity(db, {
    entityType: "lead", entityId: leadId, action: target,
    actorKind: actor?.kind || "system", actorId: actor?.id || null, actorName: actor?.name || null,
    details: { from: lead.status, to: target, auto: true },
  });
  return target;
}

/**
 * Mark a project as fully booked (customer signed the contract).
 * - Updates project.status to 'contracted'
 * - If the project was spawned from a lead, bumps lead.status to 'booked'
 * - Logs activity on both
 */
export async function markProjectBooked(db, projectId, contractId) {
  // Look up the project to find any originating lead
  const project = await db.prepare(`SELECT id, lead_id FROM projects WHERE id=?1`).bind(projectId).first();
  if (!project) return;

  await db.prepare(`UPDATE projects SET status='contracted', updated_at=datetime('now') WHERE id=?1`).bind(projectId).run();
  await recordActivity(db, {
    entityType: "project", entityId: projectId, action: "booked",
    actorKind: "customer", details: { contract_id: contractId },
  });

  // If this project came from a lead, advance the lead's pipeline to 'booked'.
  // bumpLeadStatusForward handles activity logging + forward-only invariants.
  if (project.lead_id) {
    await bumpLeadStatusForward(db, project.lead_id, "booked", {
      actor: { kind: "customer" },
    });
  }
}
