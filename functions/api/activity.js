// GET /api/activity
//   ?entity_type=&entity_id=    strict single-entity filter (legacy)
//   ?project_id=ID              full unified feed for a project — includes
//                               the project itself plus its originating lead,
//                               every proposal, every contract, every
//                               appointment, and every email_message tied to
//                               it. Used by the Job page Activity tab.
//   ?contact_id=ID              same idea for a contact's full history.
import { requireAuth, json } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const entityType = url.searchParams.get("entity_type");
  const entityId = url.searchParams.get("entity_id");
  const projectId = parseIntOrNull(url.searchParams.get("project_id"));
  const contactId = parseIntOrNull(url.searchParams.get("contact_id"));
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const { DB } = context.env;

  // Project-aggregated feed: gather every related entity ID first, then run
  // ONE union-style query. Builds the (type, ids[]) tuples in JS, splats
  // them into the SQL using inline integer values (safe — they're all
  // numeric primary keys we just SELECT'd ourselves).
  if (projectId != null) {
    const project = await DB.prepare(`SELECT id, contact_id, lead_id FROM projects WHERE id=?1`).bind(projectId).first();
    if (!project) return json({ activity: [] });

    const tuples = [];
    tuples.push(["project", [projectId]]);
    if (project.lead_id) tuples.push(["lead", [project.lead_id]]);
    tuples.push(["proposal",      await listIds(DB, `SELECT id FROM proposals    WHERE project_id=?1`, projectId)]);
    tuples.push(["contract",      await listIds(DB, `SELECT id FROM contracts    WHERE project_id=?1`, projectId)]);
    tuples.push(["appointment",   await listIds(DB, `SELECT id FROM appointments WHERE project_id=?1`, projectId)]);
    tuples.push(["email_message", await listIds(DB,
      `SELECT id FROM email_messages
         WHERE project_id=?1
            OR lead_id    = (SELECT lead_id    FROM projects WHERE id=?1)
            OR contact_id = (SELECT contact_id FROM projects WHERE id=?1)`, projectId)]);

    return json({ activity: await fetchUnion(DB, tuples, limit) });
  }

  // Contact-aggregated feed: same idea but the root is a contact.
  if (contactId != null) {
    const contact = await DB.prepare(`SELECT id FROM contacts WHERE id=?1`).bind(contactId).first();
    if (!contact) return json({ activity: [] });

    const leadIds    = await listIds(DB, `SELECT id FROM leads    WHERE contact_id=?1`, contactId);
    const projectIds = await listIds(DB, `SELECT id FROM projects WHERE contact_id=?1`, contactId);
    const proposalIds = projectIds.length
      ? await listIdsInSet(DB, `SELECT id FROM proposals WHERE project_id IN`, projectIds)
      : [];
    const contractIds = projectIds.length
      ? await listIdsInSet(DB, `SELECT id FROM contracts WHERE project_id IN`, projectIds)
      : [];
    const apptIds = await listIds(DB,
      projectIds.length
        ? `SELECT id FROM appointments WHERE contact_id=?1 OR project_id IN (${projectIds.map(() => "?").join(",")})`
        : `SELECT id FROM appointments WHERE contact_id=?1`,
      ...(projectIds.length ? [contactId, ...projectIds] : [contactId])
    );
    const emailIds = await listIds(DB, `SELECT id FROM email_messages WHERE contact_id=?1`, contactId);

    const tuples = [
      ["contact",       [contactId]],
      ["lead",          leadIds],
      ["project",       projectIds],
      ["proposal",      proposalIds],
      ["contract",      contractIds],
      ["appointment",   apptIds],
      ["email_message", emailIds],
    ];
    return json({ activity: await fetchUnion(DB, tuples, limit) });
  }

  // Legacy strict-match fallback
  let sql = `SELECT * FROM activity_log WHERE 1=1`;
  const binds = [];
  if (entityType) { binds.push(entityType); sql += ` AND entity_type = ?${binds.length}`; }
  if (entityId)   { binds.push(parseInt(entityId, 10)); sql += ` AND entity_id = ?${binds.length}`; }
  sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ activity: rows });
}

async function listIds(DB, sql, ...binds) {
  const rows = (await DB.prepare(sql).bind(...binds).all()).results || [];
  return rows.map((r) => r.id);
}
// Variant: fixed-prefix SQL with an IN-list suffix and the ids spread as binds
async function listIdsInSet(DB, sqlPrefix, ids) {
  if (!ids.length) return [];
  const sql = `${sqlPrefix} (${ids.map(() => "?").join(",")})`;
  return listIds(DB, sql, ...ids);
}
// Run a single SELECT over activity_log that ORs all (entity_type, entity_id IN (...))
// tuples together. All ids are numeric PKs we just SELECT'd, so inlining
// them in the query is safe (no user input). One round-trip total.
async function fetchUnion(DB, tuples, limit) {
  const clauses = tuples
    .filter(([, ids]) => ids && ids.length)
    .map(([type, ids]) => `(entity_type='${type}' AND entity_id IN (${ids.join(",")}))`);
  if (!clauses.length) return [];
  const sql = `SELECT * FROM activity_log WHERE ${clauses.join(" OR ")} ORDER BY created_at DESC LIMIT ${limit}`;
  return (await DB.prepare(sql).all()).results || [];
}
function parseIntOrNull(s) {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
