// Transactional mail transport. Primary path is the Gmail API (Google
// Workspace, hello@nationalclosetco.com) via a service account with
// domain-wide delegation — see _lib/google-auth.js. Workers can't do reliable
// SMTP, so we build a raw RFC 822 MIME message and POST it to Gmail.
//
// CUTOVER FALLBACK (temporary): if Google isn't configured yet, or a Gmail send
// fails, we fall back to the legacy Resend HTTP API so mail never stops during
// the migration. Once Gmail is verified end-to-end, delete the Resend branch,
// the RESEND_* env usage, and the fallback secrets.
//
// Env vars (Cloudflare Pages secrets):
//   GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY / GOOGLE_WORKSPACE_USER  (primary)
//   MAIL_FROM          — optional From override (default hello@nationalclosetco.com)
//   MAIL_DEFAULT_REPLY — optional Reply-To (default hello@nationalclosetco.com)
//   RESEND_API_KEY     — legacy fallback only; remove after cutover
import { getGoogleAccessToken, googleConfigured, impersonationUser, base64url } from "./google-auth.js";

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
//   replyTo           — defaults to env.MAIL_DEFAULT_REPLY
//   messageId         — pass a pre-generated <id@host> to override (else random)
//   inReplyTo         — parent Message-ID, sets In-Reply-To + References headers
//   references        — full References chain (whitespace separated)
//   from              — full From header (defaults to MAIL_FROM env)
//   attachments       — [{ filename, content (b64), content_type }]
export async function sendEmail(env, opts) {
  const { to, cc, bcc } = opts;
  const toList  = Array.isArray(to)  ? to  : (to ? [to] : []);
  const ccList  = Array.isArray(cc)  ? cc  : (cc ? [cc] : []);
  const bccList = Array.isArray(bcc) ? bcc : (bcc ? [bcc] : []);
  if (toList.length === 0) return { skipped: true, reason: "no_recipients" };

  const msg = {
    to: toList, cc: ccList, bcc: bccList,
    subject: opts.subject,
    html: opts.html,
    text: opts.text || (opts.html ? htmlToText(opts.html) : ""),
    reply: opts.replyTo || env.MAIL_DEFAULT_REPLY || DEFAULT_REPLY,
    from: opts.from || env.MAIL_FROM || DEFAULT_FROM,
    messageId: opts.messageId || makeMessageId(),
    inReplyTo: opts.inReplyTo,
    references: opts.references,
    listUnsubscribe: opts.listUnsubscribe,
    attachments: opts.attachments,
  };

  // Primary: Gmail API.
  if (googleConfigured(env)) {
    const r = await sendViaGmail(env, msg);
    if (!r.skipped) return r;
    if (!env.RESEND_API_KEY) return r;            // no fallback available
    console.warn("[email] Gmail send failed, falling back to Resend:", r.error);
  }
  // Fallback: Resend (legacy — remove after cutover).
  if (env.RESEND_API_KEY) return sendViaResend(env, msg);

  console.warn("[email] no mail transport configured — skipping send");
  return { skipped: true, reason: "no_transport", messageId: msg.messageId };
}

// ── Gmail API transport ─────────────────────────────────────────────
async function sendViaGmail(env, m) {
  const raw = buildMime(m);
  const rawB64 = base64url(new TextEncoder().encode(raw));
  try {
    const token = await getGoogleAccessToken(env, impersonationUser(env));
    // "me" resolves to the impersonated mailbox; From may be a verified send-as
    // alias (e.g. notifications@) on that mailbox.
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: rawB64 }),
    });
    const body = await res.text().catch(() => "");
    let json; try { json = JSON.parse(body); } catch { json = { raw: body.slice(0, 240) }; }
    if (!res.ok) {
      console.error("[email] Gmail send failed:", res.status, body.slice(0, 240));
      return { skipped: true, status: res.status, error: json?.error?.message || ("gmail_http_" + res.status), json, messageId: m.messageId };
    }
    return { status: res.status, json, messageId: m.messageId, gmailId: json?.id };
  } catch (e) {
    console.error("[email] Gmail send threw:", e?.message || e);
    return { skipped: true, error: e?.message || "gmail_failed", messageId: m.messageId };
  }
}

