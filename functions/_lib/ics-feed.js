// Multi-event iCalendar feed builder — used by the public /api/public/calendar/[token].ics
// endpoint that iPhone / Apple Calendar / Google Calendar subscribe to.
//
// All event times are in America/Chicago (Central). We include a VTIMEZONE
// block so the phone shows the correct local time even when the user is
// traveling outside Central — without VTIMEZONE the "floating time" semantics
// in RFC 5545 would re-anchor to whatever timezone the device is in (wrong).

// VTIMEZONE for America/Chicago covering 1970-onwards DST rules.
// Pulled from the IANA tzdata; matches what macOS Calendar emits.
const VTIMEZONE_CHICAGO = `BEGIN:VTIMEZONE
TZID:America/Chicago
BEGIN:DAYLIGHT
TZOFFSETFROM:-0600
TZOFFSETTO:-0500
TZNAME:CDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0500
TZOFFSETTO:-0600
TZNAME:CST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

function fold(line) {
  // RFC 5545 line-folding: a line over 75 octets continues on the next line
  // after CRLF + space. Counted in UTF-8 bytes (an em dash is 3) and never
  // splitting a character; a line already folded is left alone, because the
  // feed folds once more on the way out.
  if (line.includes("\r\n")) return line;
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) { parts.push(cur); cur = ""; bytes = 0; limit = 74; }
    cur += ch; bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}
function fmtLocal(iso) {
  // "2026-05-25T14:30:00" → "20260525T143000"  (used with TZID)
  if (!iso) return "";
  return iso.replace(/[-:]/g, "").slice(0, 15);
}
function fmtUtc(iso) {
  // For DTSTAMP — always UTC
  return new Date(iso || Date.now()).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}
function fmtDate(iso) {
  // "2026-07-21" (or an ISO datetime) → "20260721" for a VALUE=DATE all-day event
  return (iso || "").slice(0, 10).replace(/-/g, "");
}
function nextDay(iso) {
  // All-day DTEND is exclusive — the calendar day after the start.
  const d = new Date((iso || "").slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function seqFrom(updatedAt) {
  // A monotonic integer that increases each time the row is edited. Whole
  // minutes since the epoch keeps it well inside a 32-bit int for decades.
  const t = updatedAt ? Date.parse(updatedAt) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 60000) : 0;
}
function esc(s) {
  if (s == null) return "";
  return String(s).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

// Pretty-print appointment type for the SUMMARY field
const TYPE_LABEL = {
  consultation: "Consultation",
  measure:      "Measure",
  install:      "Install",
  service:      "Service call",
  repair:       "Repair",
  follow_up:    "Follow Up",
  phone_call:   "Phone Call",
  meeting:      "Meeting",
  vacation:     "Vacation",
  unavailable:  "Unavailable",
};

// opts.name / opts.desc: the calendar's title and description on the phone
// (a team member's own feed names them; the default is the whole company's).
export function buildAppointmentFeed(appointments, opts = {}) {
  const dtstamp = fmtUtc();
  const out = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//National Closet Company//CRM Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.name || "National Closet Company — Appointments")}`,
    `X-WR-CALDESC:${esc(opts.desc || "Live feed of consultations, measures, installs, and service calls")}`,
    "X-WR-TIMEZONE:America/Chicago",
    // Refresh hints (Apple-specific properties — iPhone reads these)
    "X-APPLE-CALENDAR-COLOR:#D2683F",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    // VTIMEZONE_CHICAGO is multi-line; splat so each line is folded individually
    ...VTIMEZONE_CHICAGO.split("\n"),
  ];

  for (const a of appointments) {
    // Timed events need both ends; all-day events (installs) only need a date.
    if (!a.start_at || (!a.all_day && !a.end_at)) continue;
    if (a.status === "cancelled" || a.status === "no-show") continue; // could keep w/ STATUS:CANCELLED — for now omit

    const typeLabel = TYPE_LABEL[a.type] || a.type || "Appointment";
    // A vacation titled "Vacation" reads as just that, not "Vacation — Vacation".
    const summary = !a.name || a.name === typeLabel ? typeLabel : `${typeLabel} — ${a.name}`;
    // Each value escaped (a newline or comma in the notes would otherwise
    // break the line), then joined with the escaped newline.
    const descLines = [
      a.phone ? `Phone: ${esc(a.phone)}` : "",
      a.email ? `Email: ${esc(a.email)}` : "",
      a.site_address ? `Address: ${esc(a.site_address)}` : "",
      a.rooms ? `Rooms: ${esc(a.rooms)}` : "",
      a.notes ? `Notes: ${esc(a.notes)}` : "",
      a.lead_id    ? `Lead: https://nationalclosetco.com/crm/lead.html?id=${a.lead_id}` : "",
      a.project_id ? `Job: https://nationalclosetco.com/crm/project.html?id=${a.project_id}` : "",
    ].filter(Boolean).join("\\n");

    // Stable UID — same appointment edited in CRM updates on phone via UID match.
    // Installs are keyed on the project so their UID is stable across edits too.
    const uid = String(a.id).startsWith("install-") ? `install-${a.project_id}@nationalclosetco.com` : `appt-${a.id}@nationalclosetco.com`;

    out.push("BEGIN:VEVENT");
    out.push(`UID:${uid}`);
    out.push(`DTSTAMP:${dtstamp}`);
    // SEQUENCE bumps whenever the row changes, so a moved/edited event actually
    // overwrites the cached copy on the phone instead of being ignored.
    out.push(`SEQUENCE:${seqFrom(a.updated_at)}`);
    if (a.all_day) {
      // Date-only all-day event. DTEND is exclusive (the next day) per RFC 5545.
      const day = fmtDate(a.start_at);
      out.push(`DTSTART;VALUE=DATE:${day}`);
      // A job's install is one day; an all-day appointment (a vacation) runs
      // through its end_at's date.
      out.push(`DTEND;VALUE=DATE:${nextDay(a.end_at || a.start_at)}`);
    } else {
      out.push(`DTSTART;TZID=America/Chicago:${fmtLocal(a.start_at)}`);
      out.push(`DTEND;TZID=America/Chicago:${fmtLocal(a.end_at)}`);
    }
    out.push(fold(`SUMMARY:${esc(summary)}`));
    if (descLines) out.push(fold(`DESCRIPTION:${descLines}`)); // already escaped
    if (a.site_address) out.push(fold(`LOCATION:${esc(a.site_address)}`));
    out.push("STATUS:CONFIRMED");
    // iPhone uses CATEGORIES to color-code; group by type
    out.push(`CATEGORIES:${typeLabel}`);
    if (a.lead_id) out.push(`URL:https://nationalclosetco.com/crm/lead.html?id=${a.lead_id}`);
    else if (a.project_id) out.push(`URL:https://nationalclosetco.com/crm/project.html?id=${a.project_id}`);
    out.push("END:VEVENT");
  }

  out.push("END:VCALENDAR");
  return out.map(fold).join("\r\n");
}
