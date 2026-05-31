// /api/projects/[id]/windows — replace the whole window list for a project (bulk save)
import { requireAuth, json } from "../../../_lib/auth.js";
import { reseedEmptyProposalTiers } from "../../../_lib/lifecycle.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const projectId = parseInt(context.params.id, 10);
  const rows = (await context.env.DB.prepare(`SELECT * FROM windows WHERE project_id=?1 ORDER BY position, id`).bind(projectId).all()).results || [];
  return json({ windows: rows });
}

export async function onRequestPut(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const projectId = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const list = Array.isArray(body.windows) ? body.windows : [];

  // Wipe + reinsert (simpler than diffing for our scale)
  await context.env.DB.prepare(`DELETE FROM windows WHERE project_id=?1`).bind(projectId).run();
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    if (!w.room) continue;
    await context.env.DB.prepare(
      `INSERT INTO windows (project_id, room, label, width_in, height_in, mount, depth_in, notes, position, product_id, color, wall)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
    ).bind(
      projectId,
      w.room,
      w.label || null,
      w.width_in != null ? Number(w.width_in) : null,
      w.height_in != null ? Number(w.height_in) : null,
      w.mount || null,
      w.depth_in != null ? Number(w.depth_in) : null,
      w.notes || null,
      i,
      w.product_id || null,
      w.color || null,
      w.wall || null,
    ).run();
  }
  // If the project has draft proposals that were created before windows
  // existed (empty tiers), populate them now so the admin doesn't have to
  // re-create the proposal just to get line items.
  const reseeded = await reseedEmptyProposalTiers(context.env.DB, projectId);
  return json({ ok: true, reseeded });
}
