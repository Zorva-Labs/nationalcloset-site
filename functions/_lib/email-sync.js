// Inbound mail sync: fetch new messages, parse, match to contacts/leads/
// projects by sender email, insert into email_messages.
//
// Primary transport is the Gmail API (Google Workspace) — since MX points to
// Google, replies now land there. runEmailSync() dispatches to Gmail when the
// service account is configured, and falls back to the legacy Purelymail IMAP
// poll during cutover. Called from /api/internal/email-sync (cron). Idempotent.
//
// State (email_sync_state, mailbox='INBOX'): the Gmail path repurposes the
// uid_next column as "last processed Gmail internalDate (ms epoch)" and pins
// uid_validity=1; the IMAP path uses uid_validity/uid_next as IMAP UIDs.

import { ImapClient } from "./imap.js";
import { getGoogleAccessToken, googleConfigured, impersonationUser } from "./google-auth.js";
import { deriveThreadKey } from "./email-vars.js";
import { recordActivity } from "./db.js";
import { bumpLeadStatusForward } from "./lifecycle.js";

const MAILBOX = "INBOX";

// Dispatcher: Gmail API when configured, else legacy IMAP fallback.
export async function runEmailSync(env, opts = {}) {
  if (googleConfigured(env)) return runGmailSync(env, opts);
  return runImapSync(env, opts);
}

