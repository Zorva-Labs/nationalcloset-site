// Internal, staff-only notes on a job. Mirrors /api/leads/[id]/notes.
//
// These are NEVER shown to the customer — see 0050_project_notes.sql. The
// customer-facing equivalent is proposals.job_notes, which is a different
// thing entirely.
import { requireAuth, json } from "../../../_lib/auth.js";

async function listNotes(db, id) {
  const { results } = await db.prepare(
    `SELECT id, body, author, created_at FROM project_notes
      WHERE project_id = ?1 ORDER BY datetime(created_at) DESC`
  ).bind(id).all();
  return results || [];
}

export async function onRequestGet(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;
  const id = parseInt(context.params.id, 10);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, 400);
  return json({ notes: await listNotes(context.env.DB, id) });
}

export async function onRequestPost(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;
  const id = parseInt(context.params.id, 10);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, 400);

  let body;
  try { body = await context.request.json(); }
  catch (_) { return json({ error: "Invalid JSON" }, 400); }

  const text = (body.body || "").toString().trim();
  if (!text) return json({ error: "Note body is required." }, 400);

  const project = await context.env.DB.prepare(`SELECT id FROM projects WHERE id = ?1`).bind(id).first();
  if (!project) return json({ error: "Job not found" }, 404);

  // Touch the job so it sorts to the top of "recently updated" like a lead does.
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO project_notes (project_id, body, author) VALUES (?1, ?2, ?3)`
    ).bind(id, text.slice(0, 4000), guard.email),
    context.env.DB.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?1`).bind(id),
  ]);

  return json({ notes: await listNotes(context.env.DB, id) });
}

// DELETE /api/projects/[id]/notes?note_id=123 — remove a mistyped note.
export async function onRequestDelete(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;
  const id = parseInt(context.params.id, 10);
  const noteId = parseInt(new URL(context.request.url).searchParams.get("note_id"), 10);
  if (!Number.isFinite(id) || !Number.isFinite(noteId)) return json({ error: "Invalid id" }, 400);

  // Scope the delete to this job so a stray note_id can't reach another job's notes.
  await context.env.DB.prepare(
    `DELETE FROM project_notes WHERE id = ?1 AND project_id = ?2`
  ).bind(noteId, id).run();

  return json({ notes: await listNotes(context.env.DB, id) });
}
