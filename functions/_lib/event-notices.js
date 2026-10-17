// The day-before and morning-of notices for every scheduled visit: when each is
// due, and the one-row-per-send guard that keeps the 3-minute cron from sending
// any of them twice (crm/migrations/0074_event_notices.sql).
//
// A notice is keyed on the start time it was for, so a rescheduled visit gets
// fresh reminders without anything being cleared.
import { centralNow, addDays } from "./dates.js";

// Central wall-clock hours. The day-before notice goes from 9am until 8pm the
// previous day (no mail late in the evening; a visit booked after 8pm for the
// next day gets the morning-of only). The morning-of notice goes from 7am on
// the day, while the visit is still ahead.
export const EVE_FROM_HOUR = 9;
export const EVE_UNTIL_HOUR = 20;
export const MORNING_FROM_HOUR = 7;

// A customer reminder is skipped when the booking is younger than this: the
// confirmation has just gone out, and a reminder minutes later says nothing new.
// The crew brief is never skipped.
export const FRESH_BOOKING_HOURS = 6;

// Appointment types that are a visit to a customer. All four are on the CRM's
// quick-add; consultations and measures are the ones booked today.
export const CUSTOMER_VISIT_TYPES = ["consultation", "measure", "install", "service"];
export const CLOSED_STATUSES = ["canceled", "cancelled", "no_show", "no-show", "completed", "done"];

// Which notices are due at this Central moment. Each window says which day's
// visits it covers and, for the morning one, the time a visit must still be
// after. `now` is centralNow() unless a test passes its own clock.
//   [{ when: "eve", date: "2026-10-18" }, { when: "morning", date: "2026-10-17", after: "2026-10-17T07:03:00" }]
export function dueWindows(now = centralNow()) {
  const out = [];
  if (now.hour >= EVE_FROM_HOUR && now.hour < EVE_UNTIL_HOUR) {
    out.push({ when: "eve", date: addDays(now.date, 1), after: null });
  }
  if (now.hour >= MORNING_FROM_HOUR) {
    out.push({ when: "morning", date: now.date, after: now.iso });
  }
  return out;
}

// SQL fragment: no notice of this kind yet for this entity at this start time.
// ?N placeholders are the caller's: entity type, notice name.
export function notYetSent(alias, startCol, typeParam, noticeParam) {
  return `NOT EXISTS (SELECT 1 FROM event_notices n
                       WHERE n.entity_type = ${typeParam} AND n.entity_id = ${alias}.id
                         AND n.notice = ${noticeParam} AND n.event_at = ${alias}.${startCol})`;
}

// Stamp first: true only for the call whose insert took, so two overlapping
// ticks (or a send that hangs) can never both send.
export async function claimNotice(db, entityType, entityId, notice, eventAt) {
  const r = await db.prepare(
    `INSERT OR IGNORE INTO event_notices (entity_type, entity_id, notice, event_at) VALUES (?1, ?2, ?3, ?4)`
  ).bind(entityType, entityId, notice, eventAt).run();
  return (r?.meta?.changes || 0) === 1;
}

export async function settleNotice(db, entityType, entityId, notice, eventAt, outcome) {
  await db.prepare(
    `UPDATE event_notices SET outcome = ?5
      WHERE entity_type = ?1 AND entity_id = ?2 AND notice = ?3 AND event_at = ?4`
  ).bind(entityType, entityId, notice, eventAt, outcome).run().catch(() => {});
}
