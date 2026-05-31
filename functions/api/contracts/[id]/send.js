import { requireAuth, json } from "../../../_lib/auth.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../_lib/email.js";
import { recordActivity } from "../../../_lib/db.js";

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
  const deposit = "$" + (k.deposit_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await sendEmail(context.env, {
    to: k.contact_email,
    subject: `Your contract — ${k.number} (please review &amp; sign)`,
    html: brandedEmail({
      title: "Your contract is ready to sign.",
      body: `
        <p>Hi ${escapeHtml(k.contact_name.split(" ")[0])},</p>
        <p>Here's the contract for <strong>${escapeHtml(k.project_name)}</strong>. Please review the scope and terms, then sign at the bottom of the page.</p>
        <ul style="font-size:15px;color:#3A362F;line-height:1.7;padding-left:20px">
          <li>Contract: <strong>${escapeHtml(k.number)}</strong></li>
          <li>Total: <strong>${total}</strong></li>
          <li>Deposit to release order: <strong>${deposit}</strong></li>
        </ul>
        <p>After you sign online, we'll counter-sign and release the order to our manufacturing partners. The deposit can be paid by check, cash, ACH, Venmo, or Cash App — we'll coordinate that separately.</p>
      `,
      ctaLabel: "Review &amp; Sign",
      ctaUrl: url,
    }),
    text: `Your contract ${k.number} is ready to sign: ${url}\nTotal: ${total}\nDeposit: ${deposit}`,
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
