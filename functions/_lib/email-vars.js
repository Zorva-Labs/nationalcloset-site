// Variable substitution + entity context helpers shared by the email-
// templates and email-messages endpoints. The CRM lets templates reference
// {{first_name}}, {{name}}, {{interest}}, {{address}}, {{quoted_amount}},
// {{proposal_link}}, {{contract_link}}, {{appointment_date}}, {{appointment_time}}.
//
// renderTemplate() does a defensive substitution — missing keys leave the
// placeholder visible so the admin can see what's unfilled before sending
// instead of an awkward "Hi ," in the customer's inbox.

const TOKEN_RE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

export function renderTemplate(tpl, vars) {
  if (!tpl) return "";
  return String(tpl).replace(TOKEN_RE, (_match, key) => {
    const v = vars?.[key];
    if (v == null || v === "") return `{{${key}}}`;
    return String(v);
  });
}

// Build the {{vars}} dict for a given entity. Pass any of contact/lead/project
// rows and we merge what's available. We never throw — missing entities just
// mean fewer variables.
export async function buildEmailContext(db, { contact, lead, project }) {
  // Hydrate from DB if only ids were passed
  if (contact?.id == null && contact?.contact_id != null) contact = await loadContact(db, contact.contact_id);
  if (lead?.id == null && lead?.lead_id != null) lead = await loadLead(db, lead.lead_id);
  if (project?.id == null && project?.project_id != null) project = await loadProject(db, project.project_id);

  // Prefer contact over lead (post-contact data is canonical), but fill from
  // lead when contact is missing fields.
  const name = pick(contact?.name, lead?.name);
  const first_name = firstName(name);
  const email = pick(contact?.email, lead?.email);
  const phone = pick(contact?.phone, lead?.phone);
  const street = pick(contact?.address_street, lead?.address_street);
  const city   = pick(contact?.address_city,   lead?.address_city);
  const state  = pick(contact?.address_state,  lead?.address_state);
  const zip    = pick(contact?.address_zip,    lead?.address_zip);
  const address = [street, [city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(", ");
  const interest = pick(lead?.interest, project?.name);
  const quoted = lead?.quoted_amount_cents ?? null;
  const quoted_amount = quoted != null ? `$${(quoted / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";

  // Lookup most recent proposal + contract on the project — useful for
  // {{proposal_link}} and {{contract_link}} template variables.
  let proposal_link = "";
  let contract_link = "";
  if (project?.id) {
    const prop = await db.prepare(
      `SELECT view_token FROM proposals WHERE project_id=?1 ORDER BY created_at DESC LIMIT 1`
    ).bind(project.id).first().catch(() => null);
    if (prop?.view_token) proposal_link = `https://nationalclosetco.com/proposal/?t=${prop.view_token}`;
    const ctr = await db.prepare(
      `SELECT view_token FROM contracts WHERE project_id=?1 ORDER BY created_at DESC LIMIT 1`
    ).bind(project.id).first().catch(() => null);
    if (ctr?.view_token) contract_link = `https://nationalclosetco.com/contract/?t=${ctr.view_token}`;
  }

  return {
    name: name || "",
    first_name: first_name || "",
    email: email || "",
    phone: phone || "",
    address,
    street, city, state, zip,
    interest: interest || "",
    quoted_amount,
    proposal_link,
    contract_link,
    // Appointment placeholders — caller may override per-send
    appointment_date: "",
    appointment_time: "",
  };
}

// Normalize a subject + recipient email into a coarse thread key. Used as a
// fallback when In-Reply-To / References headers are missing on inbound mail.
export function deriveThreadKey(subject, peerEmail) {
  const s = String(subject || "")
    .replace(/^\s*(?:re|fwd|fw)\s*:\s*/gi, "")
    .replace(/^\s*(?:re|fwd|fw)\s*:\s*/gi, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const p = String(peerEmail || "").toLowerCase().trim();
  return `${s}|${p}`;
}

// ──────────── small helpers ────────────
function pick(...vals) { for (const v of vals) if (v != null && v !== "") return v; return null; }
function firstName(full) {
  if (!full) return "";
  return String(full).trim().split(/\s+/)[0].replace(/[^A-Za-z'\-]/g, "");
}
async function loadContact(db, id) {
  return await db.prepare(`SELECT * FROM contacts WHERE id=?1`).bind(id).first().catch(() => null);
}
async function loadLead(db, id) {
  return await db.prepare(`SELECT * FROM leads WHERE id=?1`).bind(id).first().catch(() => null);
}
async function loadProject(db, id) {
  return await db.prepare(`SELECT * FROM projects WHERE id=?1`).bind(id).first().catch(() => null);
}
