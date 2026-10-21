// GET /api/public/invoice/[token] — the invoice summary for the customer's
// page. Invoices are paid by check (Michael, 2026-10-21: Stripe removed): the
// page shows the balance due and who the check is made out to, and the office
// records the check in the CRM.
import { json } from "../../../_lib/auth.js";
import { markInvoicePaid, getProjectBilling } from "../../../_lib/invoices.js";
import { dealPaidOnFile } from "../../../_lib/option-change.js";

// On a deposit/full invoice that hasn't been paid yet, the customer can choose
// to pay just the deposit or the whole job. Returns { deposit_cents, full_cents,
// current_plan } when a real choice exists, else null.
async function planInfo(db, inv) {
  if (!["deposit", "full"].includes(inv.type)) return null;
  if ((inv.amount_paid_cents || 0) > 0) return null;
  const billing = await getProjectBilling(db, inv.project_id, { contractId: inv.contract_id, proposalId: inv.proposal_id }).catch(() => null);
  const total = billing?.totalCents || 0;
  if (total <= 0) return null;
  const paidElsewhere = (await db.prepare(
    `SELECT COALESCE(SUM(amount_paid_cents),0) AS n FROM invoices WHERE project_id=?1 AND id != ?2 AND status != 'void'`
  ).bind(inv.project_id, inv.id).first().catch(() => null))?.n || 0;
  const depositCents = Math.min(billing.depositCents || 0, total);
  const fullCents = Math.max(depositCents, total - paidElsewhere);
  if (fullCents <= depositCents) return null; // deposit already covers the job
  return { deposit_cents: depositCents, full_cents: fullCents, current_plan: inv.type === "full" ? "full" : "deposit" };
}

// An unpaid deposit on a proposal with more than one option: the proposal's
// token, so the customer can go back and pick another (_lib/option-change.js).
async function changeOptionToken(db, inv) {
  if (!["deposit", "full"].includes(inv.type) || !inv.proposal_id || (inv.amount_paid_cents || 0) > 0) return null;
  const pr = await db.prepare(
    `SELECT view_token, (SELECT COUNT(*) FROM proposal_tiers WHERE proposal_id=proposals.id) AS n FROM proposals WHERE id=?1`
  ).bind(inv.proposal_id).first().catch(() => null);
  if (!pr || (pr.n || 0) < 2) return null;
  if (await dealPaidOnFile(db, inv.proposal_id)) return null;
  return pr.view_token;
}

// Resolve the target amount + invoice type for a chosen plan.
async function planTarget(db, inv, plan) {
  const billing = await getProjectBilling(db, inv.project_id, { contractId: inv.contract_id, proposalId: inv.proposal_id }).catch(() => null);
  const total = billing?.totalCents || 0;
  const paidElsewhere = (await db.prepare(
    `SELECT COALESCE(SUM(amount_paid_cents),0) AS n FROM invoices WHERE project_id=?1 AND id != ?2 AND status != 'void'`
  ).bind(inv.project_id, inv.id).first().catch(() => null))?.n || 0;
  const depositCents = Math.min(billing?.depositCents || 0, total);
  if (plan === "full") {
    return { amount: Math.max(depositCents, total - paidElsewhere), type: "full", description: "Payment in full for your custom closet project" };
  }
  return { amount: depositCents, type: "deposit", description: "Deposit to begin your custom closet project" };
}

function publicView(inv, project) {
  return {
    number: inv.number,
    amount_cents: inv.amount_cents,
    amount_paid_cents: inv.amount_paid_cents || 0,
    currency: inv.currency,
    description: inv.description,
    type: inv.type,
    status: inv.status,
    contact_name: project?.contact_name || "",
    project_name: project?.name || "",
    po_number: project?.po_number || "",
    discount_cents: inv.discount_cents || 0,
    discount_note: (inv.discount_cents || 0) > 0 ? (project?.final_discount_note || "") : "",
  };
}

export async function onRequestGet(context) {
  const token = context.params.token;
  const db = context.env.DB;
  const inv = await db.prepare(`SELECT * FROM invoices WHERE view_token=?1`).bind(token).first();
  if (!inv) return json({ error: "Invoice not found" }, 404);
  const project = await db.prepare(
    `SELECT p.id, p.name, p.po_number, p.final_discount_note, c.name AS contact_name, c.email AS contact_email
       FROM projects p JOIN contacts c ON c.id=p.contact_id WHERE p.id=?1`
  ).bind(inv.project_id).first().catch(() => null);

  if (inv.status === "void") {
    // Voided because the customer changed their option: point at the deal's
    // live invoice, so an old link still gets them to what they owe.
    let replacedBy = null;
    if (inv.proposal_id) {
      const r = await db.prepare(
        `SELECT view_token FROM invoices WHERE proposal_id=?1 AND id != ?2 AND status NOT IN ('void') ORDER BY id DESC LIMIT 1`
      ).bind(inv.proposal_id, inv.id).first().catch(() => null);
      replacedBy = r?.view_token || null;
    }
    return json({ voided: true, invoice: publicView(inv, project), replaced_by_token: replacedBy });
  }
  if (inv.status === "paid") return json({ paid: true, invoice: publicView(inv, project) });

  // Only the unpaid balance is due (earlier payments may have covered part of it).
  const due = Math.max(0, (inv.amount_cents || 0) - (inv.amount_paid_cents || 0));
  if (due <= 0) {
    await markInvoicePaid(context.env, inv, { method: inv.paid_method || "manual" }).catch(() => {});
    return json({ paid: true, invoice: publicView({ ...inv, status: "paid" }, project) });
  }
  return json({
    invoice: publicView(inv, project),
    due_cents: due,
    plan: await planInfo(db, inv),
    change_option_token: await changeOptionToken(db, inv),
  });
}

// POST { action: "set_plan", plan: "deposit" | "full" } — switch the invoice
// between paying the deposit and paying the whole job, before the customer
// writes the check. Updates the invoice amount and type.
export async function onRequestPost(context) {
  const token = context.params.token;
  const db = context.env.DB;
  const body = await context.request.json().catch(() => ({}));
  if (body.action !== "set_plan") return json({ error: "Unknown action" }, 400);
  const plan = body.plan === "full" ? "full" : "deposit";

  const inv = await db.prepare(`SELECT * FROM invoices WHERE view_token=?1`).bind(token).first();
  if (!inv) return json({ error: "Invoice not found" }, 404);
  if (inv.status === "paid") return json({ paid: true });
  if (inv.status === "void") return json({ error: "Invoice canceled" }, 400);
  if (!["deposit", "full"].includes(inv.type)) return json({ error: "This invoice can't be split" }, 400);
  if ((inv.amount_paid_cents || 0) > 0) return json({ error: "A payment has already been recorded" }, 400);

  const t = await planTarget(db, inv, plan);
  if (!t.amount || t.amount <= 0) return json({ error: "Nothing to charge" }, 400);
  await db.prepare(
    `UPDATE invoices SET amount_cents=?1, type=?2, description=?3, updated_at=datetime('now') WHERE id=?4`
  ).bind(t.amount, t.type, t.description, inv.id).run();
  return json({ ok: true, amount_cents: t.amount, plan: t.type });
}
