// GET /api/public/contract/[token]  → contract data for customer review + sign
// POST /api/public/contract/[token]  body: { action: "sign", signer_name, signer_email, signature_image }
import { json, hashIp } from "../../../_lib/auth.js";
import { sha256Hex } from "../../../_lib/tokens.js";
import { trackView, recordActivity } from "../../../_lib/db.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../_lib/email.js";
import { markProjectBooked } from "../../../_lib/lifecycle.js";
import { sendStageEmail } from "../../../_lib/stage-emails.js";
import { createInvoice } from "../../../_lib/invoices.js";

const SITE_URL = "https://nationalclosetco.com";

export async function onRequestGet(context) {
  const token = context.params.token;
  const k = await context.env.DB.prepare(
    `SELECT kc.*, pj.name AS project_name, pj.site_address, pj.po_number AS po_number, c.name AS contact_name, c.email AS contact_email
     FROM contracts kc JOIN projects pj ON pj.id=kc.project_id JOIN contacts c ON c.id=pj.contact_id
     WHERE kc.view_token=?1`
  ).bind(token).first();
  if (!k) return json({ error: "Not found" }, 404);
  const lines = (await context.env.DB.prepare(`SELECT * FROM contract_lines WHERE contract_id=?1 ORDER BY position, id`).bind(k.id).all()).results || [];
  await trackView(context.env.DB, "contracts", k.id);
  if (k.status === "sent") {
    await context.env.DB.prepare(`UPDATE contracts SET status='sent' WHERE id=?1`).bind(k.id).run();
  }
  const safe = { ...k };
  delete safe.author_user_id;
  return json({ contract: safe, lines });
}

export async function onRequestPost(context) {
  const token = context.params.token;
  const body = await context.request.json().catch(() => ({}));
  const k = await context.env.DB.prepare(`SELECT * FROM contracts WHERE view_token=?1`).bind(token).first();
  if (!k) return json({ error: "Not found" }, 404);
  if (k.status === "fully_executed" || k.status === "signed_by_customer") {
    return json({ error: "Contract is already signed." }, 400);
  }
  if (body.action !== "sign") return json({ error: "Unknown action" }, 400);
  if (!body.signer_name || !body.signature_image) {
    return json({ error: "Missing typed name or signature image." }, 400);
  }

  // Build the canonical document content + hash it (what they "signed")
  const lines = (await context.env.DB.prepare(`SELECT * FROM contract_lines WHERE contract_id=?1 ORDER BY position, id`).bind(k.id).all()).results || [];
  const canonical = JSON.stringify({
    number: k.number,
    total_cents: k.total_cents,
    deposit_cents: k.deposit_cents,
    intro: k.intro,
    scope_html: k.scope_html,
    terms_html: k.terms_html,
    estimated_install_window: k.estimated_install_window,
    lines: lines.map(l => ({ d: l.description, r: l.room, q: l.quantity, u: l.unit_price_cents, t: l.line_total_cents })),
  });
  const docHash = await sha256Hex(canonical);
  const ipHash = await hashIp(context.request.headers.get("CF-Connecting-IP"));
  const ua = context.request.headers.get("User-Agent") || null;

  // Customer signing books the job — go straight to fully_executed
  // (admin counter-sign is optional record-keeping, not gating)
  await context.env.DB.prepare(
    `UPDATE contracts SET
       status='fully_executed',
       signed_by_customer_at=datetime('now'),
       counter_signed_at=datetime('now'),
       counter_signer_name='National Closet Company',
       signer_name=?1, signer_email=?2,
       signature_image=?3,
       signed_ip_hash=?4, signed_user_agent=?5,
       document_hash_at_sign=?6,
       updated_at=datetime('now')
     WHERE id=?7`
  ).bind(
    body.signer_name,
    body.signer_email || null,
    body.signature_image,
    ipHash, ua, docHash, k.id,
  ).run();

  await recordActivity(context.env.DB, {
    entityType: "contract", entityId: k.id, action: "signed-by-customer",
    actorKind: "customer", actorName: body.signer_name,
    details: { ip_hash: ipHash, ua, doc_hash: docHash },
  });

  // The customer has signed — but the JOB IS NOT BOOKED until the deposit is
  // paid. Create the deposit invoice (shown on screen next, not emailed) and
  // return its token. markInvoicePaid books the job + sends the "Booked" stage
  // email once the deposit clears. Dedup returns an existing invoice if
  // proposal-accept already created one.
  let invoiceToken = null;
  let depositPending = false;
  try {
    const invRes = await createInvoice(context.env, {
      projectId: k.project_id, type: "deposit", contractId: k.id,
      actor: { name: body.signer_name }, send: false,
    });
    if (invRes?.invoice) { invoiceToken = invRes.invoice.view_token; depositPending = true; }
  } catch (e) { console.error("[invoice/deposit]", String(e)); }

  if (depositPending) {
    // NOT booked yet. Until the deposit is paid the deal is still a LEAD in the
    // proposal stage — keep the project in 'proposed' (a proposal-stage status,
    // excluded from the booked Jobs pipeline) and leave the lead at 'proposal'.
    // markInvoicePaid books it (project -> contracted, lead -> booked) once the
    // deposit clears.
    await context.env.DB.prepare(
      `UPDATE projects SET status='proposed', updated_at=datetime('now') WHERE id=?1`
    ).bind(k.project_id).run();
  } else {
    // No deposit required → book immediately on signing, with the booked email.
    await markProjectBooked(context.env.DB, k.project_id, k.id);
    await sendStageEmail(context.env, "contracted", k.project_id, { name: body.signer_name });
  }

  // Notify the team
  await sendEmail(context.env, {
    to: context.env.STAFF_EMAIL || "hello@nationalclosetco.com",
    subject: depositPending ? `✍️ Contract signed — awaiting deposit (${k.number})` : `🎉 Job booked — ${k.number}`,
    html: brandedEmail({
      title: depositPending ? "Contract signed — awaiting deposit." : "A new job was just booked.",
      body: `
        <p><strong>${escapeHtml(k.number)}</strong> was signed by <strong>${escapeHtml(body.signer_name)}</strong>.</p>
        <p>Document hash: <code style="font-size:11px">${escapeHtml(docHash)}</code></p>
        <p>${k.deposit_cents > 0 ? `Deposit: <strong>${moneyFmt(k.deposit_cents)}</strong>` : `No deposit — payment on completion.`}</p>
        <p>${depositPending ? "The job will book automatically once the deposit is paid." : "Watch for the customer to schedule their install."}</p>
      `,
      ctaLabel: "Open Contract",
      ctaUrl: `${SITE_URL}/crm/contract.html?id=${k.id}`,
    }),
  });

  return json({ ok: true, booked: !depositPending, awaiting_deposit: depositPending, contract_token: k.view_token, invoice_token: invoiceToken });
}

function moneyFmt(cents) { return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
