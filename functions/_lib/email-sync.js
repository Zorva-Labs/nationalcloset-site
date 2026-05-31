// IMAP sync: fetch new inbound messages from Purelymail, parse, match to
// contacts/leads/projects by sender email, insert into email_messages.
//
// Called from the cron-trigger endpoint (/api/internal/email-sync). Idempotent:
// tracks last seen UID in email_sync_state so re-runs only process new mail.

import { ImapClient } from "./imap.js";
import { deriveThreadKey } from "./email-vars.js";
import { recordActivity } from "./db.js";

const MAILBOX = "INBOX";

export async function runImapSync(env, { mailbox = MAILBOX, maxPerRun = 50 } = {}) {
  const { DB } = env;
  if (!env.PURELYMAIL_USER || !env.PURELYMAIL_PASSWORD) {
    return { skipped: true, reason: "no_creds" };
  }

  // Load the state row — { uid_validity, uid_next }
  const state = await DB.prepare(`SELECT * FROM email_sync_state WHERE mailbox=?1`).bind(mailbox).first();
  const lastUidValidity = state?.uid_validity || 0;
  const lastUidSeen     = state?.uid_next     || 0;

  const client = new ImapClient({
    host: env.IMAP_HOST || "imap.purelymail.com",
    port: parseInt(env.IMAP_PORT || "993", 10),
    user: env.PURELYMAIL_USER,
    password: env.PURELYMAIL_PASSWORD,
  });

  let info = null;
  let processed = 0;
  let matched = 0;
  let skipped = 0;
  const errors = [];

  try {
    await client.connect();
    await client.login();
    info = await client.selectMailbox(mailbox);

    // If UIDVALIDITY changed (rare — happens if mailbox was rebuilt), reset
    // our cursor to whatever is currently in the mailbox. We don't backfill
    // historical messages; we want the inbox-from-now-on behavior.
    let startUid = lastUidSeen + 1;
    if (info.uidValidity !== lastUidValidity) {
      // First run OR mailbox reset — start fresh from current UIDNEXT
      // (this is "everything from now on", not "everything ever")
      startUid = Math.max(1, info.uidNext);
    }

    // Fetch new UIDs
    const uids = await client.searchUidsFrom(startUid);
    let highWatermark = lastUidSeen;
    for (const uid of uids.slice(0, maxPerRun)) {
      try {
        const fetched = await client.fetchRaw(uid);
        if (!fetched?.raw) { skipped++; continue; }
        const parsed = parseRfc822(fetched.raw);
        // Skip messages we sent ourselves. Catches:
        // 1. From exactly matches the auth'd mailbox (hello@nationalclosetco.com)
        // 2. From is on our own domain (anything @nationalclosetco.com).
        // Outbound mail to customers can never legitimately come back FROM
        // our own domain, so any @nationalclosetco.com sender in the inbox is
        // necessarily our own Sent folder being re-ingested. Resend's
        // bounce-tracking address (anything @send.nationalclosetco.com) is
        // caught by the same domain suffix match.
        const fromAddr = parsed.fromAddr?.toLowerCase() || "";
        const authUser = (env.PURELYMAIL_USER || "").toLowerCase();
        const authDomain = authUser.split("@")[1] || "nationalclosetco.com";
        if (fromAddr && (fromAddr === authUser || fromAddr.endsWith("@" + authDomain))) {
          skipped++; highWatermark = Math.max(highWatermark, uid); continue;
        }
        // Skip if we already have this Message-ID
        if (parsed.messageId) {
          const dup = await DB.prepare(`SELECT id FROM email_messages WHERE message_id_header=?1 LIMIT 1`).bind(parsed.messageId).first();
          if (dup) { skipped++; highWatermark = Math.max(highWatermark, uid); continue; }
        }
        // Resolve the contact/lead/project by sender email
        const resolved = await resolveSenderAttribution(DB, fromAddr, parsed);

        await DB.prepare(
          `INSERT INTO email_messages
             (direction, status, contact_id, lead_id, project_id,
              message_id_header, in_reply_to, references_header, thread_key,
              from_name, from_addr, to_addrs, cc_addrs,
              reply_to, subject, body_text, body_html,
              raw_headers, received_at)
           VALUES ('in', 'received', ?1, ?2, ?3,
              ?4, ?5, ?6, ?7,
              ?8, ?9, ?10, ?11,
              ?12, ?13, ?14, ?15,
              ?16, datetime('now'))`
        ).bind(
          resolved.contact_id, resolved.lead_id, resolved.project_id,
          parsed.messageId || null, parsed.inReplyTo || null,
          parsed.references || null,
          deriveThreadKey(parsed.subject, fromAddr),
          parsed.fromName || null, fromAddr || "",
          JSON.stringify(parsed.toAddrs || []),
          parsed.ccAddrs?.length ? JSON.stringify(parsed.ccAddrs) : null,
          parsed.replyTo || null,
          parsed.subject || "",
          parsed.bodyText || null, parsed.bodyHtml || null,
          parsed.rawHeaders.slice(0, 8000),
        ).run();

        // Activity log entry on the matched entity
        if (resolved.contact_id || resolved.lead_id || resolved.project_id) {
          await recordActivity(DB, {
            entityType: resolved.lead_id ? "lead" : resolved.project_id ? "project" : "contact",
            entityId: resolved.lead_id || resolved.project_id || resolved.contact_id,
            action: "email-received",
            actorKind: "customer", actorName: parsed.fromName || fromAddr,
            details: { subject: parsed.subject, message_id: parsed.messageId },
          });
          matched++;
        }

        await client.markSeen(uid);
        processed++;
        highWatermark = Math.max(highWatermark, uid);
      } catch (e) {
        errors.push({ uid, error: e?.message || String(e) });
        // Don't abort the whole sync on one bad message — keep advancing
      }
    }

    // Persist new state
    await DB.prepare(
      `UPDATE email_sync_state SET uid_validity=?1, uid_next=?2,
         last_run_at=datetime('now'), last_result=?3, fetched_count=COALESCE(fetched_count,0)+?4
       WHERE mailbox=?5`
    ).bind(
      info.uidValidity,
      highWatermark,
      errors.length ? `partial: ${errors.length} errors` : "ok",
      processed,
      mailbox,
    ).run();
  } catch (e) {
    await DB.prepare(
      `UPDATE email_sync_state SET last_run_at=datetime('now'), last_result=?1 WHERE mailbox=?2`
    ).bind(("err: " + (e?.message || String(e))).slice(0, 200), mailbox).run();
    throw e;
  } finally {
    try { await client.logout(); } catch (_) {}
  }

  return {
    ok: true,
    mailbox,
    exists: info?.exists,
    uid_next: info?.uidNext,
    processed, matched, skipped,
    errors: errors.length ? errors.slice(0, 5) : undefined,
  };
}

