// GET  /api/proposals/[id]/attachments  — list job-drawing PDFs (admin)
// POST /api/proposals/[id]/attachments  — upload a PDF (multipart, field "file")
//   Stored in R2 (env.FILES); metadata in proposal_attachments. project_id is
//   copied from the proposal so the file follows the client into the job folder.
import { requireAuth, json } from "../../../_lib/auth.js";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const rows = (await context.env.DB.prepare(
    `SELECT id, proposal_id, project_id, filename, content_type, size_bytes, created_at
       FROM proposal_attachments WHERE proposal_id=?1 ORDER BY created_at`
  ).bind(id).all()).results || [];
  return json({ attachments: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const proposal = await context.env.DB.prepare(`SELECT id, project_id FROM proposals WHERE id=?1`).bind(id).first();
  if (!proposal) return json({ error: "Proposal not found" }, 404);

  const form = await context.request.formData().catch(() => null);
  const file = form && form.get("file");
  if (!file || typeof file === "string") return json({ error: "No file uploaded" }, 400);

  const name = (file.name || "drawing.pdf").replace(/[^\w.\- ]+/g, "_").slice(0, 180);
  const type = file.type || "application/octet-stream";
  if (!/pdf/i.test(type) && !/\.pdf$/i.test(name)) return json({ error: "Only PDF files are allowed" }, 400);

  const buf = await file.arrayBuffer();
  if (buf.byteLength === 0) return json({ error: "Empty file" }, 400);
  if (buf.byteLength > MAX_BYTES) return json({ error: "File too large (max 20 MB)" }, 400);

  const key = `proposals/${id}/${crypto.randomUUID()}.pdf`;
  await context.env.FILES.put(key, buf, { httpMetadata: { contentType: "application/pdf" } });
  const row = await context.env.DB.prepare(
    `INSERT INTO proposal_attachments (proposal_id, project_id, filename, r2_key, content_type, size_bytes, uploaded_by)
     VALUES (?1,?2,?3,?4,?5,?6,?7) RETURNING id, filename, size_bytes, created_at`
  ).bind(id, proposal.project_id, name, key, "application/pdf", buf.byteLength, auth.email).first();
  return json({ attachment: row });
}
