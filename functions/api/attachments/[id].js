// GET    /api/attachments/[id]      — stream the PDF (admin; ?dl=1 forces download)
// DELETE /api/attachments/[id]      — remove the file from R2 + the metadata row
import { requireAuth, json } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const row = await context.env.DB.prepare(`SELECT * FROM proposal_attachments WHERE id=?1`).bind(id).first();
  if (!row) return new Response("Not found", { status: 404 });
  const obj = await context.env.FILES.get(row.r2_key);
  if (!obj) return new Response("File missing", { status: 404 });
  const dl = new URL(context.request.url).searchParams.get("dl");
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.content_type || "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${(row.filename || "drawing.pdf").replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const row = await context.env.DB.prepare(`SELECT r2_key FROM proposal_attachments WHERE id=?1`).bind(id).first();
  if (!row) return json({ error: "Not found" }, 404);
  await context.env.FILES.delete(row.r2_key).catch(() => {});
  await context.env.DB.prepare(`DELETE FROM proposal_attachments WHERE id=?1`).bind(id).run();
  return json({ ok: true });
}