// ────────────────────────────────────────────────────────────────────
// RFC 822 / MIME parser — only what we need
// ────────────────────────────────────────────────────────────────────

export function parseRfc822(raw) {
  const sep = raw.indexOf("\r\n\r\n");
  const headerBlock = sep === -1 ? raw : raw.slice(0, sep);
  const bodyBlock   = sep === -1 ? ""  : raw.slice(sep + 4);

  // Unfold headers: continuation lines start with WSP
  const lines = headerBlock.split(/\r\n/);
  const unfolded = [];
  for (const l of lines) {
    if (l && /^\s/.test(l) && unfolded.length) {
      unfolded[unfolded.length - 1] += " " + l.trim();
    } else {
      unfolded.push(l);
    }
  }
  const headers = {};
  for (const l of unfolded) {
    const m = l.match(/^([^:]+):\s*(.*)$/);
    if (m) {
      const key = m[1].toLowerCase();
      // Multiple Received headers etc — collect into array
      if (headers[key] != null) {
        if (Array.isArray(headers[key])) headers[key].push(m[2]);
        else headers[key] = [headers[key], m[2]];
      } else {
        headers[key] = m[2];
      }
    }
  }

  const getH = (k) => Array.isArray(headers[k]) ? headers[k][0] : headers[k];

  // Parse addresses
  const fromHeader = decodeMimeWords(getH("from") || "");
  const { name: fromName, addr: fromAddr } = splitNameAddr(fromHeader);
  const toAddrs = parseAddrList(decodeMimeWords(getH("to") || ""));
  const ccAddrs = parseAddrList(decodeMimeWords(getH("cc") || ""));
  const replyTo = parseAddrList(decodeMimeWords(getH("reply-to") || ""))[0];
  const subject = decodeMimeWords(getH("subject") || "");
  const messageId = (getH("message-id") || "").trim() || null;
  const inReplyTo = (getH("in-reply-to") || "").trim() || null;
  const references = (getH("references") || "").trim() || null;

  // Body
  const contentType = (getH("content-type") || "text/plain").toLowerCase();
  const cte = (getH("content-transfer-encoding") || "7bit").toLowerCase();
  let bodyText = null, bodyHtml = null;
  if (contentType.startsWith("multipart/")) {
    const boundaryMatch = contentType.match(/boundary\s*=\s*"?([^";]+)"?/);
    if (boundaryMatch) {
      const parts = splitMimeParts(bodyBlock, boundaryMatch[1]);
      for (const p of parts) {
        const pct = (p.headers["content-type"] || "text/plain").toLowerCase();
        const pcte = (p.headers["content-transfer-encoding"] || "7bit").toLowerCase();
        const decoded = decodeBody(p.body, pcte, pct);
        if (pct.startsWith("text/plain") && !bodyText) bodyText = decoded;
        if (pct.startsWith("text/html") && !bodyHtml)  bodyHtml = decoded;
        if (pct.startsWith("multipart/")) {
          // Nested multipart — recurse one level
          const nb = pct.match(/boundary\s*=\s*"?([^";]+)"?/);
          if (nb) {
            const nested = splitMimeParts(p.body, nb[1]);
            for (const np of nested) {
              const npct  = (np.headers["content-type"] || "text/plain").toLowerCase();
              const npcte = (np.headers["content-transfer-encoding"] || "7bit").toLowerCase();
              const dec = decodeBody(np.body, npcte, npct);
              if (npct.startsWith("text/plain") && !bodyText) bodyText = dec;
              if (npct.startsWith("text/html") && !bodyHtml)  bodyHtml = dec;
            }
          }
        }
      }
    }
  } else {
    const decoded = decodeBody(bodyBlock, cte, contentType);
    if (contentType.startsWith("text/html")) bodyHtml = decoded;
    else                                     bodyText = decoded;
  }
  // Fallback: derive text from HTML if we only got HTML
  if (!bodyText && bodyHtml) {
    bodyText = bodyHtml.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return {
    rawHeaders: headerBlock,
    headers,
    fromName, fromAddr,
    toAddrs, ccAddrs,
    replyTo,
    subject, messageId, inReplyTo, references,
    bodyText, bodyHtml,
  };
}

