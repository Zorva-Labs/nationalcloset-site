import { requireAuth, json } from "../../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const { DB } = context.env;
  const c = await DB.prepare(`SELECT * FROM contacts WHERE id = ?1`).bind(id).first();
  if (!c) return json({ error: "Not found" }, 404);

  // Projects with their associated revenue + interest so the contact page can
  // sort them sensibly and show a lifetime-value summary. signed_total is
  // the sum of fully-executed or customer-signed contracts (their real spend);
  // proposed_total is the highest-tier total when no contract exists yet.
  const projects = (await DB.prepare(
    `SELECT p.*,
            l.interest AS lead_interest,
            l.created_at AS lead_created_at,
            (SELECT SUM(total_cents) FROM contracts WHERE project_id=p.id AND status IN ('fully_executed','signed_by_customer')) AS signed_total,
            (SELECT MAX(pt.total_cents)
               FROM proposal_tiers pt
               JOIN proposals pr ON pr.id = pt.proposal_id
              WHERE pr.project_id = p.id) AS proposed_total
       FROM projects p
       LEFT JOIN leads l ON l.id = p.lead_id
      WHERE p.contact_id = ?1
      ORDER BY datetime(p.updated_at) DESC, p.id DESC`
  ).bind(id).all()).results || [];

  // Lifetime stats — sum of every signed contract total. This is the number
  // the user wants to see when they open a contact's record.
  const stats = await DB.prepare(
    `SELECT
       COUNT(DISTINCT p.id) AS project_count,
       COUNT(DISTINCT CASE WHEN k.status IN ('fully_executed','signed_by_customer') THEN k.id END) AS booked_count,
       COALESCE(SUM(CASE WHEN k.status IN ('fully_executed','signed_by_customer') THEN k.total_cents ELSE 0 END), 0) AS lifetime_value_cents
       FROM projects p
       LEFT JOIN contracts k ON k.project_id = p.id
      WHERE p.contact_id = ?1`
  ).bind(id).first();

  const appointments = (await DB.prepare(
    `SELECT * FROM appointments WHERE contact_id = ?1 ORDER BY start_at DESC LIMIT 50`
  ).bind(id).all()).results || [];

  // All admin lead notes across every lead this contact has ever had —
  // useful when the contact has had multiple inquiries over time.
  const leadNotes = (await DB.prepare(
    `SELECT ln.id, ln.body, ln.author, ln.created_at, ln.lead_id
       FROM lead_notes ln
       JOIN leads l ON l.id = ln.lead_id
      WHERE l.contact_id = ?1
      ORDER BY datetime(ln.created_at) DESC`
  ).bind(id).all()).results || [];

  return json({ contact: c, projects, appointments, lead_notes: leadNotes, stats });
}

