#!/usr/bin/env node
// The hello@nationalclosetco.com mailbox from this Mac: read what came in,
// answer it, and write a new letter. Every send goes out through the CRM's own
// POST /api/email-messages, so it leaves Gmail as hello@ (the service account,
// docs/automations.md), lands in hello@'s Sent folder, threads under the
// original (In-Reply-To / References), and is logged on the lead, contact or job.
//
//   node tools/crm/mail.mjs inbox [--days 7] [--all] [--open]
//        inbound mail, newest first; "answered" when hello@ has written in that
//        thread since. --all keeps newsletters (a List-Unsubscribe header) and the
//        no-reply and notification senders,
//        --open lists only what has no answer yet.
//   node tools/crm/mail.mjs show <id> [--full]
//        one message, its attachments' names and the thread around it.
//   node tools/crm/mail.mjs reply <id> --text reply.txt [--all] [--cc a@x.com,b@y.com]
//        [--attach file.pdf,…] [--send]
//        a reply to the sender (--all: also everyone else on the message), the
//        subject "Re: …". Without --send it prints what it would send.
//   node tools/crm/mail.mjs new --to a@x.com --subject "…" --text letter.txt
//        [--cc …] [--attach …] [--lead <id> | --project <id> | --contact <id>] [--send]
//
// The text is plain: the CRM wraps it in the branded letter with the footer
// (address, site, hello@, the main number). Sign it as the person writing.
//
// Reading is the live D1 over the Cloudflare API (CLOUDFLARE_API_TOKEN). The CRM
// syncs hello@'s Inbox and Sent folder every 3 minutes, so a message is here
// about 3 minutes after Gmail has it. Sending signs in to /api/auth/login as
// hello@ with NCC_CRM_PASSWORD and signs out after. The mailbox's read/unread
// state in Gmail is not touched: the service account holds gmail.readonly and
// gmail.send only.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";

const ACCOUNT_ID = "90656e3c5d6b57a43d0b2bb60c53e5b0";
const DB_ID = "f5787ce4-29f9-43be-bf0e-cb486f1ec8e9";
const SITE = "https://nationalclosetco.com";
const MAILBOX = "hello@nationalclosetco.com";
const NOISE = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|alerts?|bounce[s]?)[@+.-]|@(accounts\.google\.com|google\.com|stripe\.com|callrail\.com|closetprosoftware\.com|gusto\.com)$/i;

const env = Object.fromEntries(
  readFileSync(`${homedir()}/.env`, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return i < 0 ? [l, ""] : [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  })
);

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const list = (v) => (v ? String(v).split(/[,;]/).map((s) => s.trim()).filter(Boolean) : []);
const die = (m) => { console.error(m); process.exit(1); };

async function q(sql, params = []) {
  if (!env.CLOUDFLARE_API_TOKEN) die("CLOUDFLARE_API_TOKEN is not in ~/.env");
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) die(`D1: ${JSON.stringify(j.errors)}`);
  return j.result[0].results;
}

