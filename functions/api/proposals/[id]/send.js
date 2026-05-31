import { requireAuth, json } from "../../../_lib/auth.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../_lib/email.js";
import { recordActivity } from "../../../_lib/db.js";

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

  const url = `${SITE_URL}/proposal/?t=${p.view_token}`;
  const result = await sendEmail(context.env, {
    to: p.contact_email,
    subject: `Your proposal — ${p.number}`,
    html: brandedEmail({
      title: "Your proposal is ready to review.",
      body: `
        <p>Hi ${escapeHtml(p.contact_name.split(" ")[0])},</p>
        <p>Here's the proposal for <strong>${escapeHtml(p.project_name)}</strong>. We've laid out three options — pick the one that fits, or write back with questions.</p>
        ${p.intro ? `<p style="border-left:3px solid #9D7A3E;padding-left:14px;color:#56493C;font-style:italic">${escapeHtml(p.intro)}</p>` : ""}
        <p>Open the proposal online to compare tiers side-by-side.</p>
      `,
      ctaLabel: "Open Your Proposal",
      ctaUrl: url,
    }),
    text: `Your proposal ${p.number} is ready: ${url}`,
  });

  // If SMTP actually failed, don't lie to the admin and mark it sent — surface
  // the error so they can call/text the customer instead. The proposal stays
  // 'draft' so the admin can retry once the underlying issue is fixed.
  if (result?.skipped || result?.error || (result?.status && result.status >= 400)) {
    console.error("[proposals/send] mail failed:", result);
    return json({
      error: "Email failed to send: " + (result.error || ("HTTP " + result.status)),
      detail: result,
      url, // still return the proposal URL so the admin can copy/paste manually
    }, 502);
  }

  await context.env.DB.prepare(
    `UPDATE proposals SET status='sent', sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?1`
  ).bind(id).run();
  await recordActivity(context.env.DB, {
    entityType: "proposal", entityId: id, action: "sent",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { to: p.contact_email, url, message_id: result.messageId },
  });
  return json({ ok: true, url, message_id: result.messageId });
}
