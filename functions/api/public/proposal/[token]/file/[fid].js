// GET /api/public/proposal/[token]/file/[fid]
//   Token-gated download of a proposal's job-drawing PDF for the customer.
//   The attachment must belong to the proposal that owns the view token.
export async function onRequestGet(context) {
  const { token, fid } = context.params;
  const row = await context.env.DB.prepare(
    `SELECT a.* FROM proposal_attachments a JOIN proposals p ON p.id = a.proposal_id
      WHERE p.view_token = ?1 AND a.id = ?2`
  ).bind(token, parseInt(fid, 10)).first();
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
