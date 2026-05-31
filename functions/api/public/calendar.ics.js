// GET /api/public/calendar.ics?key=...
// Subscribable iCal feed of all upcoming appointments. The "key" prevents
// random scraping; admin sets STAFF_CAL_KEY env var, embeds in subscription URL.
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key") || "";
  const expected = context.env.STAFF_CAL_KEY || "";
  if (!expected || key !== expected) {
    return new Response("Forbidden", { status: 403 });
  }
  const today = new Date(); today.setUTCDate(today.getUTCDate() - 30);
  const cutoff = today.toISOString().slice(0, 10);
  const rows = (await context.env.DB
    .prepare(`SELECT * FROM appointments WHERE start_at >= ?1 AND status != 'cancelled' ORDER BY start_at`)
    .bind(cutoff + "T00:00:00")
    .all()).results || [];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//National Closet Company//Staff Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:National Closet Company — Appointments",
    "X-WR-TIMEZONE:America/Chicago",
  ];
  for (const a of rows) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:appt-${a.id}@nationalclosetco.com`);
    lines.push(`DTSTAMP:${nowStamp()}`);
    lines.push(`DTSTART:${fmt(a.start_at)}`);
    lines.push(`DTEND:${fmt(a.end_at)}`);
    lines.push(`SUMMARY:${esc(a.type === "consultation" ? "Consult — " + (a.name || "") : (a.type + " — " + (a.name || "")))}`);
    lines.push(`LOCATION:${esc(a.site_address || "")}`);
    const descLines = [
      a.phone ? `Phone: ${a.phone}` : null,
      a.email ? `Email: ${a.email}` : null,
      a.rooms ? `Rooms: ${a.rooms}` : null,
      a.notes ? `Notes: ${a.notes}` : null,
      `Status: ${a.status}`,
    ].filter(Boolean).join("\\n");
    lines.push(`DESCRIPTION:${esc(descLines)}`);
    lines.push(`STATUS:${a.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache, max-age=60",
    },
  });
}
function fmt(iso) { return iso.replace(/[-:]/g, "").slice(0, 15); }
function nowStamp() { return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; }
function esc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
