// Invoice lifecycle: create deposit/balance/custom invoices, compute amounts
// from the project's authoritative contract (or accepted proposal), and email
// the customer a branded pay link. Stripe PaymentIntents are created lazily on
// the public pay page; here we just create the invoice record + notify.
import { genToken, nextSequence, formatDocNumber } from "./tokens.js";
import { sendEmail, makeMessageId, brandedEmail } from "./email.js";
import { logOutboundEmail } from "./email-log.js";
import { recordActivity } from "./db.js";
import { markProjectBooked } from "./lifecycle.js";
import { sendStageEmail } from "./stage-emails.js";

const SITE_URL = "https://nationalclosetco.com";
export const DEPOSIT_RATE = 0.5; // default deposit = 50% when none specified

function money(cents) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// The dollar value of a project's work, from its most authoritative contract
// (executed > signed > sent > latest), falling back to an accepted proposal.
export async function getProjectBilling(db, projectId) {
  const k = await db.prepare(
    `SELECT id, total_cents, deposit_cents FROM contracts WHERE project_id=?1
      ORDER BY CASE status WHEN 'fully_executed' THEN 0 WHEN 'signed_by_customer' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END,
               datetime(created_at) DESC LIMIT 1`
  ).bind(projectId).first().catch(() => null);
  if (k) {
    return {
      totalCents: k.total_cents || 0,
      depositCents: k.deposit_cents && k.deposit_cents > 0 ? k.deposit_cents : Math.round((k.total_cents || 0) * DEPOSIT_RATE),
      contractId: k.id,
      proposalId: null,
    };
  }
  const p = await db.prepare(
    `SELECT id, selected_total_cents FROM proposals WHERE project_id=?1 AND status='accepted'
      ORDER BY datetime(created_at) DESC LIMIT 1`
  ).bind(projectId).first().catch(() => null);
  if (p) {
    const total = p.selected_total_cents || 0;
    return { totalCents: total, depositCents: Math.round(total * DEPOSIT_RATE), contractId: null, proposalId: p.id };
  }
  return { totalCents: 0, depositCents: 0, contractId: null, proposalId: null };
}

// Sum of non-void invoice amounts already created for a project (optionally of a type).
async function existingInvoice(db, projectId, type) {
  return await db.prepare(
    `SELECT * FROM invoices WHERE project_id=?1 AND type=?2 AND status != 'void' ORDER BY id DESC LIMIT 1`
  ).bind(projectId, type).first().catch(() => null);
}

// Create an invoice (idempotent for deposit/balance per project) and email the
// customer a pay link. Best-effort email; the invoice is always created.
// opts: { projectId, type, amountCents?, description?, proposalId?, contractId?, actor?, send=true }
export async function createInvoice(env, opts) {
  const db = env.DB;
  const { projectId, type } = opts;
  if (!projectId || !type) throw new Error("projectId + type required");

  // Dedup deposit/balance — don't double-bill if multiple triggers fire.
  if (type === "deposit" || type === "balance") {
    const dupe = await existingInvoice(db, projectId, type);
    if (dupe) return { invoice: dupe, deduped: true };
  }

  const project = await db.prepare(
    `SELECT p.*, c.name AS contact_name, c.email AS contact_email
       FROM projects p JOIN contacts c ON c.id=p.contact_id WHERE p.id=?1`
  ).bind(projectId).first();
  if (!project) throw new Error("project not found");

  const billing = await getProjectBilling(db, projectId);

  // Resolve the amount when not explicitly passed.
  let amountCents = opts.amountCents;
  if (amountCents == null) {
    if (type === "deposit") amountCents = billing.depositCents;
    else if (type === "balance") {
      const dep = await existingInvoice(db, projectId, "deposit");
      const depAmt = dep ? dep.amount_cents : 0;
      amountCents = Math.max(0, billing.totalCents - depAmt);
    } else if (type === "full") amountCents = billing.totalCents;
    else amountCents = 0;
  }
  amountCents = Math.round(amountCents || 0);
  if (amountCents <= 0) return { skipped: true, reason: "zero_amount" };

  const description = opts.description || ({
    deposit: "Deposit to begin your custom closet project",
    balance: "Final balance for your completed installation",
    full: "Custom closet project — payment",
  })[type] || "Invoice";

  const year = new Date().getUTCFullYear();
  const seq = await nextSequence(db, `invoice-${year}`);
  const number = formatDocNumber("INV", year, seq);
  const token = genToken(20);

  const row = await db.prepare(
    `INSERT INTO invoices (number, project_id, contact_id, proposal_id, contract_id, type, description, amount_cents, status, view_token, author_user_id)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'open',?9,?10) RETURNING *`
  ).bind(
    number, projectId, project.contact_id,
    opts.proposalId || billing.proposalId || null,
    opts.contractId || billing.contractId || null,
    type, description, amountCents, token, opts.actor?.id || null,
  ).first();

  await recordActivity(db, {
    entityType: "project", entityId: projectId, action: "invoice-created",
    actorKind: opts.actor?.id ? "admin" : "system", actorId: opts.actor?.id || null, actorName: opts.actor?.name || "auto",
    details: { invoice_id: row.id, number, type, amount_cents: amountCents },
  }).catch(() => {});

  if (opts.send !== false && project.contact_email) {
    await sendInvoiceEmail(env, row, project).catch((e) => console.error("[invoice-email]", String(e)));
  }
  return { invoice: row, created: true };
}