const central = (utc) => (utc ? new Date(utc.replace(" ", "T") + "Z").toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const addr = (s) => (String(s).match(/<([^>]+)>/)?.[1] || String(s)).trim().toLowerCase();
const arr = (s) => { try { return JSON.parse(s || "[]") || []; } catch { return list(s); } };
const textOf = (m) => (m.body_text || String(m.body_html || "").replace(/<(br|\/p|\/div)[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")).replace(/\n{3,}/g, "\n\n").trim();
const bare = (s) => String(s || "").replace(/^\s*((re|fwd?|aw)\s*:\s*)+/i, "").trim();

// "answered": hello@ wrote in that thread after this message came in.
const ANSWERED = `EXISTS (SELECT 1 FROM email_messages o WHERE o.direction='out' AND o.status IN ('sent','received')
  AND (o.in_reply_to = m.message_id_header OR o.thread_key = m.thread_key)
  AND COALESCE(o.sent_at, o.received_at, o.created_at) >= COALESCE(m.received_at, m.created_at))`;

async function inbox() {
  const days = parseInt(flag("days", "7"), 10);
  const rows = await q(
    `SELECT m.id, m.from_name, m.from_addr, m.subject, m.received_at, m.attachments_meta,
            m.lead_id, m.project_id, c.name AS contact_name, ${ANSWERED} AS answered,
            (instr(lower(m.raw_headers), 'list-unsubscribe') > 0 OR instr(lower(m.raw_headers), 'precedence: bulk') > 0) AS bulk
       FROM email_messages m LEFT JOIN contacts c ON c.id = m.contact_id
      WHERE m.direction='in' AND COALESCE(m.received_at, m.created_at) >= datetime('now', ?1)
      ORDER BY COALESCE(m.received_at, m.created_at) DESC LIMIT 300`,
    [`-${days} days`]
  );
  const shown = rows.filter((r) => (has("all") || (!NOISE.test(r.from_addr || "") && !r.bulk)) && (!has("open") || !r.answered));
  console.log(`${MAILBOX} — last ${days} days: ${shown.length} shown of ${rows.length}${has("all") ? "" : " (newsletters, no-reply and notification senders hidden; --all shows them)"}\n`);
  for (const r of shown) {
    const who = r.contact_name || r.from_name || r.from_addr;
    const tags = [r.answered ? "answered" : "OPEN", r.lead_id && `lead ${r.lead_id}`, r.project_id && `job ${r.project_id}`, arr(r.attachments_meta).length && `${arr(r.attachments_meta).length} att`].filter(Boolean).join(" · ");
    console.log(`#${String(r.id).padEnd(5)} ${central(r.received_at).padEnd(17)} ${who} <${r.from_addr}>\n       ${r.subject || "(no subject)"}   [${tags}]`);
  }
}

async function one(id) {
  const [m] = await q(`SELECT m.*, ${ANSWERED} AS answered FROM email_messages m WHERE m.id=?1`, [Number(id)]);
  if (!m) die(`no message #${id}`);
  return m;
}

async function show() {
  const m = await one(argv[1]);
  const body = textOf(m);
  console.log(`#${m.id} ${m.direction === "in" ? "received" : "sent"} ${central(m.received_at || m.sent_at)} CT${m.direction === "in" ? (m.answered ? " · answered" : " · OPEN") : ""}`);
  console.log(`From   : ${m.from_name ? `${m.from_name} ` : ""}<${m.from_addr}>${m.reply_to ? `\nReply  : ${m.reply_to}` : ""}`);
  console.log(`To     : ${arr(m.to_addrs).join(", ")}${arr(m.cc_addrs).length ? `\nCc     : ${arr(m.cc_addrs).join(", ")}` : ""}`);
  console.log(`Subject: ${m.subject}`);
  const links = [m.lead_id && `lead ${m.lead_id}`, m.project_id && `job ${m.project_id}`, m.contact_id && `contact ${m.contact_id}`].filter(Boolean);
  if (links.length) console.log(`CRM    : ${links.join(" · ")}`);
  const att = arr(m.attachments_meta);
  if (att.length) console.log(`Attach : ${att.map((a) => a.filename || a.name || "file").join(", ")}`);
  console.log(`\n${has("full") ? body : body.slice(0, 4000)}${!has("full") && body.length > 4000 ? `\n… (${body.length - 4000} more characters; --full)` : ""}\n`);
  const thread = await q(
    `SELECT id, direction, from_addr, subject, COALESCE(received_at, sent_at, created_at) t FROM email_messages
      WHERE (thread_key=?1 OR message_id_header=?2 OR in_reply_to=?3) AND id<>?4 ORDER BY t`,
    [m.thread_key, m.in_reply_to || "", m.message_id_header || "", m.id]
  );
  if (thread.length) {
    console.log("Thread:");
    for (const t of thread) console.log(`  #${t.id} ${t.direction === "in" ? "in " : "out"} ${central(t.t).padEnd(17)} ${t.from_addr} — ${t.subject}`);
  }
}

function attachments() {
  return list(flag("attach")).map((f) => {
    const ext = f.split(".").pop().toLowerCase();
    const type = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain" }[ext] || "application/octet-stream";
    return { filename: basename(f), content_type: type, content: readFileSync(f).toString("base64") };
  });
}

async function send(payload) {
  const att = payload.attachments || [];
  console.log(`From   : National Closet Company <${MAILBOX}>`);
  console.log(`To     : ${payload.to.join(", ")}${payload.cc?.length ? `\nCc     : ${payload.cc.join(", ")}` : ""}`);
  console.log(`Subject: ${payload.subject}${payload.parent_message_id ? `\nReplies: #${payload.parent_message_id} (same thread)` : ""}`);
  if (att.length) console.log(`Attach : ${att.map((a) => a.filename).join(", ")}`);
  console.log(`\n${payload.body_text}\n`);
  if (!has("send")) { console.log("(not sent — add --send to send it)"); return; }

  if (!env.NCC_CRM_PASSWORD) die("NCC_CRM_PASSWORD is not in ~/.env");
  const login = await fetch(`${SITE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json", "user-agent": "ncc-mail-cli" },
    body: JSON.stringify({ email: MAILBOX, password: env.NCC_CRM_PASSWORD }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  if (!login.ok || !cookie) die(`CRM sign-in failed: ${login.status} ${await login.text()}`);
  try {
    const r = await fetch(`${SITE}/api/email-messages`, {
      method: "POST", headers: { "content-type": "application/json", cookie, "user-agent": "ncc-mail-cli" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) die(`NOT SENT: ${r.status} ${JSON.stringify(j)}`);
    console.log(`sent   : CRM message #${j.id}, ${j.message_id}`);
  } finally {
    await fetch(`${SITE}/api/auth/logout`, { method: "POST", headers: { cookie, "user-agent": "ncc-mail-cli" } }).catch(() => {});
  }
}

async function reply() {
  const m = await one(argv[1]);
  if (m.direction !== "in") die(`#${m.id} is a message hello@ sent; reply to the one that came in`);
  const textFile = flag("text"); if (!textFile) die("--text <file> is required");
  const to = [addr(m.reply_to || m.from_addr)];
  const others = has("all") ? [...arr(m.to_addrs), ...arr(m.cc_addrs)].map(addr).filter((a) => a !== MAILBOX && !to.includes(a)) : [];
  const cc = [...new Set([...others, ...list(flag("cc")).map(addr)])];
  await send({
    to, cc: cc.length ? cc : undefined,
    subject: `Re: ${bare(m.subject)}`,
    body_text: readFileSync(textFile, "utf8").trim(),
    parent_message_id: m.id,
    lead_id: m.lead_id || undefined, project_id: m.project_id || undefined, contact_id: m.contact_id || undefined,
    attachments: attachments(),
  });
}

async function compose() {
  const to = list(flag("to")); if (!to.length) die("--to is required");
  const subject = flag("subject"); if (!subject) die("--subject is required");
  const textFile = flag("text"); if (!textFile) die("--text <file> is required");
  const cc = list(flag("cc"));
  await send({
    to, cc: cc.length ? cc : undefined, subject,
    body_text: readFileSync(textFile, "utf8").trim(),
    lead_id: flag("lead") ? Number(flag("lead")) : undefined,
    project_id: flag("project") ? Number(flag("project")) : undefined,
    contact_id: flag("contact") ? Number(flag("contact")) : undefined,
    attachments: attachments(),
  });
}

const run = { inbox, show, reply, new: compose }[cmd];
if (!run) die("usage: node tools/crm/mail.mjs inbox [--days 7] [--all] [--open] | show <id> [--full] | reply <id> --text file [--all] [--cc …] [--attach …] [--send] | new --to … --subject … --text file [--send]");
await run();
