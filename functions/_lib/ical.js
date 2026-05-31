// Minimal RFC 5545 iCalendar generator — single VEVENT.
// We treat datetimes as floating local time (no TZID) for booking simplicity;
// Apple Calendar / Google Calendar render correctly when the client is in
// Central Time. For multi-timezone correctness we'd add VTIMEZONE blocks.

function fold(line) {
  // RFC 5545: lines >75 octets should be folded with CRLF + space
  if (line.length <= 75) return line;
  const parts = [];
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73));
  return parts.join("\r\n ");
}

function fmt(iso) {
  // "2026-05-25T14:30:00" → "20260525T143000"
  return iso.replace(/[-:]/g, "").slice(0, 15);
}

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildIcs({ uid, start, end, summary, description, location, organizer, organizerName, url }) {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//National Closet Company//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(summary)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
    location ? `LOCATION:${esc(location)}` : null,
    organizer ? `ORGANIZER;CN=${esc(organizerName || "National Closet Company")}:mailto:${organizer}` : null,
    url ? `URL:${esc(url)}` : null,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).map(fold);
  return lines.join("\r\n");
}
