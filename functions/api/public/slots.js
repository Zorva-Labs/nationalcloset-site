// /api/public/slots?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns available 60-min booking slots in the given window (Central time floating).
// No auth — this is the customer-facing slot grid for /book/.
import { json } from "../../_lib/auth.js";
import { minutesOfDay, isoDateOf, buildIso, dowOf, addDays } from "../../_lib/dates.js";

const SLOT_MIN = 60;        // 60-minute consultation slots
const BUFFER_MIN = 0;       // back-to-back ok for now
const LEAD_TIME_HOURS = 24; // can't book within 24h

export async function onRequestGet(context) {
  const { DB } = context.env;
  const url = new URL(context.request.url);
  const from = url.searchParams.get("from") || todayCentralStr();
  const to = url.searchParams.get("to") || addDays(from, 13); // 2-week window

  // Validate the window isn't crazy large
  const days = (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000;
  if (days < 0 || days > 60) return json({ error: "Invalid date range" }, 400);

  const rules = (await DB.prepare(`SELECT * FROM availability_rules WHERE active = 1`).all()).results || [];
  const rulesByDow = {};
  for (const r of rules) (rulesByDow[r.day_of_week] ||= []).push(r);

  const blocks = (await DB
    .prepare(`SELECT * FROM availability_blocks WHERE start_at <= ?1 AND end_at >= ?2`)
    .bind(to + "T23:59:59", from + "T00:00:00")
    .all()).results || [];

  const taken = (await DB
    .prepare(`SELECT start_at, end_at FROM appointments
              WHERE status IN ('pending','confirmed') AND start_at >= ?1 AND start_at < ?2`)
    .bind(from + "T00:00:00", to + "T23:59:59")
    .all()).results || [];

  const now = Date.now();
  const minBookable = now + LEAD_TIME_HOURS * 3600 * 1000;
  const slotsByDate = {};

  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = dowOf(d);
    const dayRules = rulesByDow[dow] || [];
    for (const r of dayRules) {
      for (let m = r.start_minute; m + SLOT_MIN <= r.end_minute; m += SLOT_MIN + BUFFER_MIN) {
        const startIso = buildIso(d, m);
        const endIso = buildIso(d, m + SLOT_MIN);

        // Skip past + lead-time
        const slotTime = Date.parse(startIso + "Z") - (6 * 60 * 60 * 1000); // approx Central
        if (slotTime < minBookable) continue;

        // Skip if intersects a block
        if (blocks.some((b) => startIso < b.end_at && endIso > b.start_at)) continue;

        // Skip if intersects an existing appointment
        if (taken.some((a) => startIso < a.end_at && endIso > a.start_at)) continue;

        (slotsByDate[d] ||= []).push({ start: startIso, end: endIso, minute: m });
      }
    }
  }
  return json({ from, to, slots: slotsByDate });
}

function todayCentralStr() {
  const d = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}
