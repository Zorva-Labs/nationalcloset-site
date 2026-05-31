// GET /api/email-messages/[id] — single message + its parent if any
import { requireAuth, json } from "../../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const row = await context.env.DB.prepare(`SELECT * FROM email_messages WHERE id=?1`).bind(id).first();
  if (!row) return json({ error: "Not found" }, 404);
  return json({ message: row });
}
