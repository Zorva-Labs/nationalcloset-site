// The team roster and who is assigned to a consult or a job.
//
// Assignment is a join table (`assignments`), not a column, because both owners
// go out on the same visit often enough that one-assignee-per-row would be
// wrong. entity_type is 'appointment' (a consult / measure / service visit) or
// 'project' (a job).
//
// Nothing here throws: a CRM screen that can't read the roster should still
// render the appointment.
import { recordActivity } from "./db.js";

export const ENTITY_TYPES = ["appointment", "project"];

// The whole roster. `includeInactive` is for the Team screen; everything else
// wants only people who can actually be assigned work today.
export async function listTeam(db, { includeInactive = false } = {}) {
  const sql = `SELECT id, name, email, phone, role, active FROM team_members
                ${includeInactive ? "" : "WHERE active = 1"}
                ORDER BY active DESC, name`;
  return (await db.prepare(sql).all().catch(() => ({ results: [] }))).results || [];
}

// Everyone assigned to one entity, in roster order.
export async function getAssignees(db, entityType, entityId) {
  if (!ENTITY_TYPES.includes(entityType) || !entityId) return [];
  return (await db.prepare(
    `SELECT t.id, t.name, t.email, t.phone, t.role, t.active, a.assigned_at
       FROM assignments a JOIN team_members t ON t.id = a.team_member_id
      WHERE a.entity_type = ?1 AND a.entity_id = ?2
      ORDER BY t.name`
  ).bind(entityType, entityId).all().catch(() => ({ results: [] }))).results || [];
}

// Assignees for many entities at once, as { [entityId]: [member, …] }. The list
// screens (calendar month, jobs table) would otherwise do one query per row.
export async function getAssigneeMap(db, entityType, ids) {
  const list = [...new Set((ids || []).map((n) => parseInt(n, 10)).filter(Number.isFinite))];
  if (!ENTITY_TYPES.includes(entityType) || !list.length) return {};
  const rows = (await db.prepare(
    `SELECT a.entity_id, t.id, t.name, t.email, t.role
       FROM assignments a JOIN team_members t ON t.id = a.team_member_id
      WHERE a.entity_type = ?1 AND a.entity_id IN (${list.map(() => "?").join(",")})
      ORDER BY t.name`
  ).bind(entityType, ...list).all().catch(() => ({ results: [] }))).results || [];
  const out = {};
  for (const r of rows) (out[r.entity_id] ||= []).push({ id: r.id, name: r.name, email: r.email, role: r.role });
  return out;
}

// Replace the assignee list for an entity. Pass [] to unassign everyone.
// Returns the resulting roster rows. Ids that aren't on the roster are dropped
// rather than erroring — a stale CRM tab shouldn't be able to 400 a save.
export async function setAssignees(db, entityType, entityId, memberIds, actor = {}) {
  if (!ENTITY_TYPES.includes(entityType) || !entityId) return [];
  const wanted = [...new Set((memberIds || []).map((n) => parseInt(n, 10)).filter(Number.isFinite))];

  let valid = [];
  if (wanted.length) {
    valid = ((await db.prepare(
      `SELECT id FROM team_members WHERE id IN (${wanted.map(() => "?").join(",")})`
    ).bind(...wanted).all().catch(() => ({ results: [] }))).results || []).map((r) => r.id);
  }

  const before = (await getAssignees(db, entityType, entityId)).map((m) => m.id);
  const added = valid.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !valid.includes(id));
  if (!added.length && !removed.length) return await getAssignees(db, entityType, entityId);

  if (removed.length) {
    await db.prepare(
      `DELETE FROM assignments WHERE entity_type=?1 AND entity_id=?2
        AND team_member_id IN (${removed.map(() => "?").join(",")})`
    ).bind(entityType, entityId, ...removed).run();
  }
  for (const id of added) {
    await db.prepare(
      `INSERT OR IGNORE INTO assignments (entity_type, entity_id, team_member_id, assigned_by)
       VALUES (?1, ?2, ?3, ?4)`
    ).bind(entityType, entityId, id, actor.name || null).run();
  }

  const after = await getAssignees(db, entityType, entityId);
  await recordActivity(db, {
    entityType, entityId, action: after.length ? "assigned" : "unassigned",
    actorKind: actor.kind || "admin", actorId: actor.id || null, actorName: actor.name || null,
    details: { assignees: after.map((m) => m.name), added: added.length, removed: removed.length },
  }).catch(() => {});
  return after;
}

// "Michael and Noah" / "Michael, Noah and Dave" — for email copy.
export function nameList(members, { first = true } = {}) {
  const names = (members || []).map((m) => (first ? String(m.name || "").trim().split(/\s+/)[0] : m.name)).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
