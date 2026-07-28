import { requireAuth, json } from "../../../_lib/auth.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../_lib/email.js";
import { recordActivity } from "../../../_lib/db.js";
import { logOutboundEmail } from "../../../_lib/email-log.js";
import { EXPIRY_DAYS, expiryReasonHtml } from "../../../_lib/proposal-expiry.js";

const SITE_URL = "https://nationalclosetco.com";

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const p = await context.env.DB.prepare(
    `SELECT pr.*, pj.name AS project_name, c.name AS contact_name, c.email AS contact_email
     FROM proposals pr JOIN projects pj ON pj.id=pr.project_id JOIN contacts c ON c.id=pj.contact_id
     WHERE pr.id=?1`
  ).bind(id).first();
  if (!p) return json({ error: "Not found" }, 404);
  if (!p.contact_email) return json({ error: "Contact has no email address — add one on the contact page first." }, 400);

  // Pull the options so the email can lay them out as distinct, scannable cards
  // (rather than burying the choice in one run-on intro paragraph).
  const tiers = (await context.env.DB.prepare(
    `SELECT tier, title, description, total_cents FROM proposal_tiers WHERE proposal_id=?1
     ORDER BY CASE tier WHEN 'good' THEN 0 WHEN 'better' THEN 1 WHEN 'best' THEN 2 ELSE 3 END, id`
  ).bind(id).all()).results || [];
  const money = (c) => { const d = (c || 0) / 100; return "$" + d.toLocaleString("en-US", { minimumFractionDigits: d % 1 ? 2 : 0, maximumFractionDigits: 2 }); };

  // Valid for EXPIRY_DAYS from this send. Computed here so the email names the
  // exact expiry date and the stored valid_until matches it to the second.
  const validUntil = new Date(Date.now() + EXPIRY_DAYS * 86400 * 1000).toISOString().slice(0, 19).replace("T", " ");

  const url = `${SITE_URL}/proposal/?t=${p.view_token}`;
  const subject = `Your proposal — ${p.number}`;
  const many = tiers.length > 1;

  // Each option as its own labeled card: bold "OPTION N", the price, and a plain
  // one-line description of who does what. Scannable at a glance — no word salad.
  const optionCard = (t, i) => {
    const label = many ? `Option ${i + 1}` : "Your proposal";
    const heading = (t.title && !/^option\s*\d+$/i.test(t.title.trim())) ? t.title : label;
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">
        <tr><td style="background:#FAF9F6;border:1px solid #E3E1DC;border-left:4px solid #D2683F;border-radius:8px;padding:16px 18px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#B9542F">${escapeHtml(many ? label : "Your proposal")}</td>
            <td align="right" style="font-size:17px;font-weight:800;color:#16140F;white-space:nowrap">${money(t.total_cents)}</td>
          </tr></table>
          ${heading !== label ? `<div style="font-size:16px;font-weight:700;color:#16140F;margin:4px 0 2px">${escapeHtml(t.title)}</div>` : ""}
          ${t.description ? `<div style="font-size:14px;line-height:1.55;color:#3A362F;margin-top:6px">${escapeHtml(t.description)}</div>` : ""}
        </td></tr>
      </table>`;
  };

  const optionsBlock = tiers.length
    ? `${many ? `<p style="font-weight:700;color:#16140F;margin:22px 0 12px">Two ways to move forward — pick whichever fits:</p>` : ""}
       ${tiers.map(optionCard).join("")}`
    : "";

  const html = brandedEmail({
    title: "Your proposal is ready to review.",
    body: `
        <p>Hi ${escapeHtml(p.contact_name.split(" ")[0])},</p>
        <p>Here's your proposal for <strong>${escapeHtml(p.project_name)}</strong>.</p>
        ${optionsBlock}
        <p>Open it online to see the full breakdown and accept the option that fits — or just reply to this email with any questions.</p>
        ${expiryReasonHtml(validUntil)}
      `,
    ctaLabel: many ? "Review & Choose Your Option" : "Open Your Proposal",
    ctaUrl: url,
  });

  const textOptions = tiers.length
    ? "\n\n" + (many ? "Two ways to move forward — pick whichever fits:\n\n" : "") +
      tiers.map((t, i) => `${many ? `OPTION ${i + 1} — ` : ""}${(t.title && !/^option\s*\d+$/i.test(t.title.trim())) ? t.title + " " : ""}(${money(t.total_cents)})\n${t.description || ""}`).join("\n\n")
    : "";
  const text = `Your proposal ${p.number} is ready.${textOptions}\n\nReview and choose your option: ${url}`;
  const result = await sendEmail(context.env, { to: p.contact_email, subject, html, text });
  const failed = result?.skipped || result?.error || (result?.status && result.status >= 400);

  // Log to Messages either way (sent or failed) so the thread is complete.
  await logOutboundEmail(context.env, {
    to: p.contact_email, subject, html, text, messageId: result?.messageId,
    projectId: p.project_id, templateKind: "proposal_sent",
    status: failed ? "failed" : "sent", actorId: auth.id,
    errorCode: failed ? (result?.reason || "send_error") : null,
    errorMessage: failed ? (result?.error || "send_failed").toString().slice(0, 240) : null,
  });

  // If SMTP actually failed, don't lie to the admin and mark it sent — surface
  // the error so they can call/text the customer instead. The proposal stays
  // 'draft' so the admin can retry once the underlying issue is fixed.
  if (failed) {
    console.error("[proposals/send] mail failed:", result);
    return json({
      error: "Email failed to send: " + (result.error || ("HTTP " + result.status)),
      detail: result,
      url, // still return the proposal URL so the admin can copy/paste manually
    }, 502);
  }

  // Mark sent, stamp the 2-day expiry, and re-arm the "expires tomorrow"
  // reminder (a resend gives the customer a fresh window + a fresh reminder).
  await context.env.DB.prepare(
    `UPDATE proposals SET status='sent', sent_at=datetime('now'), valid_until=?2,
       expiry_reminder_sent_at=NULL, updated_at=datetime('now') WHERE id=?1`
  ).bind(id, validUntil).run();
  await recordActivity(context.env.DB, {
    entityType: "proposal", entityId: id, action: "sent",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { to: p.contact_email, url, message_id: result.messageId },
  });
  return json({ ok: true, url, message_id: result.messageId });
}
