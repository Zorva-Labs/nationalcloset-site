// GET  /api/calendar-feed-url            — the subscribe links for the logged-in person:
//        { url, mine }  url  = the whole company's feed (admins only, else null)
//                       mine = { member_id, name, url } — their own consults, when
//                              their login's email is on the team roster
// GET  /api/calendar-feed-url?member=ID  — admin: that team member's link (made on first ask)
// POST /api/calendar-feed-url {member, rotate:true}
//                                         — a new link for a member (admin, or the
//                                           member for their own); the old one stops
//
// A sales rep's link carries only the consults they are assigned to (Michael,
// 2026-11-27); they never get the company's feed, which has every appointment.
// Auth-gated so no token ships in the HTML.

import { requireAuth, json } from "../_lib/auth.js";
import { recordActivity } from "../_lib/db.js";
import { ensureCalendarToken, rotateCalendarToken, feedUrl } from "../_lib/rep-calendar.js";

const companyUrl = (env) => (env.CALENDAR_FEED_TOKEN ? feedUrl(env.CALENDAR_FEED_TOKEN) : null);
const shape = (m) => m && { member_id: m.id, name: m.name, active: !!m.active, url: m.url };

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const { DB } = context.env;
  const isAdmin = auth.role === "admin";
  const memberParam = parseInt(new URL(context.request.url).searchParams.get("member") || "", 10);

  if (Number.isFinite(memberParam)) {
    if (!isAdmin && memberParam !== auth.teamMemberId) return json({ error: "Only an admin can see someone else's calendar link" }, 403);
    const m = await ensureCalendarToken(DB, memberParam);
    if (!m) return json({ error: "No such team member" }, 404);
    return json({ member: shape(m) });
  }

  const mine = auth.teamMemberId ? shape(await ensureCalendarToken(DB, auth.teamMemberId)) : null;
  const url = isAdmin ? companyUrl(context.env) : null;
  if (!url && !mine) {
    return json({ error: "Your login isn't on the team roster, so there are no consults to send. Ask an admin to add you on Team with the same email." }, 404);
  }
  return json({ url, mine });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  const memberId = parseInt(body.member, 10);
  if (!Number.isFinite(memberId) || !body.rotate) return json({ error: "member and rotate are required" }, 400);
  if (auth.role !== "admin" && memberId !== auth.teamMemberId) return json({ error: "Only an admin can change someone else's calendar link" }, 403);
  const m = await rotateCalendarToken(context.env.DB, memberId);
  if (!m) return json({ error: "No such team member" }, 404);
  await recordActivity(context.env.DB, {
    entityType: "team_member", entityId: memberId, action: "calendar_link_replaced",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { name: m.name },
  }).catch(() => {});
  return json({ member: shape(m) });
}
