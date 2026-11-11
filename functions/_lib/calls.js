// Phone calls from CallRail: reading the webhook's payload, tying a call to the
// lead or client who made it, and making a lead from a call. Used by
// /api/callrail (the webhook) and /api/calls/:id/lead (the CRM's button).
import { recordActivity } from "./db.js";

// The Tag step on each branch of "NCC Phone Menu" is how a call says which key
// was pressed. A renamed tag has to change here too.
const MENU_TAGS = {
  "menu - estimate": "estimate",
  "menu - service": "service",
  "menu - message": "message",
};
export const CHOICE_LABEL = { estimate: "Free estimate", service: "Service", message: "Leave a message" };

// CallRail sends tags as names or as {name, color}.
export function tagNames(call) {
  const t = call && call.tags;
  if (!Array.isArray(t)) return [];
  return t.map((x) => String((x && x.name) || x || "").trim()).filter(Boolean);
}

export function menuChoiceOf(tags) {
  for (const t of tags) {
    const hit = MENU_TAGS[t.toLowerCase()];
    if (hit) return hit;
  }
  return null;
}

/* ---- The phone agent's intake (CallRail Voice Assist, 2026-11-11) ----------
   It arrives on the call as voice_assist_message.contents: { "<question>":
   "<answer>" }. CallRail's own questions come as name, phone_number and
   purpose; ours (callrail/voice-assist.json) as Existing_job, What_space,
   Service_address, Caller_email and How_soon. Matched by what the question is
   about, so a reworded label still lands. First match wins. */
const ASKS = [
  ["email", /e-?mail/i],
  ["existing", /existing|current job|already/i],
  ["space", /space|room|area of the home/i],
  ["callback_phone", /phone|number|reach you|call you back|callback/i],
  ["urgency", /how soon|when|timeline|timeframe|urgen/i],
  ["address", /address|location|where/i],
  ["name", /\bname\b/i],
  ["project", /purpose|reason|need|project|help|describe/i],
];
const clip = (v, n) => (v == null ? "" : String(v)).trim().slice(0, n);

export function intakeOf(call) {
  const va = call && call.voice_assist_message;
  const contents = va && typeof va.contents === "object" ? va.contents : null;
  if (!contents) return null;
  const out = {};
  for (const [q, a] of Object.entries(contents)) {
    const ans = clip(typeof a === "object" && a ? a.answer ?? a.value ?? JSON.stringify(a) : a, 600);
    if (!ans) continue;
    const hit = ASKS.find(([, re]) => re.test(q.replace(/_+/g, " ")));
    if (hit && !out[hit[0]]) out[hit[0]] = ans;
  }
  if (out.email) {
    const e = out.email.replace(/\s+/g, "").toLowerCase();
    if (/^[^@]+@[^@]+\.[a-z]{2,}$/.test(e)) out.email = e; else delete out.email;
  }
  return Object.keys(out).length ? out : null;
}

// "A job you're already working on" → service; anything else → a new project.
export function intakeChoice(intake) {
  if (!intake) return null;
  const x = String(intake.existing || "").toLowerCase();
  return /exist|current|already|working on|yes/.test(x) && !/\bnew\b/.test(x) ? "service" : "estimate";
}

export const INTAKE_LABELS = [
  ["name", "Name"], ["callback_phone", "Callback number"], ["email", "Email"], ["address", "Address"],
  ["existing", "New or existing"], ["space", "Space"], ["project", "What they need"], ["urgency", "How soon"],
];

export function lastTen(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

export function prettyPhone(phone) {
  const d = lastTen(phone);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(phone || "");
}

// Phone numbers are free-form in the CRM, so compare the digits.
const DIGITS = (col) =>
  `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col},' ',''),'-',''),'(',''),')',''),'.',''),'+','')`;

// The lead and client this number already belongs to, newest first.
export async function findCaller(db, phone) {
  const ten = lastTen(phone);
  if (!ten) return { leadId: null, contactId: null };
  const lead = await db.prepare(
    `SELECT id, contact_id FROM leads
      WHERE archived_at IS NULL AND ${DIGITS("phone")} LIKE '%' || ?1
      ORDER BY datetime(created_at) DESC LIMIT 1`
  ).bind(ten).first();
  const contact = lead && lead.contact_id
    ? { id: lead.contact_id }
    : await db.prepare(
        `SELECT id FROM contacts WHERE ${DIGITS("phone")} LIKE '%' || ?1 ORDER BY datetime(updated_at) DESC LIMIT 1`
      ).bind(ten).first();
  return { leadId: lead ? lead.id : null, contactId: contact ? contact.id : null };
}

// Carriers often send a place or a phone type as the caller's name.
export function realName(name) {
  const n = String(name || "").trim();
  const notAName = !n || /wireless|caller|unknown|unavailable|private|toll free|\d/i.test(n) || /^[A-Za-z .'-]+,? [A-Z]{2}$/.test(n);
  return notAName ? "" : n.slice(0, 200);
}

export function callerNameOf(row) {
  return row.caller_name || `Phone caller ${prettyPhone(row.caller_number)}`;
}

// Make the lead for a call and tie the call to it. leads.phone and leads.email
// are NOT NULL, so a caller with no email is an empty string, as on /api/intake/lead.
export async function leadFromCall(db, row, actor = {}) {
  const intake = (() => { try { return row.intake ? JSON.parse(row.intake) : null; } catch { return null; } })();
  const dialed = row.tracking_number ? ` ${prettyPhone(row.tracking_number)}` : "";
  const choice = row.menu_choice && !row.agent ? ` and chose "${CHOICE_LABEL[row.menu_choice]}"` : "";
  const how = row.agent ? " No one picked up, and the phone agent took the details."
    : row.voicemail ? " Left a voicemail." : row.answered ? " The call was answered." : " No one answered and no message was left.";
  const told = intake
    ? "\n\n" + INTAKE_LABELS.filter(([k]) => intake[k] && k !== "name" && k !== "email").map(([k, l]) => `${l}: ${intake[k]}`).join("\n")
    : "";
  const location = (intake && intake.address) || [row.caller_city, row.caller_state].filter(Boolean).join(", ") || null;
  const name = (intake && intake.name) || callerNameOf(row);
  const phone = prettyPhone((intake && intake.callback_phone) || row.caller_number);
  const lead = await db.prepare(
    `INSERT INTO leads (name, phone, email, location, message, interest, source_page, utm_source, utm_medium, contact_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'phone', 'call', ?8) RETURNING id`
  ).bind(
    name, phone, (intake && intake.email) || "", location,
    `Called${dialed}${choice}.${how}${told}`, (intake && intake.space) || null,
    row.agent ? "phone agent" : "phone", row.contact_id || null
  ).first();
  await db.prepare("UPDATE calls SET lead_id = ?1, updated_at = datetime('now') WHERE id = ?2").bind(lead.id, row.id).run();
  await recordActivity(db, {
    entityType: "lead", entityId: lead.id, action: "created",
    actorKind: actor.kind || "system", actorId: actor.id || null, actorName: actor.name || null,
    details: { source: row.agent ? "phone agent" : "phone", call: row.id, choice: row.menu_choice },
  }).catch(() => {});
  return lead.id;
}
