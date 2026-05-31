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
  // RFC 5545 line-folding: lines >75 octets get a CRLF + space inserted
  if (line.length <= 75) return line;
  const parts = [];
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73));
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
function esc(s) {
  if (s == null) return "";
  return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

// Pretty-print appointment type for the SUMMARY field
const TYPE_LABEL = {
  consultation: "Consultation",
  measure:      "Measure",
  install:      "Install",
  service:      "Service call",
};

export function buildAppointmentFeed(appointments) {
  const dtstamp = fmtUtc();
  const out = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//National Closet Company//CRM Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:National Closet Company — Appointments",
    "X-WR-CALDESC:Live feed of consultations, measures, installs, and service calls",
    "X-WR-TIMEZONE:America/Chicago",
    // Refresh hints (Apple-specific properties — iPhone reads these)
    "X-APPLE-CALENDAR-COLOR:#D2683F",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    // VTIMEZONE_CHICAGO is multi-line; splat so each line is folded individually
    ...VTIMEZONE_CHICAGO.split("\n"),
  ];

  for (const a of appointments) {
    if (!a.start_at || !a.end_at) continue;
    if (a.status === "cancelled" || a.status === "no-show") continue; // could keep w/ STATUS:CANCELLED — for now omit

    const typeLabel = TYPE_LABEL[a.type] || a.type || "Appointment";
    const summary = `${typeLabel} — ${a.name || "(no name)"}`;
    const descLines = [
      a.phone ? `Phone: ${a.phone}` : "",
      a.email ? `Email: ${a.email}` : "",
      a.rooms ? `Rooms: ${a.rooms}` : "",
      a.notes ? `Notes: ${a.notes}` : "",
      a.lead_id    ? `Lead: https://nationalclosetco.com/crm/lead.html?id=${a.lead_id}` : "",
      a.project_id ? `Job: https://nationalclosetco.com/crm/project.html?id=${a.project_id}` : "",
    ].filter(Boolean).join("\\n");

    // Stable UID — same appointment edited in CRM updates on phone via UID match
    const uid = `appt-${a.id}@nationalclosetco.com`;

    out.push("BEGIN:VEVENT");
    out.push(`UID:${uid}`);
    out.push(`DTSTAMP:${dtstamp}`);
    out.push(`DTSTART;TZID=America/Chicago:${fmtLocal(a.start_at)}`);
    out.push(`DTEND;TZID=America/Chicago:${fmtLocal(a.end_at)}`);
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
