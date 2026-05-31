// /api/availability — read & replace weekly availability rules + blocks
import { requireAuth, json } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const { DB } = context.env;
  const rules = (await DB.prepare(`SELECT * FROM availability_rules ORDER BY day_of_week, start_minute`).all()).results || [];
  const blocks = (await DB.prepare(`SELECT * FROM availability_blocks ORDER BY start_at`).all()).results || [];
  return json({ rules, blocks });
}

export async function onRequestPut(context) {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const { DB } = context.env;
  const body = await context.request.json().catch(() => ({}));
  const rules = Array.isArray(body.rules) ? body.rules : null;
  const blocks = Array.isArray(body.blocks) ? body.blocks : null;

  if (rules) {
    await DB.prepare(`DELETE FROM availability_rules`).run();
    for (const r of rules) {
      const dow = parseInt(r.day_of_week, 10);
      const s = parseInt(r.start_minute, 10);
      const e = parseInt(r.end_minute, 10);
      if (Number.isNaN(dow) || Number.isNaN(s) || Number.isNaN(e)) continue;
      await DB.prepare(
        `INSERT INTO availability_rules (day_of_week, start_minute, end_minute, active) VALUES (?1,?2,?3,?4)`
      ).bind(dow, s, e, r.active === false ? 0 : 1).run();
    }
  }
  if (blocks) {
    await DB.prepare(`DELETE FROM availability_blocks`).run();
    for (const b of blocks) {
      if (!b.start_at || !b.end_at) continue;
      await DB.prepare(
        `INSERT INTO availability_blocks (start_at, end_at, reason) VALUES (?1,?2,?3)`
      ).bind(b.start_at, b.end_at, b.reason || null).run();
    }
  }
  return json({ ok: true });
}
