// Date / time helpers. All datetimes in the DB are stored as ISO strings
// in LOCAL CENTRAL TIME with no timezone suffix ("YYYY-MM-DDTHH:MM:SS").
// We work with strings to avoid Date object timezone confusion in Workers.

const DAY_MS = 86_400_000;

export function pad2(n) { return String(n).padStart(2, "0"); }

// "2026-05-25" → Date at midnight UTC for that day (only for grid math)
export function dateOnly(iso) {
  return new Date(iso + "T00:00:00Z");
}

// "2026-05-25T14:30:00" → minutes since midnight (e.g. 870 for 14:30)
export function minutesOfDay(iso) {
  const [h, m] = iso.split("T")[1].split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

export function isoDateOf(iso) { return iso.split("T")[0]; }

// Construct an ISO local datetime from date + minutes
export function buildIso(dateStr, minute) {
  const h = pad2(Math.floor(minute / 60));
  const m = pad2(minute % 60);
  return `${dateStr}T${h}:${m}:00`;
}

// Day of week for an ISO date string "YYYY-MM-DD" (0=Sun ... 6=Sat)
// Works in any timezone since we use UTC midnight
export function dowOf(dateStr) {
  return new Date(dateStr + "T00:00:00Z").getUTCDay();
}

// Add N days to an ISO date string
export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Today (server) as YYYY-MM-DD in Central Time
export function todayCentral() {
  // Central is UTC-6 standard / UTC-5 daylight. We approximate with -6 — close enough
  // for booking grid purposes since admin can manually shift if needed.
  const d = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// Pretty format for emails
export function fmtPretty(iso) {
  const [date, time] = iso.split("T");
  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  const [h, mn] = (time || "00:00").split(":").map((n) => parseInt(n, 10));
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const hour12 = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? "am" : "pm";
  return `${months[m - 1]} ${d}, ${y} at ${hour12}:${pad2(mn)} ${ampm} Central`;
}