// DELETE /api/contacts/[id]?purge=1
//
// Without purge: refuses if the contact has ANY linked records (projects,
// leads, appointments, emails) — protects against accidentally nuking a
// customer's history.
//
// With ?purge=1: wipes EVERYTHING tied to this contact in dependency order:
//   email_messages → appointments → activity_log (for projects + leads) →
//   leads + lead_notes (cascade) → contacts (cascades to projects which
//   cascade to windows/proposals/contracts and their children).
//
// Returns a counts summary the UI can show.
export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const url = new URL(context.request.url);
  const purge = url.searchParams.get("purge") === "1";
  const { DB } = context.env;

  const exists = await DB.prepare(`SELECT id FROM contacts WHERE id=?1`).bind(id).first();
  if (!exists) return json({ error: "Not found" }, 404);

  // Count every dependent so we can either refuse the delete (default) or
  // surface a deletion summary (purge mode).
  const summary = {
    projects:     (await DB.prepare(`SELECT COUNT(*) AS n FROM projects WHERE contact_id=?1`).bind(id).first())?.n || 0,
    leads:        (await DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE contact_id=?1`).bind(id).first())?.n || 0,
    appointments: (await DB.prepare(`SELECT COUNT(*) AS n FROM appointments WHERE contact_id=?1 OR project_id IN (SELECT id FROM projects WHERE contact_id=?1)`).bind(id).first())?.n || 0,
    emails:       (await DB.prepare(`SELECT COUNT(*) AS n FROM email_messages WHERE contact_id=?1 OR project_id IN (SELECT id FROM projects WHERE contact_id=?1) OR lead_id IN (SELECT id FROM leads WHERE contact_id=?1)`).bind(id).first())?.n || 0,
  };

  const hasAnyLinks = summary.projects + summary.leads + summary.appointments + summary.emails > 0;
  if (!purge && hasAnyLinks) {
    return json({
      error: "Contact has linked records — add ?purge=1 to wipe everything, or remove the linked projects/leads first.",
      summary,
    }, 409);
  }

  if (purge) {
    // Gather project + lead IDs so we can clean their activity log entries
    const projIds = ((await DB.prepare(`SELECT id FROM projects WHERE contact_id=?1`).bind(id).all()).results || []).map((p) => p.id);
    const leadIds = ((await DB.prepare(`SELECT id FROM leads WHERE contact_id=?1`).bind(id).all()).results || []).map((l) => l.id);
    // Proposals + contracts under those projects (need their activity rows too)
    let propIds = [], kIds = [];
    if (projIds.length) {
      propIds = ((await DB.prepare(`SELECT id FROM proposals WHERE project_id IN (${projIds.map(() => "?").join(",")})`).bind(...projIds).all()).results || []).map((x) => x.id);
      kIds    = ((await DB.prepare(`SELECT id FROM contracts WHERE project_id IN (${projIds.map(() => "?").join(",")})`).bind(...projIds).all()).results || []).map((x) => x.id);
    }

    // 1) Email messages tied to this contact OR its projects OR its leads
    await DB.prepare(
      `DELETE FROM email_messages
        WHERE contact_id=?1
           OR project_id IN (SELECT id FROM projects WHERE contact_id=?1)
           OR lead_id    IN (SELECT id FROM leads    WHERE contact_id=?1)`
    ).bind(id).run();

    // 2) Appointments
    await DB.prepare(
      `DELETE FROM appointments
        WHERE contact_id=?1
           OR project_id IN (SELECT id FROM projects WHERE contact_id=?1)`
    ).bind(id).run();

    // 3) Activity log — for contact + each project/lead/proposal/contract
    await DB.prepare(`DELETE FROM activity_log WHERE entity_type='contact' AND entity_id=?1`).bind(id).run();
    for (const pid of projIds) await DB.prepare(`DELETE FROM activity_log WHERE entity_type='project' AND entity_id=?1`).bind(pid).run();
    for (const lid of leadIds) await DB.prepare(`DELETE FROM activity_log WHERE entity_type='lead' AND entity_id=?1`).bind(lid).run();
    for (const pid of propIds) await DB.prepare(`DELETE FROM activity_log WHERE entity_type='proposal' AND entity_id=?1`).bind(pid).run();
    for (const kid of kIds)    await DB.prepare(`DELETE FROM activity_log WHERE entity_type='contract' AND entity_id=?1`).bind(kid).run();

    // 4) Leads (cascade-deletes lead_notes)
    await DB.prepare(`DELETE FROM leads WHERE contact_id=?1`).bind(id).run();
  }

  // 5) Finally: delete the contact. FK ON DELETE CASCADE on projects.contact_id
  //    removes every project + cascades to windows/proposals(+tiers+lines+
  //    comments)/contracts(+lines).
  await DB.prepare(`DELETE FROM contacts WHERE id=?1`).bind(id).run();
  return json({ ok: true, purge, summary });
}

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const fields = [];
  const binds = [];
  const allowed = ["name","email","phone","address_street","address_city","address_state","address_zip","notes"];
  for (const k of allowed) {
    if (body[k] !== undefined) { fields.push(`${k}=?${binds.length+1}`); binds.push(body[k]); }
  }
  if (!fields.length) return json({ error: "Nothing to update" }, 400);
  fields.push(`updated_at=datetime('now')`);
  binds.push(id);
  await context.env.DB.prepare(`UPDATE contacts SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  return json({ ok: true });
}