// ── Gmail API inbound sync ──────────────────────────────────────────
export async function runGmailSync(env, { maxPerRun = 50, mailbox = MAILBOX } = {}) {
  const { DB } = env;
  const user = impersonationUser(env);
  let token;
  try { token = await getGoogleAccessToken(env, user); }
  catch (e) { return { skipped: true, reason: "auth_failed", error: e?.message || String(e) }; }
  const auth = { Authorization: `Bearer ${token}` };
  const api = (path) => `https://gmail.googleapis.com/gmail/v1/users/me/${path}`;

  const state = await DB.prepare(`SELECT * FROM email_sync_state WHERE mailbox=?1`).bind(mailbox).first();

  // First run for the Gmail cursor: set the watermark to "now" so we ingest
  // from-now-on rather than backfilling the whole mailbox. (uid_validity=2
  // marks the row as Gmail-cursor so a leftover IMAP row gets reset once.)
  if (!state || state.uid_validity !== 2) {
    const nowMs = Date.now();
    if (state) {
      await DB.prepare(`UPDATE email_sync_state SET uid_validity=2, uid_next=?1, last_run_at=datetime('now'), last_result='init-gmail' WHERE mailbox=?2`).bind(nowMs, mailbox).run().catch(() => {});
    } else {
      await DB.prepare(`INSERT INTO email_sync_state (mailbox, uid_validity, uid_next, last_run_at, last_result) VALUES (?1, 2, ?2, datetime('now'), 'init-gmail')`).bind(mailbox, nowMs).run().catch(() => {});
    }
    return { ok: true, firstRun: true, cursor: nowMs };
  }

  const lastInternal = Number(state.uid_next || 0);
  const afterSec = Math.max(0, Math.floor(lastInternal / 1000));
  const q = encodeURIComponent(`in:inbox -in:chats after:${afterSec}`);

  let ids = [];
  try {
    const res = await fetch(api(`messages?q=${q}&maxResults=${maxPerRun}`), { headers: auth });
    const json = await res.json();
    if (!res.ok) return { skipped: true, reason: "list_failed", error: json?.error?.message || res.status };
    ids = (json.messages || []).map((x) => x.id);
  } catch (e) { return { skipped: true, reason: "list_failed", error: e?.message || String(e) }; }

  let processed = 0, matched = 0, skipped = 0, highWater = lastInternal;
  const errors = [];
  const authDomain = (user.split("@")[1] || "nationalclosetco.com").toLowerCase();
  ids.reverse(); // Gmail returns newest-first; process oldest-first for a monotonic watermark

  for (const gid of ids) {
    try {
      const gRes = await fetch(api(`messages/${gid}?format=RAW`), { headers: auth });
      const g = await gRes.json();
      if (!gRes.ok) { errors.push({ gid, error: g?.error?.message || gRes.status }); continue; }
      const internal = Number(g.internalDate || 0);
      if (internal && internal <= lastInternal) { skipped++; continue; } // second-granular after: overlap

      const parsed = parseRfc822(decodeGmailRaw(g.raw || ""));
      const fromAddr = parsed.fromAddr?.toLowerCase() || "";
      // Skip our own outbound (any @our-domain sender in the inbox is Sent re-ingest / bounces).
      if (fromAddr && (fromAddr === user.toLowerCase() || fromAddr.endsWith("@" + authDomain))) {
        skipped++; highWater = Math.max(highWater, internal); continue;
      }
      if (parsed.messageId) {
        const dup = await DB.prepare(`SELECT id FROM email_messages WHERE message_id_header=?1 LIMIT 1`).bind(parsed.messageId).first();
        if (dup) { skipped++; highWater = Math.max(highWater, internal); continue; }
      }
      const resolved = await resolveSenderAttribution(DB, fromAddr, parsed);
      await DB.prepare(
        `INSERT INTO email_messages
           (direction, status, contact_id, lead_id, project_id,
            message_id_header, in_reply_to, references_header, thread_key,
            from_name, from_addr, to_addrs, cc_addrs,
            reply_to, subject, body_text, body_html,
            raw_headers, received_at)
         VALUES ('in', 'received', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'))`
      ).bind(
        resolved.contact_id, resolved.lead_id, resolved.project_id,
        parsed.messageId || null, parsed.inReplyTo || null, parsed.references || null,
        deriveThreadKey(parsed.subject, fromAddr),
        parsed.fromName || null, fromAddr || "",
        JSON.stringify(parsed.toAddrs || []),
        parsed.ccAddrs?.length ? JSON.stringify(parsed.ccAddrs) : null,
        parsed.replyTo || null, parsed.subject || "",
        parsed.bodyText || null, parsed.bodyHtml || null,
        parsed.rawHeaders.slice(0, 8000),
      ).run();

      if (resolved.contact_id || resolved.lead_id || resolved.project_id) {
        await recordActivity(DB, {
          entityType: resolved.lead_id ? "lead" : resolved.project_id ? "project" : "contact",
          entityId: resolved.lead_id || resolved.project_id || resolved.contact_id,
          action: "email-received",
          actorKind: "customer", actorName: parsed.fromName || fromAddr,
          details: { subject: parsed.subject, message_id: parsed.messageId },
        });
        matched++;
        if (resolved.lead_id) {
          await bumpLeadStatusForward(DB, resolved.lead_id, "replied", { actor: { kind: "customer", name: parsed.fromName || fromAddr } }).catch(() => {});
        }
      }
      processed++; highWater = Math.max(highWater, internal);
    } catch (e) {
      errors.push({ gid, error: e?.message || String(e) });
    }
  }

  await DB.prepare(
    `UPDATE email_sync_state SET uid_validity=2, uid_next=?1, last_run_at=datetime('now'),
       last_result=?2, fetched_count=COALESCE(fetched_count,0)+?3 WHERE mailbox=?4`
  ).bind(highWater, errors.length ? `partial: ${errors.length} errors` : "ok", processed, mailbox).run().catch(() => {});

  return { ok: true, transport: "gmail", processed, matched, skipped, errors: errors.length ? errors.slice(0, 5) : undefined };
}

