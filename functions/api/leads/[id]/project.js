// GET /api/leads/[id]/project — find (or create) the draft project attached
// to this lead, so the lead detail page can host the windows editor + proposal
// workspace BEFORE a contract is signed. The project exists in the DB but is
// hidden from the Jobs view until status = 'contracted'.
import { requireAuth, json } from "../../../_lib/auth.js";
import { upsertContact, recordActivity } from "../../../_lib/db.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const leadId = parseInt(context.params.id, 10);
  if (!Number.isFinite(leadId)) return json({ error: "Invalid lead id" }, 400);
  const { DB } = context.env;

  const lead = await DB.prepare(`SELECT * FROM leads WHERE id = ?1`).bind(leadId).first();
  if (!lead) return json({ error: "Lead not found" }, 404);

  // Find an existing project for this lead — prefer one linked via lead_id
  let project = await DB.prepare(`SELECT * FROM projects WHERE lead_id = ?1 ORDER BY id LIMIT 1`).bind(leadId).first();

  // None? Create a draft (only after we have at least an email to upsert a contact)
  if (!project) {
    if (!lead.email) return json({ project: null, windows: [], proposals: [] });
    const contactId = await upsertContact(DB, {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      address: {
        street: lead.address_street,
        city: lead.address_city,
        state: lead.address_state,
        zip: lead.address_zip,
      },
    });
    const siteAddress = [lead.address_street, [lead.address_city, lead.address_state].filter(Boolean).join(", "), lead.address_zip].filter(Boolean).join(", ") || null;
    const projectName = lead.interest ? `${lead.interest} — ${lead.name}` : `Whole house — ${lead.name}`;
    const r = await DB.prepare(
      `INSERT INTO projects (contact_id, lead_id, name, description, status, site_address)
       VALUES (?1, ?2, ?3, ?4, 'new', ?5) RETURNING id`
    ).bind(contactId, leadId, projectName, lead.message || null, siteAddress).first();
    await DB.prepare(`UPDATE leads SET contact_id=?1 WHERE id=?2 AND contact_id IS NULL`).bind(contactId, leadId).run();
    project = await DB.prepare(`SELECT * FROM projects WHERE id=?1`).bind(r.id).first();
    await recordActivity(DB, {
      entityType: "project", entityId: project.id, action: "draft-from-lead",
      actorKind: "admin", actorId: auth.id, actorName: auth.email,
      details: { lead_id: leadId },
    });
  }

  const windows = (await DB.prepare(`SELECT * FROM windows WHERE project_id = ?1 ORDER BY position, id`).bind(project.id).all()).results || [];
  const proposals = (await DB.prepare(`SELECT id, number, status, view_token, selected_tier, selected_total_cents, created_at FROM proposals WHERE project_id = ?1 ORDER BY created_at DESC`).bind(project.id).all()).results || [];

  return json({ project, windows, proposals });
}