export async function sendInvoiceEmail(env, invoice, project) {
  const db = env.DB;
  if (!project) {
    project = await db.prepare(
      `SELECT p.*, c.name AS contact_name, c.email AS contact_email FROM projects p JOIN contacts c ON c.id=p.contact_id WHERE p.id=?1`
    ).bind(invoice.project_id).first();
  }
  if (!project?.contact_email) return { skipped: true, reason: "no_email" };

  const payUrl = `${SITE_URL}/invoice/?t=${invoice.view_token}`;
  const first = (project.contact_name || "there").split(" ")[0];
  const labelByType = { deposit: "deposit", balance: "final balance", full: "payment" };
  const label = labelByType[invoice.type] || "payment";
  const subject = `Invoice ${invoice.number} — ${money(invoice.amount_cents)} ${invoice.type === "deposit" ? "deposit" : "due"}`;
  const html = brandedEmail({
    title: `Your ${label} invoice is ready`,
    body: `
      <p>Hi ${first},</p>
      <p>Here's your ${label} invoice for your custom closet project:</p>
      <table style="border-collapse:collapse;margin:8px 0 4px">
        <tr><td style="padding:4px 16px 4px 0;color:#6B6457">Invoice</td><td style="padding:4px 0;font-weight:600">${invoice.number}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B6457">Amount due</td><td style="padding:4px 0;font-weight:700;font-size:18px">${money(invoice.amount_cents)}</td></tr>
      </table>
      <p>${invoice.description}.</p>
      <p>You can pay securely by card using the button below.</p>
    `,
    ctaLabel: `Pay ${money(invoice.amount_cents)}`,
    ctaUrl: payUrl,
  });
  const text = `Invoice ${invoice.number}: ${money(invoice.amount_cents)} due.\nPay securely: ${payUrl}`;
  const messageId = makeMessageId();
  const to = project.contact_name ? `${project.contact_name} <${project.contact_email}>` : project.contact_email;

  const res = await sendEmail(env, { to, subject, html, text, messageId });
  const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
  await logOutboundEmail(env, {
    to, subject, html, text, messageId,
    projectId: invoice.project_id, contactId: project.contact_id, leadId: project.lead_id || null,
    templateKind: `invoice_${invoice.type}`, status: failed ? "failed" : "sent",
    errorCode: failed ? (res?.reason || "send_error") : null,
    errorMessage: failed ? (res?.error || "send_failed").toString().slice(0, 240) : null,
  });
  return { ok: !failed };
}

