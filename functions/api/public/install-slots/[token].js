// GET /api/public/install-slots/[token]
//
// Returns the install-day slots a customer can pick after signing their
// contract. Different rules than the general consultation booking grid:
//
//   • Only 10am or 4pm Central — installs are full half-day blocks
//   • Max 2 installs per day (one morning + one afternoon)
//   • Custom-order contracts respect a 4-week lead time from sign-date
//     (manufacturer build time). Install-only and repair contracts have
//     no lead time — install happens as soon as the customer-supplied
//     product arrives.
//
// Output: { earliest, slots: { "YYYY-MM-DD": [{start, label}], ... } }
// 4-week window from earliest.

import { json } from "../../../_lib/auth.js";
import { addDays, todayCentral, fmtPretty } from "../../../_lib/dates.js";

const INSTALL_TIMES = [
  { hour: 10, minute: 0, label: "10:00 AM" },
  { hour: 16, minute: 0, label: "4:00 PM"  },
];
const INSTALL_DURATION_MIN = 240;     // 4-hour default block
const MAX_INSTALLS_PER_DAY = 2;
const WINDOW_DAYS = 28;               // show 4 weeks of options past the earliest

// Contract types that have manufacturer lead time before we can install
const NEEDS_LEAD_TIME = new Set(["custom_order"]);
const LEAD_TIME_DAYS = 28;

export async function onRequestGet(context) {
  const token = context.params.token;
  const { DB } = context.env;

  const contract = await DB.prepare(
    `SELECT id, project_id, contract_type, status, signed_by_customer_at, sent_at, created_at
       FROM contracts WHERE view_token = ?1`
  ).bind(token).first();
  if (!contract) return json({ error: "Not found" }, 404);
  if (contract.status !== "fully_executed") {
    return json({ error: "Contract must be signed before scheduling install." }, 400);
  }

  // Pick the earliest allowed date:
  //  - Custom orders: 4 weeks from the customer's signature date
  //  - Install-only / repair: tomorrow (no manufacturer wait)
  // Fall back to tomorrow if signed_by_customer_at isn't recorded.
  const signedDate = (contract.signed_by_customer_at || "").slice(0, 10);
  const needsLead = NEEDS_LEAD_TIME.has(contract.contract_type);
  let earliest;
  if (needsLead && signedDate) {
    earliest = addDays(signedDate, LEAD_TIME_DAYS);
  } else {
    earliest = addDays(todayCentral(), 1);
  }
  // Never earlier than tomorrow (handles weird clock skew or backdated signs)
  const tomorrow = addDays(todayCentral(), 1);
  if (earliest < tomorrow) earliest = tomorrow;

  const windowEnd = addDays(earliest, WINDOW_DAYS);

  // Pull every install already on the books in [earliest, windowEnd]
  const taken = (await DB.prepare(
    `SELECT start_at, type FROM appointments
      WHERE type = 'install'
        AND status IN ('pending','confirmed')
        AND start_at >= ?1 AND start_at < ?2`
  ).bind(earliest + "T00:00:00", windowEnd + "T23:59:59").all()).results || [];

  // Index by date → array of HH:MM strings, plus a day count
  const countByDate = {};
  const slotsTakenByDate = {};
  for (const t of taken) {
    const date = (t.start_at || "").slice(0, 10);
    const time = (t.start_at || "").slice(11, 16); // "HH:MM"
    countByDate[date] = (countByDate[date] || 0) + 1;
    (slotsTakenByDate[date] ||= new Set()).add(time);
  }

  // Build the available-slot map. Skip Sundays (we don't install on Sundays
  // by default — admin can hand-schedule edge cases). Allow Mon-Sat.
  const slots = {};
  for (let d = earliest; d <= windowEnd; d = addDays(d, 1)) {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (dow === 0) continue; // Sunday
    if ((countByDate[d] || 0) >= MAX_INSTALLS_PER_DAY) continue;

    const daySlots = [];
    for (const t of INSTALL_TIMES) {
      const hhmm = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
      if (slotsTakenByDate[d]?.has(hhmm)) continue;
      daySlots.push({
        start: `${d}T${hhmm}:00`,
        label: t.label,
      });
    }
    if (daySlots.length) slots[d] = daySlots;
  }

  return json({
    earliest,
    needs_lead_time: needsLead,
    lead_time_days: needsLead ? LEAD_TIME_DAYS : 0,
    duration_min: INSTALL_DURATION_MIN,
    slots,
  });
}
