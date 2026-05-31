// GET /api/public/contract/[token]  → contract data for customer review + sign
// POST /api/public/contract/[token]  body: { action: "sign", signer_name, signer_email, signature_image }
import { json, hashIp } from "../../../_lib/auth.js";
import { sha256Hex } from "../../../_lib/tokens.js";
import { trackView, recordActivity } from "../../../_lib/db.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../_lib/email.js";
import { markProjectBooked } from "../../../_lib/lifecycle.js";

const SITE_URL = "https://nationalclosetco.com";

export async function onRequestGet(context) {
  const token = context.params.token;
  const k = await context.env.DB.prepare(
    `SELECT kc.*, pj.name AS project_name, pj.site_address, c.name AS contact_name, c.email AS contact_email
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

  // Mark the project as booked
  await markProjectBooked(context.env.DB, k.project_id, k.id);

  // Send confirmation email to customer
  const customerEmail = body.signer_email || k.signer_email;
  if (customerEmail) {
    await sendEmail(context.env, {
      to: customerEmail,
      subject: `You're booked — ${k.number} · National Closet Company`,
      html: brandedEmail({
        title: "You're booked.",
        body: `
          <p>Hi ${escapeHtml(body.signer_name.split(" ")[0])},</p>
          <p>Thank you for signing contract <strong>${escapeHtml(k.number)}</strong>. Your job is officially booked.</p>
          <p>Here's what happens next:</p>
          <ol style="line-height:1.7;color:#56493C">
            <li>${k.deposit_cents > 0 ? `<strong>Deposit:</strong> please send ${moneyFmt(k.deposit_cents)} by check, ACH, Venmo, or Cash App to release the order.` : `<strong>Payment:</strong> due upon completion of the install.`}</li>
            <li><strong>Schedule your install</strong> using the link below — pick a day that works for you.</li>
            <li>We'll arrive on the scheduled day with drop cloths and tools, install, and demonstrate every product before we leave.</li>
          </ol>
          <p>Questions? Reply to this email or call <a href="tel:+16292988241">629-298-8241</a>.</p>
        `,
        ctaLabel: "Schedule Your Install",
        ctaUrl: `${SITE_URL}/contract/?t=${k.view_token}#schedule`,
      }),
    });
  }

  // Notify the team
  await sendEmail(context.env, {
    to: context.env.STAFF_EMAIL || "hello@nationalclosetco.com",
    subject: `🎉 Job booked — ${k.number}`,
    html: brandedEmail({
      title: "A new job was just booked.",
      body: `
        <p><strong>${escapeHtml(k.number)}</strong> was signed by <strong>${escapeHtml(body.signer_name)}</strong>.</p>
        <p>Document hash: <code style="font-size:11px">${escapeHtml(docHash)}</code></p>
        <p>${k.deposit_cents > 0 ? `Deposit due: <strong>${moneyFmt(k.deposit_cents)}</strong>` : `No deposit — payment on completion.`}</p>
        <p>Watch for the customer to schedule their install — they'll get a confirmation iCal when they do.</p>
      `,
      ctaLabel: "Open Contract",
      ctaUrl: `${SITE_URL}/crm/contract.html?id=${k.id}`,
    }),
  });

  return json({ ok: true, booked: true, contract_token: k.view_token });
}

function moneyFmt(cents) { return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