function splitNameAddr(s) {
  if (!s) return { name: "", addr: "" };
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, ""), addr: m[2].toLowerCase().trim() };
  return { name: "", addr: s.toLowerCase().trim() };
}

function parseAddrList(s) {
  if (!s) return [];
  // Naive split — addresses inside angle brackets are simple to split on commas
  // outside the brackets. Good enough for typical mail.
  const out = [];
  let buf = "", depth = 0;
  for (const ch of s) {
    if (ch === "<") depth++;
    if (ch === ">") depth--;
    if (ch === "," && depth === 0) { out.push(buf.trim()); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.map((x) => splitNameAddr(x).addr).filter(Boolean);
}

function splitMimeParts(body, boundary) {
  const delim = "--" + boundary;
  const close = delim + "--";
  const parts = [];
  let i = body.indexOf(delim);
  if (i === -1) return parts;
  i += delim.length;
  while (i < body.length) {
    // skip past CRLF after delim
    if (body[i] === "\r") i++;
    if (body[i] === "\n") i++;
    // find next delim
    const next = body.indexOf("\n" + delim, i);
    const end = next === -1 ? body.length : next + 1;
    const chunk = body.slice(i, end).replace(/\r\n$/, "").replace(/--$/, "");
    // close delim — bail
    if (body.slice(end, end + close.length) === close || body.slice(i).startsWith(close)) {
      parts.push(parsePart(chunk));
      break;
    }
    parts.push(parsePart(chunk));
    if (next === -1) break;
    i = next + 1 + delim.length;
  }
  return parts;
}
function parsePart(chunk) {
  const sep = chunk.indexOf("\r\n\r\n");
  const headers = {};
  if (sep === -1) return { headers, body: chunk };
  const headerLines = chunk.slice(0, sep).split(/\r\n/);
  const unfolded = [];
  for (const l of headerLines) {
    if (l && /^\s/.test(l) && unfolded.length) unfolded[unfolded.length - 1] += " " + l.trim();
    else unfolded.push(l);
  }
  for (const l of unfolded) {
    const m = l.match(/^([^:]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  return { headers, body: chunk.slice(sep + 4) };
}

function decodeBody(body, cte, contentType) {
  let decoded = body;
  if (cte === "quoted-printable") decoded = decodeQuotedPrintable(body);
  else if (cte === "base64")      decoded = decodeBase64Utf8(body.replace(/\s+/g, ""));
  // Charset (typically UTF-8 already — Workers TextDecoder handles UTF-8 by default)
  return decoded;
}
function decodeQuotedPrintable(s) {
  // Soft line breaks: "=\r\n"
  let v = s.replace(/=\r?\n/g, "");
  // =XX → byte
  // Collect bytes for proper UTF-8 decoding
  const bytes = [];
  for (let i = 0; i < v.length; ) {
    if (v[i] === "=" && i + 2 < v.length) {
      const hex = v.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    bytes.push(v.charCodeAt(i));
    i++;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
}
function decodeBase64Utf8(b64) {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch { return b64; }
}
function decodeMimeWords(s) {
  if (!s) return "";
  return s.replace(/=\?([^?]+)\?(B|Q)\?([^?]+)\?=/gi, (_m, _cs, enc, data) => {
    if (enc.toUpperCase() === "B") return decodeBase64Utf8(data);
    // Q-encoding: like QP but with _ for space
    return decodeQuotedPrintable(data.replace(/_/g, " "));
  });
}

// ────────────────────────────────────────────────────────────────────
// Sender attribution — find matching contact / lead / project
// ────────────────────────────────────────────────────────────────────

async function resolveSenderAttribution(db, fromAddr, parsed) {
  const out = { contact_id: null, lead_id: null, project_id: null };
  if (!fromAddr) return out;

  // 1) Try threading: if In-Reply-To matches an existing message, inherit its
  // entity attachments. This catches replies even when the sender's display
  // address has changed (e.g. they switched email providers).
  if (parsed.inReplyTo) {
    const parent = await db.prepare(
      `SELECT contact_id, lead_id, project_id FROM email_messages WHERE message_id_header=?1 LIMIT 1`
    ).bind(parsed.inReplyTo).first().catch(() => null);
    if (parent) {
      if (parent.contact_id) out.contact_id = parent.contact_id;
      if (parent.lead_id)    out.lead_id    = parent.lead_id;
      if (parent.project_id) out.project_id = parent.project_id;
      if (out.contact_id || out.lead_id || out.project_id) return out;
    }
  }

  // 2) Match contacts by email (most authoritative — they've already engaged)
  const contact = await db.prepare(
    `SELECT id FROM contacts WHERE LOWER(email)=?1 LIMIT 1`
  ).bind(fromAddr).first().catch(() => null);
  if (contact) {
    out.contact_id = contact.id;
    // Find the most recent open project for this contact
    const proj = await db.prepare(
      `SELECT id, lead_id FROM projects WHERE contact_id=?1 ORDER BY id DESC LIMIT 1`
    ).bind(contact.id).first().catch(() => null);
    if (proj) {
      out.project_id = proj.id;
      if (proj.lead_id) out.lead_id = proj.lead_id;
    }
    return out;
  }

  // 3) Match leads by email
  const lead = await db.prepare(
    `SELECT id FROM leads WHERE LOWER(email)=?1 ORDER BY id DESC LIMIT 1`
  ).bind(fromAddr).first().catch(() => null);
  if (lead) {
    out.lead_id = lead.id;
    return out;
  }

  // 4) Unmatched — message still saved with NULL FKs (admin can manually attach)
  return out;
}
