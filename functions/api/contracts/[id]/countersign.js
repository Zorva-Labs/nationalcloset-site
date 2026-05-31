// Admin counter-signs the contract after the customer signs.
import { requireAuth, json } from "../../../_lib/auth.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../_lib/email.js";
import { recordActivity } from "../../../_lib/db.js";

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const k = await context.env.DB.prepare(
    `SELECT kc.*, c.name AS contact_name, c.email AS contact_email
     FROM contracts kc JOIN projects pj ON pj.id=kc.project_id JOIN contacts c ON c.id=pj.contact_id
     WHERE kc.id=?1`
  ).bind(id).first();
  if (!k) return json({ error: "Not found" }, 404);
  if (k.status !== "signed_by_customer") return json({ error: `Contract must be customer-signed first (currently: ${k.status})` }, 400);
  // signature_image is optional now — auto-countersign mode (legacy contracts
  // signed before /api/public/contract/[token] gained the auto-jump-to-
  // fully_executed behavior) flips a contract booked without requiring the
  // admin to hand-draw a signature. signer_name defaults to "National Closet Company".
  const signerName = (body.signer_name || "National Closet Company").trim();
  const signatureImage = body.signature_image || null;
  await context.env.DB.prepare(
    `UPDATE contracts SET status='fully_executed',
       counter_signed_at=datetime('now'),
       counter_signed_by_user_id=?1,
       counter_signer_name=?2,
       counter_signature_image=?3,
       updated_at=datetime('now')
     WHERE id=?4`
  ).bind(auth.id, signerName, signatureImage, id).run();
  await recordActivity(context.env.DB, {
    entityType: "contract", entityId: id, action: "counter-signed",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  // Notify customer
  await sendEmail(context.env, {
    to: k.contact_email,
    subject: `Your contract ${k.number} is fully executed`,
    html: brandedEmail({
      title: "Your contract is fully executed.",
      body: `
        <p>Hi ${escapeHtml(k.contact_name.split(" ")[0])},</p>
        <p>We've counter-signed contract <strong>${escapeHtml(k.number)}</strong>. Your order will be released to our manufacturing partners as soon as we receive the deposit.</p>
        <p>If you have any questions, just reply to this email or call us at <a href="tel:+16292988241">629-298-8241</a>.</p>
      `,
      ctaLabel: "View Contract",
      ctaUrl: `https://nationalclosetco.com/contract/?t=${k.view_token}`,
    }),
  });
  return json({ ok: true });
}
