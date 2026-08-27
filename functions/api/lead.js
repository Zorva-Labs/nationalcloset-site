// Cloudflare Pages Function — POST /api/lead
// Receives contact-form submissions and emails the lead to hello@nationalclosetco.com
// via the shared sendEmail() wrapper (Gmail API — Google Workspace).

import { spamReason, botReason, turnstileReason } from "../_lib/spam.js";
import { sendEmail } from "../_lib/email.js";

const TO = "hello@nationalclosetco.com";
// Internal alert delivered to hello@, sent as hello@ via the Gmail API — an
// authenticated self-send, so Gmail delivers it to the inbox normally. Reply-To
// is set to the lead below so hitting Reply answers the customer directly.
const FROM = "National Closet Co. Website <hello@nationalclosetco.com>";

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function onRequestPost({ request, env }) {
  // Parse JSON or form-encoded body
  let data = {};
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) data = await request.json();
    else {
      const fd = await request.formData();
      for (const [k, v] of fd.entries()) data[k] = v;
    }
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  // High-confidence bot gate (honeypot + too-fast submit + Turnstile). Silently
  // accept (return ok so they don't retry); all checks fail open on a missing
  // signal so a real lead is never dropped.
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const bot = botReason(data) || (await turnstileReason(env, data.cf_ts, ip));
  if (bot) { console.warn("[lead.js] bot drop:", bot); return json({ ok: true }); }

  // Content heuristics — links / pasted markup. Silently drop.
  const spam = spamReason(data);
  if (spam) { console.warn("[lead.js] dropped spam submission:", spam); return json({ ok: true }); }

  const name = (data.name || "").toString().trim();
  const phone = (data.phone || "").toString().trim();
  const email = (data.email || "").toString().trim();
  const project = (data.project || "").toString().trim();
  const zip = (data.zip || "").toString().trim();
  const msg = (data.msg || "").toString().trim();

  if (!name || (!phone && !email)) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }

  const rows = [
    ["Name", name],
    ["Phone / text", phone],
    ["Email", email],
    ["Project", project],
    ["ZIP", zip],
    ["Message", msg],
  ].filter(([, v]) => v);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#16140f">
      <h2 style="margin:0 0 4px">New website lead</h2>
      <p style="color:#6c665b;margin:0 0 16px">National Closet Company — free design request</p>
      <table style="width:100%;border-collapse:collapse">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:8px 10px;border:1px solid #e3e1dc;background:#faf9f6;font-weight:bold;width:140px">${esc(
                k
              )}</td><td style="padding:8px 10px;border:1px solid #e3e1dc">${esc(v).replace(/\n/g, "<br>")}</td></tr>`
          )
          .join("")}
      </table>
      <p style="color:#6c665b;font-size:12px;margin-top:16px">Reply directly to this email to reach the customer.</p>
    </div>`;

  const text =
    `New website lead — National Closet Company\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n");

  const res = await sendEmail(env, {
    from: FROM,
    to: TO,
    subject: `New website lead — ${name}${project ? " · " + project : ""}`,
    html,
    text,
    replyTo: email || undefined,
  });

  if (res?.skipped || res?.error) {
    return json({ ok: false, error: "send_failed", detail: res?.error || res?.reason || "unknown" }, 502);
  }
  return json({ ok: true });
}
