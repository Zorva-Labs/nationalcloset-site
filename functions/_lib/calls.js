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
  const dialed = row.tracking_number ? ` ${prettyPhone(row.tracking_number)}` : "";
  const choice = row.menu_choice ? ` and chose "${CHOICE_LABEL[row.menu_choice]}"` : "";
  const how = row.voicemail ? " Left a voicemail." : row.answered ? " The call was answered." : " No one answered and no message was left.";
  const location = [row.caller_city, row.caller_state].filter(Boolean).join(", ") || null;
  const lead = await db.prepare(
    `INSERT INTO leads (name, phone, email, location, message, source_page, utm_source, utm_medium, contact_id)
     VALUES (?1, ?2, '', ?3, ?4, 'phone', 'phone', 'call', ?5) RETURNING id`
  ).bind(
    callerNameOf(row), prettyPhone(row.caller_number), location,
    `Called${dialed}${choice}.${how}`, row.contact_id || null
  ).first();
  await db.prepare("UPDATE calls SET lead_id = ?1, updated_at = datetime('now') WHERE id = ?2").bind(lead.id, row.id).run();
  await recordActivity(db, {
    entityType: "lead", entityId: lead.id, action: "created",
    actorKind: actor.kind || "system", actorId: actor.id || null, actorName: actor.name || null,
    details: { source: "phone", call: row.id, choice: row.menu_choice },
  }).catch(() => {});
  return lead.id;
}