// Decode Gmail's base64url raw message into an RFC822 string (UTF-8).
function decodeGmailRaw(b64url) {
  let b64 = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  b64 += "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

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
  let highWatermark = lastUidSeen;
  const errors = [];
  // Socket-level failures (notably Cloudflare's "Stream was cancelled") leave
  // the connection unusable — we must stop reading and reconnect next run.
  const FATAL_SOCKET = /cancell?ed|socket closed|closed unexpectedly|connection (lost|reset|closed)|aborted|broken pipe|timeout|timed out/i;
  const startedAt = Date.now();
  const DEADLINE_MS = 22000;

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
    for (const uid of uids.slice(0, maxPerRun)) {
      if (Date.now() - startedAt > DEADLINE_MS) break;  // leave time to persist state + logout
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
          // A lead writing back is a real reply — move them forward to "replied"
          // (forward-only; a lead already at consult/proposal/booked stays put).
          if (resolved.lead_id) {
            await bumpLeadStatusForward(DB, resolved.lead_id, "replied", { actor: { kind: "customer", name: parsed.fromName || fromAddr } }).catch(() => {});
          }
        }

        // NOTE: intentionally do NOT mark the message \Seen. The sync tracks
        // its position via the UID high-watermark (uid_next in
        // email_sync_state), so flagging messages read is unnecessary — and
        // doing so made every inbound email show up already-read in the
        // Purelymail inbox, causing real messages to be missed. Leave the
        // \Seen flag untouched so the human inbox still shows them as unread.
        processed++;
        highWatermark = Math.max(highWatermark, uid);
      } catch (e) {
        const msg = e?.message || String(e);
        errors.push({ uid, error: msg });
        // Advance the cursor PAST this message so a poison/oversized email can't
        // block the entire queue forever (the original bug — a single bad UID
        // stalled all mail behind it indefinitely). If the socket itself died,
        // stop this run; the next cron run reconnects fresh and resumes here.
        highWatermark = Math.max(highWatermark, uid);
        if (FATAL_SOCKET.test(msg)) break;
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
    // Persist whatever progress we made so a mid-run failure doesn't reprocess
    // — or get permanently stuck on — the same UID next time.
    await DB.prepare(
      `UPDATE email_sync_state SET uid_validity=COALESCE(?1, uid_validity), uid_next=?2,
         last_run_at=datetime('now'), last_result=?3 WHERE mailbox=?4`
    ).bind(info?.uidValidity || null, highWatermark, ("err: " + (e?.message || String(e))).slice(0, 200), mailbox)
     .run().catch(() => {});
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

  // 1) Threading: if this is a reply to one of OUR messages, inherit the
  // parent's attribution. Check In-Reply-To first, then every Message-ID in the
  // References chain (newest first). This catches replies even when the sender
  // writes from a different address than we have on file — the strongest signal.
  const threadIds = [];
  if (parsed.inReplyTo) threadIds.push(parsed.inReplyTo.trim());
  if (parsed.references) {
    for (const r of (parsed.references.match(/<[^>]+>/g) || []).reverse()) {
      if (!threadIds.includes(r)) threadIds.push(r);
    }
  }
  for (const mid of threadIds) {
    const parent = await db.prepare(
      `SELECT contact_id, lead_id, project_id FROM email_messages WHERE message_id_header=?1 LIMIT 1`
    ).bind(mid).first().catch(() => null);
    if (parent && (parent.contact_id || parent.lead_id || parent.project_id)) {
      out.contact_id = parent.contact_id || null;
      out.lead_id    = parent.lead_id    || null;
      out.project_id = parent.project_id || null;
      return out;
    }
  }

  if (!fromAddr) return out;

  // Match on the raw sender AND a normalized form (strip +tag; remove dots for
  // Gmail) so a lead who replies from a slightly different variant of the same
  // inbox (e.g. jane+homes@gmail.com vs jane@gmail.com) still auto-attaches.
  const candidates = [...new Set([fromAddr.toLowerCase(), normalizeEmail(fromAddr)])];

  // 2) Match contacts by email (most authoritative — they've already engaged)
  for (const e of candidates) {
    const contact = await db.prepare(
      `SELECT id FROM contacts WHERE LOWER(email)=?1 LIMIT 1`
    ).bind(e).first().catch(() => null);
    if (contact) {
      out.contact_id = contact.id;
      const proj = await db.prepare(
        `SELECT id, lead_id FROM projects WHERE contact_id=?1 ORDER BY id DESC LIMIT 1`
      ).bind(contact.id).first().catch(() => null);
      if (proj) { out.project_id = proj.id; if (proj.lead_id) out.lead_id = proj.lead_id; }
      return out;
    }
  }

  // 3) Match leads by email
  for (const e of candidates) {
    const lead = await db.prepare(
      `SELECT id FROM leads WHERE LOWER(email)=?1 ORDER BY id DESC LIMIT 1`
    ).bind(e).first().catch(() => null);
    if (lead) { out.lead_id = lead.id; return out; }
  }

  // 4) Unmatched — saved with NULL FKs; still visible in the global Inbox.
  return out;
}

// Normalize an email for matching: lowercase, drop +tag sub-addressing, and
// remove dots in the local part for Gmail (Google ignores them). Used only for
// attribution lookups — the message still stores the raw From address.
function normalizeEmail(e) {
  const lower = String(e || "").toLowerCase().trim();
  const at = lower.lastIndexOf("@");
  if (at < 1) return lower;
  let local = lower.slice(0, at).split("+")[0];
  const dom = lower.slice(at + 1);
  if (dom === "gmail.com" || dom === "googlemail.com") local = local.replace(/\./g, "");
  return local + "@" + dom;
}
