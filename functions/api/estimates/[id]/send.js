// POST /api/estimates/[id]/send — email the customer their estimate
import { requireAuth, json } from "../../../_lib/auth.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../_lib/email.js";
import { recordActivity } from "../../../_lib/db.js";

const SITE_URL = "https://nationalclosetco.com";

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const est = await context.env.DB.prepare(
    `SELECT e.*, p.name AS project_name, c.name AS contact_name, c.email AS contact_email
     FROM estimates e JOIN projects p ON p.id=e.project_id JOIN contacts c ON c.id=p.contact_id
     WHERE e.id=?1`
  ).bind(id).first();
  if (!est) return json({ error: "Not found" }, 404);
  if (!est.view_token) return json({ error: "Estimate has no view token" }, 500);

  const url = `${SITE_URL}/estimate/?t=${est.view_token}`;
  const total = fmtMoney(est.total_cents);
  await sendEmail(context.env, {
    to: est.contact_email,
    subject: `Your estimate is ready — ${est.number} (${total})`,
    html: brandedEmail({
      title: "Your written estimate is ready.",
      preheader: `${est.number} · ${total} · ${escapeHtml(est.project_name)}`,
      body: `
        <p>Hi ${escapeHtml(est.contact_name.split(" ")[0])},</p>
        <p>Thank you for the visit. Here is the written estimate for <strong>${escapeHtml(est.project_name)}</strong>:</p>
        <ul style="font-size:15px;color:#3A362F;line-height:1.7;padding-left:20px">
          <li>Estimate number: <strong>${escapeHtml(est.number)}</strong></li>
          <li>Total: <strong>${escapeHtml(total)}</strong></li>
          ${est.valid_until ? `<li>Valid through: <strong>${escapeHtml(est.valid_until)}</strong></li>` : ""}
        </ul>
        <p>Open the estimate online — you can review every line, ask questions, or approve in one click.</p>
        ${est.notes_customer ? `<p style="border-left:3px solid #D2683F;padding-left:14px;color:#3A362F;font-style:italic">${escapeHtml(est.notes_customer)}</p>` : ""}
        <p style="margin-top:20px">Questions? Reply to this email or call us at <a href="tel:+16292988241">629-298-8241</a>.</p>
      `,
      ctaLabel: "View Your Estimate",
      ctaUrl: url,
    }),
    text: `Your estimate ${est.number} is ready — total ${total}.\n\nView and approve at: ${url}\n\nQuestions? 629-298-8241`,
  });
  await context.env.DB.prepare(
    `UPDATE estimates SET status='sent', sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?1`
  ).bind(id).run();
  await recordActivity(context.env.DB, {
    entityType: "estimate", entityId: id, action: "sent",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { to: est.contact_email },
  });
  return json({ ok: true, url });
}

function fmtMoney(cents) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
