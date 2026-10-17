// A customer who signed one option of a proposal and then wants another
// (Helena Kirkendall, PROP-2026-0056, 2026-10-16: signed Option 1, asked for
// Option 2 before paying anything). Until money moves, the switch is theirs to
// make online: the contract they signed and its unpaid deposit invoice are
// voided (the Stripe intent canceled, so the old amount can never be charged),
// and they sign a new contract for the new option and pay its deposit.
// Once any payment on the deal is paid, processing or waiting on bank
// verification, the switch is the office's (a refund or a credit is involved).
import { recordActivity } from "./db.js";
import { retrievePaymentIntent, cancelPaymentIntent } from "./stripe.js";

const SIGNED = ["signed_by_customer", "fully_executed"];

// Every invoice that belongs to this proposal's deal: raised on the proposal or
// on any of its contracts.
async function dealInvoices(db, proposalId) {
  return (await db.prepare(
    `SELECT * FROM invoices
      WHERE proposal_id=?1 OR contract_id IN (SELECT id FROM contracts WHERE proposal_id=?1)
      ORDER BY id`
  ).bind(proposalId).all().catch(() => ({ results: [] }))).results || [];
}

// The proposal's live contract: the newest one that isn't void.
export async function liveContract(db, proposalId) {
  return await db.prepare(
    `SELECT * FROM contracts WHERE proposal_id=?1 AND status != 'void' ORDER BY id DESC LIMIT 1`
  ).bind(proposalId).first().catch(() => null);
}

export const isSignedContract = (k) => !!k && SIGNED.includes(k.status);

// Has money moved on this deal? Reads D1 only, for the pages' GETs.
export async function dealPaidOnFile(db, proposalId) {
  const invs = await dealInvoices(db, proposalId);
  return invs.some((i) => i.status !== "void" && (["paid", "processing"].includes(i.status) || (i.amount_paid_cents || 0) > 0));
}

// The same question asked of Stripe too, before anything is voided: an intent
// that succeeded or is processing before the webhook landed, or a bank account
// waiting on micro-deposit verification, counts as money moving.
async function dealPaidLive(env, invs) {
  for (const i of invs) {
    if (i.status === "void") continue;
    if (["paid", "processing"].includes(i.status) || (i.amount_paid_cents || 0) > 0) return true;
    if (i.stripe_payment_intent_id && env.STRIPE_SECRET_KEY) {
      const pi = await retrievePaymentIntent(env, i.stripe_payment_intent_id).catch(() => null);
      if (pi && (pi.status === "succeeded" || pi.status === "processing" ||
                 (pi.status === "requires_action" && pi.next_action?.type === "verify_with_microdeposits"))) return true;
    }
  }
  return false;
}

/**
 * Void the proposal's live contracts and its unpaid deal invoices so a new
 * option can be contracted. Refuses (returns { paid: true }, changes nothing)
 * when money has moved on the deal.
 * @returns {Promise<{ paid?: true, voidedContracts: object[], voidedInvoices: object[] }>}
 */
export async function supersedeDeal(env, proposalId, { actorName = null, toTier = null } = {}) {
  const db = env.DB;
  const invs = await dealInvoices(db, proposalId);
  if (await dealPaidLive(env, invs)) return { paid: true, voidedContracts: [], voidedInvoices: [] };

  const contracts = (await db.prepare(
    `SELECT id, number, status, contract_type, total_cents, project_id FROM contracts WHERE proposal_id=?1 AND status != 'void'`
  ).bind(proposalId).all()).results || [];
  const voidedInvoices = [];
  for (const i of invs) {
    if (i.status === "void") continue;
    if (i.stripe_payment_intent_id && env.STRIPE_SECRET_KEY) {
      await cancelPaymentIntent(env, i.stripe_payment_intent_id).catch((e) => console.error("[option-change/cancel-pi]", String(e)));
    }
    await db.prepare(`UPDATE invoices SET status='void', updated_at=datetime('now') WHERE id=?1`).bind(i.id).run();
    await recordActivity(db, {
      entityType: "project", entityId: i.project_id, action: "invoice-voided",
      actorKind: "customer", actorName,
      details: { invoice_id: i.id, number: i.number, reason: "option-changed", to_tier: toTier },
    }).catch(() => {});
    voidedInvoices.push(i);
  }
  for (const k of contracts) {
    await db.prepare(`UPDATE contracts SET status='void', updated_at=datetime('now') WHERE id=?1`).bind(k.id).run();
    await recordActivity(db, {
      entityType: "contract", entityId: k.id, action: "voided",
      actorKind: "customer", actorName,
      details: { reason: "option-changed", was: k.status, to_tier: toTier },
    }).catch(() => {});
    // Option 2 (wallprep) wrote its price onto the job card when it was
    // accepted (_lib/lifecycle.js). Leaving Option 2 hands the price back to
    // the contracts, unless someone has since set it by hand.
    if (k.contract_type === "wallprep") {
      await db.prepare(
        `UPDATE job_financials SET price_auto=1, price_cents=0, materials_charged_cents=0, wall_charged_cents=0, updated_at=datetime('now')
          WHERE project_id=?1 AND price_auto=0 AND price_cents=?2`
      ).bind(k.project_id, k.total_cents).run().catch(() => {});
    }
  }
  return { voidedContracts: contracts, voidedInvoices };
}
