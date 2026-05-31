// Resend HTTP transport for transactional mail.
//
// Why Resend: iCloud was rejecting Purelymail-relayed mail with 554 5.7.1
// (HM08 = sender reputation rejection on a brand-new domain). Even with SPF +
// DKIM + DMARC=reject all correctly set, iCloud's filters wouldn't trust a
// 2-day-old domain on Purelymail's shared IP pool. Resend has established
// IP reputation that iCloud and Gmail accept reliably. Their free tier is
// 3,000/mo + 100/day which covers a single-operator service business easily.
//
// Inbound mail still goes through Purelymail (we poll IMAP from
// _lib/email-sync.js for replies). Resend is outbound-only.
//
// Env vars (Cloudflare Pages secrets — set via `wrangler pages secret put`):
//   RESEND_API_KEY     — re_xxx (send-only or full-access; we only need send)
//   MAIL_FROM          — optional; defaults to "National Closet Company <hello@nationalclosetco.com>"
//                        Must use an address on a domain verified in Resend.
//   MAIL_DEFAULT_REPLY — optional; defaults to "hello@nationalclosetco.com"
//
// History:
//   - Originally used Purelymail REST API (went 404).
//   - Then Purelymail SMTP via cloudflare:sockets (worked but iCloud rejected
//     for sender reputation since the domain was 2 days old).
//   - Now Resend HTTP API (POST /emails) with nationalclosetco.com verified on
//     their side. Established IP reputation = deliverable to iCloud.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "National Closet Company <hello@nationalclosetco.com>";
const DEFAULT_REPLY = "hello@nationalclosetco.com";

// Best-effort mail send. Never throws. Returns { status, json, messageId } on
// success or { skipped, error } on failure. messageId is the RFC 5322 header
// value we generated for this send — callers use it for threading.
//
// Options:
//   to, cc, bcc       — string or array of recipients (each may be "Name <a@x>")
//   subject, html, text
//   replyTo           — defaults to env.MAIL_DEFAULT_REPLY → PURELYMAIL_USER
//   messageId         — pass a pre-generated <id@host> to override (else random)
//   inReplyTo         — parent Message-ID, sets In-Reply-To + References headers
//   references        — full References chain (whitespace separated)
//   from              — full From header (defaults to MAIL_FROM env)
//   attachments       — [{ filename, content (b64), content_type }]
export async function sendEmail(env, {
  to, cc, bcc, subject, html, text, replyTo, attachments,
  messageId, inReplyTo, references, from,
}) {
  if (!env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY missing — skipping send");
    return { skipped: true, reason: "no_api_key" };
  }
  const toList  = Array.isArray(to)  ? to  : (to ? [to] : []);
  const ccList  = Array.isArray(cc)  ? cc  : (cc ? [cc] : []);
  const bccList = Array.isArray(bcc) ? bcc : (bcc ? [bcc] : []);
  if (toList.length === 0) return { skipped: true, reason: "no_recipients" };
  const reply = replyTo || env.MAIL_DEFAULT_REPLY || DEFAULT_REPLY;
  const fromHeader = from || env.MAIL_FROM || DEFAULT_FROM;
  const mid = messageId || makeMessageId();

  // Resend wants headers via a structured "headers" object so we can preserve
  // threading via In-Reply-To / References / Message-ID.
  const headers = { "Message-ID": mid };
  if (inReplyTo)  headers["In-Reply-To"] = inReplyTo;
  if (references) headers["References"] = references;

  const payload = {
    from: fromHeader,
    to:  toList.map(extractAddr),
    subject,
    html: html || undefined,
    text: text || (html ? stripHtml(html) : undefined),
    reply_to: reply,
    headers,
  };
  if (ccList.length)  payload.cc  = ccList.map(extractAddr);
  if (bccList.length) payload.bcc = bccList.map(extractAddr);
  if (attachments && attachments.length) {
    // Resend attachment schema: { filename, content (base64) | path }
    payload.attachments = attachments;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => "");
    let json;
    try { json = JSON.parse(raw); } catch { json = { raw: raw.slice(0, 240) }; }
    if (!res.ok) {
      console.error("[email] Resend send failed:", res.status, raw.slice(0, 240));
      return { skipped: true, status: res.status, error: json?.message || ("resend_http_" + res.status), json, messageId: mid };
    }
    return { status: res.status, json, messageId: mid, resendId: json?.id };
  } catch (e) {
    console.error("[email] fetch threw:", e?.message || e);
    return { skipped: true, error: e?.message || "fetch_failed", messageId: mid };
  }
}

// Generate an RFC 5322 Message-ID — exported so callers can pre-generate one
// when they want to insert into D1 with the same ID before/while sending.
export function makeMessageId(domain = "nationalclosetco.com") {
  return `<${Math.random().toString(36).slice(2, 14)}.${Date.now().toString(36)}@${domain}>`;
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

// Extract the bare addr-spec from either "Name <addr@x>" or "addr@x"
function extractAddr(s) {
  const m = String(s || "").match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// --------------------------------------------------------------
// Shared branded HTML shell
// --------------------------------------------------------------
const BRAND = {
  espresso: "#14110D",
  bg: "#F7F2EA",
  bg2: "#EFE8DB",
  brass: "#9D7A3E",
  champagne: "#D4B896",
  ink: "#14110D",
  inkSoft: "#56493C",
  line: "#D9CFBB",
};

export function brandedEmail({ title, preheader, body, ctaLabel, ctaUrl, footer }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { margin:0; padding:0; background:${BRAND.bg}; font-family: 'Helvetica Neue', Arial, sans-serif; color:${BRAND.ink}; }
  .wrap { max-width:600px; margin:0 auto; padding:32px 20px; }
  .card { background:#fff; border:1px solid ${BRAND.line}; border-top:3px solid ${BRAND.brass}; padding:36px 32px; }
  .brand { font-family: Georgia, 'Times New Roman', serif; font-size:14px; letter-spacing:0.3em; color:${BRAND.brass}; text-transform:uppercase; margin-bottom:8px; }
  h1 { font-family: Georgia, 'Times New Roman', serif; font-weight:400; font-size:28px; line-height:1.15; margin:0 0 18px; color:${BRAND.espresso}; }
  p { font-size:15px; line-height:1.6; color:${BRAND.inkSoft}; margin:0 0 14px; }
  .cta { display:inline-block; background:${BRAND.espresso}; color:#fff !important; padding:14px 28px; text-decoration:none; font-size:13px; letter-spacing:0.18em; text-transform:uppercase; margin:18px 0 6px; }
  .footer { text-align:center; font-size:12px; color:${BRAND.inkSoft}; margin-top:24px; line-height:1.6; }
  .footer a { color:${BRAND.brass}; }
</style>
</head>
<body>
<span style="display:none;font-size:1px;color:#fff;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader || "")}</span>
<div class="wrap">
  <div class="card">
    <div class="brand">National Closet Company</div>
    <h1>${title}</h1>
    ${body}
    ${ctaUrl ? `<p style="text-align:center;margin-top:24px"><a class="cta" href="${ctaUrl}">${escapeHtml(ctaLabel || "Open")}</a></p>` : ""}
  </div>
  <div class="footer">
    ${footer || `National Closet Company · Gallatin, Tennessee<br/><a href="tel:+16292988241">629-298-8241</a> · <a href="mailto:hello@nationalclosetco.com">hello@nationalclosetco.com</a>`}
  </div>
</div>
</body>
</html>`;
}

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
