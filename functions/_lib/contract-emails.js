// Client-facing contract emails. sendSignedContractCopyToClient() emails the
// customer their fully-executed agreement the moment they sign — a summary, the
// full scope + terms, and a link to view/print the signed copy online. Called
// from the public sign endpoint; best-effort and logged to the CRM thread.
import { sendEmail, brandedEmail, makeMessageId, escapeHtml } from "./email.js";
import { logOutboundEmail } from "./email-log.js";

const SITE_URL = "https://nationalclosetco.com";
function money(c) {
  return "$" + ((c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function sendSignedContractCopyToClient(env, contract, { lines = [], signerName, signerEmail, signedAtLabel, docHash } = {}) {
  const db = env.DB;
  const project = await db.prepare(
    `SELECT p.id, p.name, p.contact_id, p.lead_id, c.name AS contact_name, c.email AS contact_email
       FROM projects p JOIN contacts c ON c.id=p.contact_id WHERE p.id=?1`
  ).bind(contract.project_id).first().catch(() => null);

  const to = signerEmail || project?.contact_email;
  if (!to) return { skipped: true, reason: "no_email" };
  const first = (signerName || project?.contact_name || "there").split(" ")[0];
  const viewUrl = `${SITE_URL}/contract/?t=${contract.view_token}`;

  const lineRows = lines.length ? `
      <table style="width:100%;border-collapse:collapse;margin:10px 0 4px;font-size:14px">
        <tr style="background:#faf9f6"><th align="left" style="padding:6px 8px;border:1px solid #e3e1dc">Item</th><th align="right" style="padding:6px 8px;border:1px solid #e3e1dc">Amount</th></tr>
        ${lines.map((l) => `<tr><td style="padding:6px 8px;border:1px solid #e3e1dc">${escapeHtml(l.description || "")}${l.room ? ` <span style="color:#6c665b">(${escapeHtml(l.room)})</span>` : ""}</td><td align="right" style="padding:6px 8px;border:1px solid #e3e1dc">${money(l.line_total_cents)}</td></tr>`).join("")}
      </table>` : "";

  const subject = `Your signed contract — ${contract.number}`;
  const html = brandedEmail({
    title: "Your signed contract",
    body: `
      <p>Hi ${escapeHtml(first)},</p>
      <p>Thank you — your agreement <strong>${escapeHtml(contract.number)}</strong> with National Closet Company is <strong>signed and fully executed</strong>. Here's your copy for your records.</p>
      <table style="border-collapse:collapse;margin:8px 0 4px">
        <tr><td style="padding:4px 16px 4px 0;color:#6C665B">Contract</td><td style="padding:4px 0;font-weight:600">${escapeHtml(contract.number)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6C665B">Signed by</td><td style="padding:4px 0">${escapeHtml(signerName || project?.contact_name || "")}${signedAtLabel ? ` on ${escapeHtml(signedAtLabel)}` : ""}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6C665B">Project total</td><td style="padding:4px 0;font-weight:700;font-size:18px">${money(contract.total_cents)}</td></tr>
        ${contract.deposit_cents > 0 ? `<tr><td style="padding:4px 16px 4px 0;color:#6C665B">Deposit</td><td style="padding:4px 0">${money(contract.deposit_cents)}</td></tr>` : ""}
        ${contract.estimated_install_window ? `<tr><td style="padding:4px 16px 4px 0;color:#6C665B">Est. install</td><td style="padding:4px 0">${escapeHtml(contract.estimated_install_window)}</td></tr>` : ""}
      </table>
      ${lineRows}
      ${contract.scope_html ? `<h3 style="margin:22px 0 6px;font-size:15px;color:#16140f">Scope of work</h3><div style="font-size:14px;line-height:1.6;color:#3a362f">${contract.scope_html}</div>` : ""}
      ${contract.terms_html ? `<h3 style="margin:22px 0 6px;font-size:15px;color:#16140f">Terms &amp; conditions</h3><div style="font-size:13px;line-height:1.6;color:#3a362f">${contract.terms_html}</div>` : ""}
      <p style="margin-top:18px">You can view or print your signed contract anytime using the button below.</p>
      ${docHash ? `<p style="color:#6C665B;font-size:12px;margin-top:6px">Document verification hash: <code style="font-size:11px">${escapeHtml(docHash)}</code></p>` : ""}
    `,
    ctaLabel: "View signed contract",
    ctaUrl: viewUrl,
  });
  const text = `Hi ${first},\n\n`
    + `Your agreement ${contract.number} with National Closet Company is signed and fully executed. Here's your copy.\n\n`
    + `Project total: ${money(contract.total_cents)}${contract.deposit_cents > 0 ? ` (deposit ${money(contract.deposit_cents)})` : ""}.\n`
    + (contract.estimated_install_window ? `Estimated install: ${contract.estimated_install_window}.\n` : "")
    + `\nView or print your signed contract: ${viewUrl}\n`
    + (docHash ? `\nDocument verification hash: ${docHash}\n` : "");

  const messageId = makeMessageId();
  const toHeader = signerName ? `${signerName} <${to}>` : to;
  const res = await sendEmail(env, { to: toHeader, subject, html, text, messageId });
  const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
  await logOutboundEmail(env, {
    to: toHeader, subject, html, text, messageId,
    projectId: contract.project_id, contactId: project?.contact_id || null, leadId: project?.lead_id || null,
    templateKind: "contract_signed_copy", status: failed ? "failed" : "sent",
  }).catch(() => {});
  return { ok: !failed };
}