// ── Resend transport (legacy fallback — remove after cutover) ────────
async function sendViaResend(env, m) {
  const headers = { "Message-ID": m.messageId };
  if (m.inReplyTo)  headers["In-Reply-To"] = m.inReplyTo;
  if (m.references) headers["References"] = m.references;
  if (m.listUnsubscribe) headers["List-Unsubscribe"] = "<mailto:hello@nationalclosetco.com?subject=Unsubscribe>";
  const payload = {
    from: m.from,
    to: m.to.map(extractAddr),
    subject: m.subject,
    html: m.html || undefined,
    text: m.text || undefined,
    reply_to: m.reply,
    headers,
  };
  if (m.cc.length)  payload.cc  = m.cc.map(extractAddr);
  if (m.bcc.length) payload.bcc = m.bcc.map(extractAddr);
  if (m.attachments && m.attachments.length) payload.attachments = m.attachments;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => "");
    let json; try { json = JSON.parse(raw); } catch { json = { raw: raw.slice(0, 240) }; }
    if (!res.ok) {
      console.error("[email] Resend send failed:", res.status, raw.slice(0, 240));
      return { skipped: true, status: res.status, error: json?.message || ("resend_http_" + res.status), json, messageId: m.messageId };
    }
    return { status: res.status, json, messageId: m.messageId, resendId: json?.id };
  } catch (e) {
    console.error("[email] Resend fetch threw:", e?.message || e);
    return { skipped: true, error: e?.message || "fetch_failed", messageId: m.messageId };
  }
}

