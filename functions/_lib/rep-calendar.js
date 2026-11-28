// A team member's own calendar feed (Michael, 2026-11-27): each sales rep
// subscribes to a link that carries only the consultations they are assigned
// to, with the client's details for each one, and nothing else in the CRM.
//
// The token is `team_members.calendar_token` (migration 0096), made the first
// time someone asks for the link and replaced by `rotateCalendarToken` if it
// leaks. The link stops working the day the person is deactivated.
// The whole-company feed (env.CALENDAR_FEED_TOKEN) is separate and admin-only.
import { genToken } from "./tokens.js";
import { buildAppointmentFeed } from "./ics-feed.js";

const ORIGIN = "https://nationalclosetco.com";
// A consult, plus the old "measure" visits that were consults by another name.
export const CONSULT_TYPES = ["consultation", "measure"];

export const feedUrl = (token) => `${ORIGIN}/api/public/calendar/${token}.ics`;

// The member's link, making their token on first ask.
export async function ensureCalendarToken(db, memberId) {
  const m = await db.prepare(`SELECT id, name, active, calendar_token FROM team_members WHERE id=?1`).bind(memberId).first();
  if (!m) return null;
  if (m.calendar_token) return { ...m, url: feedUrl(m.calendar_token) };
  return rotateCalendarToken(db, memberId, m);
}

// A new token: the old link stops working at once.
export async function rotateCalendarToken(db, memberId, row = null) {
  const m = row || await db.prepare(`SELECT id, name, active FROM team_members WHERE id=?1`).bind(memberId).first();
  if (!m) return null;
  const token = genToken(24);
  await db.prepare(`UPDATE team_members SET calendar_token=?1 WHERE id=?2`).bind(token, memberId).run();
  return { ...m, calendar_token: token, url: feedUrl(token) };
}

// The active team member a feed token belongs to, or null.
export async function memberForToken(db, token) {
  if (!token || token.length < 20) return null;
  return db.prepare(`SELECT id, name FROM team_members WHERE calendar_token=?1 AND active=1`)
    .bind(token).first().catch(() => null);
}

// The .ics for one person: the consults they're on, a year back to five ahead,
// each with the client's name, phone, email, address, rooms and notes, and
// what they asked for on the lead.
export async function buildMemberFeed(db, member) {
  const now = Date.now();
  const from = new Date(now - 365 * 86400e3).toISOString();
  const to = new Date(now + 5 * 365 * 86400e3).toISOString();
  const types = CONSULT_TYPES.map((_, i) => `?${i + 4}`).join(",");
  const { results } = await db.prepare(
    `SELECT a.id, a.contact_id, a.project_id, a.lead_id, a.type, a.start_at, a.end_at, a.all_day,
            a.duration_min, a.status, a.name, a.email, a.phone, a.rooms, a.notes, a.updated_at,
            COALESCE(NULLIF(a.site_address, ''),
                     NULLIF(TRIM(COALESCE(c.address_street, '') || ', ' || COALESCE(c.address_city, '') || ' ' || COALESCE(c.address_zip, ''), ', '), '')
            ) AS site_address,
            l.interest AS lead_interest, l.location AS lead_location, l.message AS lead_message
       FROM assignments s
       JOIN appointments a ON a.id = s.entity_id
       LEFT JOIN contacts c ON c.id = a.contact_id
       LEFT JOIN leads l ON l.id = a.lead_id
      WHERE s.entity_type = 'appointment' AND s.team_member_id = ?1
        AND a.start_at >= ?2 AND a.start_at <= ?3
        AND a.type IN (${types})
      ORDER BY a.start_at`
  ).bind(member.id, from, to, ...CONSULT_TYPES).all();

  const events = (results || []).map((a) => {
    const extra = [
      a.lead_interest ? `Interested in: ${a.lead_interest}` : "",
      a.lead_location && !a.site_address ? `Area: ${a.lead_location}` : "",
      a.lead_message && a.lead_message !== a.notes ? `They wrote: ${a.lead_message}` : "",
    ].filter(Boolean).join("\n");
    return { ...a, notes: [a.notes, extra].filter(Boolean).join("\n") || null };
  });

  const first = String(member.name || "").split(/\s+/)[0] || "My";
  return buildAppointmentFeed(events, {
    name: `National Closet Company — ${first}'s consults`,
    desc: `The consultations ${member.name} is assigned to, with each client's details`,
  });
}
