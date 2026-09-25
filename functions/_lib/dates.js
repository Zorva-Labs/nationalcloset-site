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

// Today (server) as YYYY-MM-DD in Central Time.
//
// An IANA zone rather than a fixed offset. Central is UTC-6 in winter and UTC-5
// in daylight time, so the old flat -6 reported YESTERDAY for the first hour of
// every daylight-saving day. That hour is no longer cosmetic: the milestone
// invoices ask this function whether an install date has arrived, and the answer
// decides whether a customer is billed 25% or their whole remaining balance.
export function todayCentral() {
  // en-CA renders ISO order (YYYY-MM-DD), which is what every caller compares.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
}

// The Central wall clock at a UTC instant (milliseconds), through the same IANA
// zone: { date: "YYYY-MM-DD", hour, iso: "YYYY-MM-DDTHH:MM:SS" } — the iso in the
// same naive Central form as every datetime in the DB, so SQL can compare the two.
export function centralAt(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(ms)).filter((x) => x.type !== "literal").map((x) => [x.type, x.value])
  );
  // hourCycle h23 still renders midnight as "24" in some ICU builds.
  const hour = parseInt(p.hour, 10) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour,
    iso: `${p.year}-${p.month}-${p.day}T${pad2(hour)}:${p.minute}:${p.second}`,
  };
}

// The Central wall clock now. Every sweep that runs "in the morning" or "on the
// day" reads this, never a flat -5: Central is UTC-6 from November to March.
export function centralNow() {
  return centralAt(Date.now());
}

// The UTC instant (milliseconds) at which a Central calendar day begins: 05:00Z
// in daylight time, 06:00Z in standard time. The clocks change at 2am, so the
// offset at 06:00Z (midnight or 1am Central) is the one in force at midnight,
// the two changeover days included.
export function centralMidnightUtc(dateStr) {
  const t = Date.parse(dateStr + "T00:00:00Z");
  const probe = t + 6 * 3_600_000;
  const offsetHours = Math.round((probe - Date.parse(centralAt(probe).iso + "Z")) / 3_600_000);
  return t + offsetHours * 3_600_000;
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
