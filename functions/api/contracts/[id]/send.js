import { requireAuth, json } from "../../../_lib/auth.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../_lib/email.js";
import { recordActivity } from "../../../_lib/db.js";
import { logOutboundEmail } from "../../../_lib/email-log.js";

const SITE_URL = "https://nationalclosetco.com";

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const k = await context.env.DB.prepare(
    `SELECT kc.*, pj.name AS project_name, c.name AS contact_name, c.email AS contact_email
     FROM contracts kc JOIN projects pj ON pj.id=kc.project_id JOIN contacts c ON c.id=pj.contact_id
     WHERE kc.id=?1`
  ).bind(id).first();
  if (!k) return json({ error: "Not found" }, 404);
  const url = `${SITE_URL}/contract/?t=${k.view_token}`;
  const total = "$" + (k.total_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (c) => "$" + ((c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const deposit = money(k.deposit_cents);
  // Payments 2 and 3 split whatever is left after the up-front payment.
  const rest = Math.max(0, (k.total_cents || 0) - (k.deposit_cents || 0));
  const atScheduling = Math.round(rest / 2);
  const subject = `Your contract — ${k.number} (please review &amp; sign)`;
  const html = brandedEmail({
    title: "Your contract is ready to sign.",
    body: `
        <p>Hi ${escapeHtml(k.contact_name.split(" ")[0])},</p>
        <p>Here's the contract for <strong>${escapeHtml(k.project_name)}</strong>. Please review the scope and terms, then sign at the bottom of the page.</p>
        <ul style="font-size:15px;color:#3A362F;line-height:1.7;padding-left:20px">
          <li>Contract: <strong>${escapeHtml(k.number)}</strong></li>
          <li>Total: <strong>${total}</strong></li>
          <li>Due at signing: <strong>${deposit}</strong> — releases your order</li>
          ${rest > 0 ? `<li>Due when your install is scheduled: <strong>${money(atScheduling)}</strong></li>
          <li>Due the day of installation: <strong>${money(rest - atScheduling)}</strong></li>
          <li>Or pay in full at any time: <strong>${total}</strong> — no fee for paying early</li>` : ""}
        </ul>
        <p>After you sign online, we'll counter-sign and release the order to our manufacturing partners. Payments can be made by check, cash, ACH, Venmo, or Cash App — we'll coordinate that separately.</p>
      `,
    ctaLabel: "Review &amp; Sign",
    ctaUrl: url,
  });
  const text = `Your contract ${k.number} is ready to sign: ${url}\nTotal: ${total}\nDue at signing: ${deposit}`
    + (rest > 0 ? `\nDue at scheduling: ${money(atScheduling)}\nDue day of install: ${money(rest - atScheduling)}\nOr pay in full anytime: ${total}` : "");
  const result = await sendEmail(context.env, { to: k.contact_email, subject, html, text });
  const failed = result?.skipped || result?.error || (result?.status && result.status >= 400);
  await logOutboundEmail(context.env, {
    to: k.contact_email, subject, html, text, messageId: result?.messageId,
    projectId: k.project_id, templateKind: "contract_sent",
    status: failed ? "failed" : "sent", actorId: auth.id,
    errorCode: failed ? (result?.reason || "send_error") : null,
    errorMessage: failed ? (result?.error || "send_failed").toString().slice(0, 240) : null,
  });
  await context.env.DB.prepare(
    `UPDATE contracts SET status='sent', sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?1`
  ).bind(id).run();
  await recordActivity(context.env.DB, {
    entityType: "contract", entityId: id, action: "sent",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  return json({ ok: true, url });
}