// ── RFC 822 MIME builder (for the Gmail raw send) ────────────────────
function buildMime(m) {
  const boundaryAlt = "alt_" + crypto.randomUUID();
  const H = [];
  H.push(`From: ${fmtAddr(m.from)}`);
  H.push(`To: ${m.to.map(fmtAddr).join(", ")}`);
  if (m.cc.length)  H.push(`Cc: ${m.cc.map(fmtAddr).join(", ")}`);
  if (m.bcc.length) H.push(`Bcc: ${m.bcc.map(fmtAddr).join(", ")}`);
  if (m.reply)      H.push(`Reply-To: ${fmtAddr(m.reply)}`);
  H.push(`Subject: ${encodeHeaderWord(m.subject || "")}`);
  H.push(`Message-ID: ${m.messageId}`);
  if (m.inReplyTo)  H.push(`In-Reply-To: ${m.inReplyTo}`);
  if (m.references) H.push(`References: ${m.references}`);
  if (m.listUnsubscribe) H.push("List-Unsubscribe: <mailto:hello@nationalclosetco.com?subject=Unsubscribe>");
  H.push("MIME-Version: 1.0");

  const alt =
    `--${boundaryAlt}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64Body(m.text || "")}\r\n` +
    `--${boundaryAlt}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64Body(m.html || "")}\r\n` +
    `--${boundaryAlt}--`;

  if (m.attachments && m.attachments.length) {
    const boundaryMix = "mix_" + crypto.randomUUID();
    let out = H.join("\r\n") + `\r\nContent-Type: multipart/mixed; boundary="${boundaryMix}"\r\n\r\n`;
    out += `--${boundaryMix}\r\nContent-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n${alt}\r\n`;
    for (const a of m.attachments) {
      const ct = a.content_type || "application/octet-stream";
      const name = (a.filename || "attachment").replace(/["\r\n]/g, "");
      const content = String(a.content || "").replace(/\s+/g, "").replace(/(.{76})/g, "$1\r\n");
      out += `--${boundaryMix}\r\nContent-Type: ${ct}; name="${name}"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="${name}"\r\n\r\n${content}\r\n`;
    }
    out += `--${boundaryMix}--`;
    return out;
  }
  return H.join("\r\n") + `\r\nContent-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n${alt}`;
}

// UTF-8 base64 of a body string, wrapped at 76 cols per MIME.
function b64Body(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/(.{76})/g, "$1\r\n");
}

// Format one address header value, MIME-encoding a non-ASCII display name and
// quoting names with specials. Keeps the <addr> intact.
function fmtAddr(s) {
  const mm = String(s || "").match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (mm) { const name = mm[1].replace(/^"|"$/g, ""); return name ? `${encodeHeaderWord(name, true)} <${mm[2]}>` : mm[2]; }
  return String(s || "").trim();
}

// RFC 2047 encoded-word for non-ASCII header text; quote if it has specials.
function encodeHeaderWord(v, isName) {
  const s = String(v || "");
  if (/^[\x00-\x7F]*$/.test(s)) {
    return isName && /[",<>()@:;.\\[\]]/.test(s) ? `"${s.replace(/([\\"])/g, "\\$1")}"` : s;
  }
  const bytes = new TextEncoder().encode(s);
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(bin)}?=`;
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

// Build a readable plain-text alternative from the branded HTML. A real
// text/plain part (not a single stripped line) improves spam scores and
// renders properly in text-only clients.
function htmlToText(html) {
  if (!html) return "";
  let t = String(html);
  t = t.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ");      // drop non-content
  t = t.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    const label = inner.replace(/<[^>]+>/g, "").trim();
    const url = href.trim();
    return label && label !== url ? `${label} (${url})` : url;       // links → "text (url)"
  });
  t = t.replace(/<(?:br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/table|\/ul|\/ol)[^>]*>/gi, "\n"); // blocks → newlines
  t = t.replace(/<[^>]+>/g, "");                                    // strip remaining tags
  t = t.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
       .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
       .replace(/&mdash;/gi, "—").replace(/&hellip;/gi, "…").replace(/&rarr;/gi, "→");
  return t.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// --------------------------------------------------------------
// Shared branded HTML shell
// --------------------------------------------------------------
const BRAND = {
  espresso: "#16140F",   // charcoal (site --ink)
  bg: "#FAF9F6",         // paper
  bg2: "#EDECE8",        // fog
  brass: "#D2683F",      // terracotta accent (site --clay)
  brassDeep: "#B9542F",  // terracotta hover (site --clay-deep)
  champagne: "#F6E6DF",  // clay-wash
  ink: "#16140F",
  inkSoft: "#3A362F",
  muted: "#6C665B",
  line: "#E3E1DC",
  logo: "https://nationalclosetco.com/img/ncc-logo-nc.png",
};

const DEFAULT_SIGNATURE = `
    <div style="margin-top:28px;padding-top:18px;border-top:1px solid ${BRAND.line};font-size:14px;line-height:1.7;color:${BRAND.inkSoft}">
      Thanks,<br/>
      <strong style="color:${BRAND.ink}">Michael Blair</strong><br/>
      National Closet Co.<br/>
      <a href="https://nationalclosetco.com" style="color:${BRAND.brass};text-decoration:none">NationalClosetCo.com</a><br/>
      <a href="mailto:hello@nationalclosetco.com" style="color:${BRAND.brass};text-decoration:none">hello@nationalclosetco.com</a><br/>
      <a href="tel:+16292988241" style="color:${BRAND.brass};text-decoration:none">629-298-8241</a>
    </div>`;

export function brandedEmail({ title, preheader, body, ctaLabel, ctaUrl, footer, signature }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  /* No remote @import — a web-font pull is a minor spam signal and mail clients
     strip it anyway. The Helvetica/Arial fallback stack renders identically clean. */
  body { margin:0; padding:0; background:${BRAND.bg}; font-family:'Montserrat','Helvetica Neue',Arial,sans-serif; color:${BRAND.ink}; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:600px; margin:0 auto; padding:32px 20px; }
  .logo-wrap { text-align:center; padding:8px 0 22px; }
  .logo-wrap img { height:38px; width:auto; }
  .card { background:#ffffff; border:1px solid ${BRAND.line}; border-top:4px solid ${BRAND.brass}; border-radius:10px; padding:38px 34px; }
  .brand { font-family:'Montserrat','Helvetica Neue',Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.22em; color:${BRAND.brass}; text-transform:uppercase; margin:0 0 10px; }
  h1 { font-family:'Montserrat','Helvetica Neue',Arial,sans-serif; font-weight:800; font-size:26px; line-height:1.12; letter-spacing:-0.02em; margin:0 0 18px; color:${BRAND.ink}; }
  p { font-size:15px; line-height:1.62; color:${BRAND.inkSoft}; margin:0 0 14px; }
  .cta { display:inline-block; background:${BRAND.brass}; color:#ffffff !important; padding:15px 30px; text-decoration:none; font-size:14px; font-weight:700; letter-spacing:0.01em; border-radius:6px; margin:18px 0 6px; }
  .footer { text-align:center; font-size:12px; color:${BRAND.muted}; margin-top:22px; line-height:1.7; }
  .footer a { color:${BRAND.brass}; text-decoration:none; }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<span style="display:none;font-size:1px;color:${BRAND.bg};max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader || "")}</span>
<div class="wrap">
  <div class="logo-wrap"><img src="${BRAND.logo}" alt="National Closet Company" height="38" style="height:38px;width:auto" /></div>
  <div class="card" style="background:#ffffff;border:1px solid ${BRAND.line};border-top:4px solid ${BRAND.brass};border-radius:10px;padding:38px 34px;">
    <div class="brand">National Closet Company</div>
    <h1>${title}</h1>
    ${body}
    ${ctaUrl ? `<p style="text-align:center;margin-top:24px"><a class="cta" href="${ctaUrl}" style="display:inline-block;background:${BRAND.brass};color:#ffffff;text-decoration:none;padding:15px 30px;font-size:14px;font-weight:700;border-radius:6px;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif">${escapeHtml(ctaLabel || "Open")}</a></p>` : ""}
    ${signature === false ? "" : (signature || DEFAULT_SIGNATURE)}
  </div>
  <div class="footer">
    ${footer || `National Closet Company · Custom Closets &amp; Closet Systems<br/><a href="tel:+16292988241">629-298-8241</a> · <a href="mailto:hello@nationalclosetco.com">hello@nationalclosetco.com</a> · <a href="https://nationalclosetco.com">nationalclosetco.com</a>`}
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