// Email a receipt for a single payment that does NOT settle the invoice in full
// (a partial in-person payment). markInvoicePaid sends its own "paid in full"
// receipt; this one shows the remaining balance on the invoice so the customer
// knows what's still owed. Best-effort + logged to Messages.
export async function sendPaymentReceipt(env, invoice, { amountCents, method = "manual", paidAt, paidToDate } = {}) {
  const db = env.DB;
  const project = await db.prepare(
    `SELECT p.*, c.name AS contact_name, c.email AS contact_email FROM projects p JOIN contacts c ON c.id=p.contact_id WHERE p.id=?1`
  ).bind(invoice.project_id).first().catch(() => null);
  if (!project?.contact_email) return { skipped: true, reason: "no_email" };

  const first = (project.contact_name || "there").split(" ")[0];
  const total = invoice.amount_cents || 0;
  const paid = paidToDate != null ? paidToDate : (invoice.amount_paid_cents || 0);
  const balance = Math.max(0, total - paid);
  const whenLabel = paidAt ? new Date(paidAt.replace(" ", "T") + "Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : null;

  const subject = `Payment received — ${money(amountCents)} (${invoice.number})`;
  const html = brandedEmail({
    title: "Payment received — thank you!",
    body: `
      <p>Hi ${first},</p>
      <p>This confirms we've received your payment of <strong>${money(amountCents)}</strong> toward invoice <strong>${invoice.number}</strong>${method && method !== "manual" ? ` (${method})` : ""}.${whenLabel ? ` Received ${whenLabel}.` : ""} Thank you!</p>
      <table style="border-collapse:collapse;margin:8px 0 4px">
        <tr><td style="padding:4px 16px 4px 0;color:#6B6457">Payment received</td><td style="padding:4px 0;font-weight:600">${money(amountCents)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B6457">Invoice total</td><td style="padding:4px 0">${money(total)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B6457">Paid to date</td><td style="padding:4px 0">${money(paid)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6B6457">Balance due</td><td style="padding:4px 0;font-weight:700;font-size:18px">${money(balance)}</td></tr>
      </table>
      <p>Your remaining balance of <strong>${money(balance)}</strong> can be paid online anytime using the button below.</p>
    `,
    ctaLabel: `Pay remaining ${money(balance)}`,
    ctaUrl: `${SITE_URL}/invoice/?t=${invoice.view_token}`,
  });
  const text = `Payment received: ${money(amountCents)} toward ${invoice.number}.\n`
    + `Paid to date: ${money(paid)} of ${money(total)}.\nBalance due: ${money(balance)}.\n`
    + `Pay the remaining balance: ${SITE_URL}/invoice/?t=${invoice.view_token}`;
  const messageId = makeMessageId();
  const to = project.contact_name ? `${project.contact_name} <${project.contact_email}>` : project.contact_email;
  const res = await sendEmail(env, { to, subject, html, text, messageId });
  const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
  await logOutboundEmail(env, {
    to, subject, html, text, messageId,
    projectId: invoice.project_id, contactId: project.contact_id, leadId: project.lead_id || null,
    templateKind: "invoice_receipt", status: failed ? "failed" : "sent",
  }).catch(() => {});
  return { ok: !failed };
}

// Mark an invoice paid (called by the Stripe webhook or a manual admin action).
export async function markInvoicePaid(env, invoice, { method = "card", paymentIntentId, paidAt, sendReceipt = true } = {}) {
  const db = env.DB;
  // Re-check the live status (the passed row may be stale) so the webhook and
  // the on-page sync can't both run the booking/receipt twice.
  const fresh = await db.prepare(`SELECT status, amount_cents, amount_paid_cents FROM invoices WHERE id=?1`).bind(invoice.id).first().catch(() => null);
  if ((fresh?.status || invoice.status) === "paid") return { already: true };
  // paidAt lets an admin record an in-person payment on the date it was actually
  // collected; falls back to now (e.g. Stripe webhook).
  const when = paidAt || null;
  // This call settles the invoice IN FULL (online payment, or a manual payment
  // that covers the balance) — record the remaining amount as a ledger entry.
  const total = fresh?.amount_cents ?? invoice.amount_cents ?? 0;
  const priorPaid = fresh?.amount_paid_cents ?? invoice.amount_paid_cents ?? 0;
  const completing = Math.max(0, total - priorPaid);
  await db.prepare(
    `UPDATE invoices SET status='paid', paid_at=COALESCE(?1, datetime('now')), paid_method=?2, amount_paid_cents=?3,
       stripe_payment_intent_id=COALESCE(?4, stripe_payment_intent_id), updated_at=datetime('now') WHERE id=?5`
  ).bind(when, method, total, paymentIntentId || null, invoice.id).run();
  if (completing > 0) {
    await db.prepare(
      `INSERT INTO invoice_payments (invoice_id, amount_cents, method, paid_at) VALUES (?1, ?2, ?3, COALESCE(?4, datetime('now')))`
    ).bind(invoice.id, completing, method, when).run().catch(() => {});
  }

  // If this was the deposit, reflect it on the contract.
  if (invoice.type === "deposit" && invoice.contract_id) {
    await db.prepare(
      `UPDATE contracts SET deposit_paid=1, deposit_paid_at=COALESCE(?1, datetime('now')), deposit_paid_method=?2, updated_at=datetime('now') WHERE id=?3`
    ).bind(when, method, invoice.contract_id).run().catch(() => {});
  }

  // Booking happens HERE — when the deposit is paid, not at signing. Promote
  // the project into the booked pipeline and send the "Booked" stage email,
  // but only if it isn't already in a job stage (idempotent across the webhook
  // + the on-page payment sync + a manual mark-paid).
  if (invoice.type === "deposit") {
    const proj = await db.prepare(`SELECT status FROM projects WHERE id=?1`).bind(invoice.project_id).first().catch(() => null);
    const JOB = ["contracted", "scheduled_install", "installing", "completed"];
    if (proj && !JOB.includes(proj.status)) {
      await markProjectBooked(db, invoice.project_id, invoice.contract_id).catch((e) => console.error("[invoice/book]", String(e)));
      await sendStageEmail(env, "contracted", invoice.project_id, { name: "deposit" }).catch((e) => console.error("[invoice/book-email]", String(e)));
    }
  }

  await recordActivity(db, {
    entityType: "project", entityId: invoice.project_id, action: "invoice-paid",
    actorKind: "customer", actorName: "Stripe",
    details: { invoice_id: invoice.id, number: invoice.number, amount_cents: invoice.amount_cents, method },
  }).catch(() => {});

  // Receipt / confirmation email (branded + logged to Messages).
  const project = await db.prepare(
    `SELECT p.*, c.name AS contact_name, c.email AS contact_email FROM projects p JOIN contacts c ON c.id=p.contact_id WHERE p.id=?1`
  ).bind(invoice.project_id).first().catch(() => null);
  if (sendReceipt && project?.contact_email) {
    const first = (project.contact_name || "there").split(" ")[0];

    // Remaining balance on the whole project = job total − everything paid so
    // far (this payment is already marked paid above, so it's included).
    const billing = await getProjectBilling(db, invoice.project_id).catch(() => ({ totalCents: 0 }));
    const paidRow = await db.prepare(
      `SELECT COALESCE(SUM(amount_cents),0) AS paid FROM invoices WHERE project_id=?1 AND status='paid'`
    ).bind(invoice.project_id).first().catch(() => null);
    const paidSum = paidRow?.paid || 0;
    const hasTotal = (billing.totalCents || 0) > 0;
    // Project-level amount still to come AFTER this invoice (e.g. the final
    // balance that follows a deposit). This is NOT a balance owed on the
    // invoice the customer just paid — that invoice is paid in full.
    const futureBalance = Math.max(0, (billing.totalCents || 0) - paidSum);
    const futureLabel = invoice.type === "deposit" ? "Final balance (due at completion)" : "Remaining project balance";

    const subject = `Receipt — ${money(invoice.amount_cents)} paid in full (${invoice.number})`;
    const html = brandedEmail({
      title: "Payment received — thank you!",
      body: `
        <p>Hi ${first},</p>
        <p>We've received your payment of <strong>${money(invoice.amount_cents)}</strong> — invoice <strong>${invoice.number}</strong> is <strong>paid in full</strong>. Thank you!</p>
        <table style="border-collapse:collapse;margin:8px 0 4px">
          <tr><td style="padding:4px 16px 4px 0;color:#6B6457">Amount paid</td><td style="padding:4px 0;font-weight:700;font-size:18px">${money(invoice.amount_cents)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#6B6457">Invoice ${invoice.number}</td><td style="padding:4px 0;color:#067647;font-weight:600">Paid in full ✓</td></tr>
          ${hasTotal && futureBalance > 0 ? `<tr><td style="padding:4px 16px 4px 0;color:#6B6457">Project total</td><td style="padding:4px 0">${money(billing.totalCents)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#6B6457">${futureLabel}</td><td style="padding:4px 0;font-weight:600">${money(futureBalance)}</td></tr>` : ""}
        </table>
        ${invoice.type === "deposit"
          ? `<p>Your order is now moving forward — we'll be in touch to schedule your installation.${hasTotal && futureBalance > 0 ? ` The final balance of <strong>${money(futureBalance)}</strong> will be invoiced once your installation is complete.` : ""}</p>`
          : (hasTotal && futureBalance > 0 ? `<p>Your remaining project balance of <strong>${money(futureBalance)}</strong> will be invoiced when it's due.</p>` : "")}
        ${hasTotal && futureBalance <= 0 ? `<p>Your project is now paid in full. 🎉 Thank you for choosing National Closet Company!</p>` : ""}
      `,
    });
    const text = `Payment received: ${money(invoice.amount_cents)} — invoice ${invoice.number} paid in full. Thank you!`
      + (hasTotal && futureBalance > 0 ? `\n${futureLabel}: ${money(futureBalance)}` : (hasTotal ? `\nProject paid in full.` : ""));
    const messageId = makeMessageId();
    const to = project.contact_name ? `${project.contact_name} <${project.contact_email}>` : project.contact_email;
    const res = await sendEmail(env, { to, subject, html, text, messageId });
    const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
    await logOutboundEmail(env, {
      to, subject, html, text, messageId,
      projectId: invoice.project_id, contactId: project.contact_id, leadId: project.lead_id || null,
      templateKind: "invoice_receipt", status: failed ? "failed" : "sent",
    }).catch(() => {});
  }
  return { ok: true };
}
