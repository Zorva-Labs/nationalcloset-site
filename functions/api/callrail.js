// POST /api/callrail — CallRail's post-call and call-modified webhooks for the
// National Closet Company numbers (Terry's phone menu, 2026-11-04; docs/crm.md).
// Both carry the call object, so both land here.
//
// 1. Store first: the call is upserted into `calls` by its CallRail id. CallRail
//    never resends a failed webhook, so a 500 is only for a write that failed.
// 2. Tie it to who called: a known number links to its lead and client; a
//    press-1 caller with no lead gets one, in the New column.
// 3. Tell the office, once: a voicemail, or a caller who chose an option and
//    got no one, goes to STAFF_EMAIL. An answered call has already been handled.
//
// Nothing goes to the caller: no acknowledgment, and no text (the owner
// declined SMS from this CRM). Signed: an unsigned post is refused.
import { json } from "../_lib/auth.js";
import { sendStaffAlert } from "../_lib/email.js";
import { signatureOk } from "../_lib/callrail-sign.js";
import { CHOICE_LABEL, callerNameOf, findCaller, leadFromCall, menuChoiceOf, prettyPhone, realName, tagNames } from "../_lib/calls.js";

const str = (v, n = 500) => (v == null ? "" : String(v)).trim().slice(0, n);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function whenCentral(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d)) return "";
  return d.toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function alertFor(row, base) {
  const who = callerNameOf(row);
  const phone = prettyPhone(row.caller_number);
  const what = row.voicemail ? "Voicemail" : "Missed call";
  const choice = row.menu_choice ? CHOICE_LABEL[row.menu_choice] : "No selection";
  const leadUrl = row.lead_id > 0 ? `${base}/crm/lead.html?id=${row.lead_id}` : `${base}/crm/calls.html`;
  const lines = [
    `${what} from ${who}`,
    `Phone: ${phone}`,
    `Menu: ${choice}`,
    `When: ${whenCentral(row.started_at)} Central`,
    row.recording_url ? `Listen: ${row.recording_url}` : "",
    `In the CRM: ${leadUrl}`,
  ].filter(Boolean);
  const cell = 'style="padding:6px 12px 6px 0;color:#6C665B;vertical-align:top"';
  const link = 'style="color:#B4502A;font-weight:700"';
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1F1D1A">
<p style="margin:0 0 12px;font-weight:700">${esc(what)} from ${esc(who)}</p>
<table style="border-collapse:collapse;font-size:15px">
<tr><td ${cell}>Phone</td><td><a href="tel:${esc(row.caller_number)}" ${link}>${esc(phone)}</a></td></tr>
<tr><td ${cell}>Menu</td><td>${esc(choice)}</td></tr>
<tr><td ${cell}>When</td><td>${esc(whenCentral(row.started_at))} Central</td></tr>
</table>
<p style="margin:16px 0 0">${row.recording_url ? `<a href="${esc(row.recording_url)}" ${link}>Listen to the recording</a> &nbsp;·&nbsp; ` : ""}<a href="${esc(leadUrl)}" ${link}>Open in the CRM</a></p>
</div>`;
  return { subject: `${what}: ${who}, ${choice}`, text: lines.join("\n"), html };
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (!(await signatureOk(env.CALLRAIL_SIGNING_KEY, raw, request.headers.get("signature") || ""))) {
    console.warn("[callrail] refused, bad or missing signature");
    return json({ ok: false, error: "signature" }, 401);
  }

  let call = null;
  try { call = JSON.parse(raw); } catch { /* answered below */ }
  if (call && call.resource_id && !call.id) call.id = call.resource_id;
  if (!call || !call.id) return json({ ok: false, error: "no call id" }, 400);
  if (call.direction && call.direction !== "inbound") return json({ ok: true, skipped: "direction" });

  const db = env.DB;
  const callrailId = str(call.id, 64);
  const tags = tagNames(call);
  const choice = menuChoiceOf(tags);

  // ---- 1. store ------------------------------------------------------------
  let row;
  try {
    const player = str(call.recording_player);
    await db.prepare(
      `INSERT INTO calls (callrail_id, menu_choice, tags, tracking_number, caller_number, caller_name, caller_city,
         caller_state, source, started_at, duration, answered, voicemail, spam, recording_url, raw)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
       ON CONFLICT(callrail_id) DO UPDATE SET
         menu_choice = COALESCE(excluded.menu_choice, menu_choice),
         tags = COALESCE(excluded.tags, tags),
         caller_name = COALESCE(excluded.caller_name, caller_name),
         duration = COALESCE(excluded.duration, duration),
         answered = COALESCE(excluded.answered, answered),
         voicemail = MAX(excluded.voicemail, voicemail),
         spam = excluded.spam,
         recording_url = COALESCE(excluded.recording_url, recording_url),
         raw = excluded.raw, updated_at = datetime('now')`
    ).bind(
      callrailId, choice, tags.join(", ") || null,
      str(call.tracking_phone_number, 40) || null, str(call.customer_phone_number, 40) || null,
      realName(call.customer_name) || null, str(call.customer_city, 100) || null, str(call.customer_state, 40) || null,
      str(call.source_name || call.source, 200) || null, str(call.start_time, 40) || null,
      call.duration == null ? null : Number(call.duration) || 0,
      call.answered == null ? null : (call.answered ? 1 : 0),
      call.voicemail ? 1 : 0, call.spam ? 1 : 0,
      /^https:\/\//.test(player) ? player : null, raw.slice(0, 60000)
    ).run();
    row = await db.prepare("SELECT * FROM calls WHERE callrail_id = ?1").bind(callrailId).first();
    if (!row) throw new Error("row not found after upsert");
  } catch (err) {
    console.error("[callrail] D1 write failed", err?.message || err);
    return json({ ok: false, error: "store" }, 500);
  }

  // From here the call is saved; a failure below is logged and still answers 200.
  // ---- 2. who called ---------------------------------------------------------
  try {
    if (row.lead_id == null && row.caller_number) {
      const { leadId, contactId } = await findCaller(db, row.caller_number);
      if (contactId && !row.contact_id) {
        await db.prepare("UPDATE calls SET contact_id = ?1 WHERE id = ?2").bind(contactId, row.id).run();
        row.contact_id = contactId;
      }
      if (leadId) {
        await db.prepare("UPDATE calls SET lead_id = ?1 WHERE id = ?2").bind(leadId, row.id).run();
        row.lead_id = leadId;
      } else if (row.menu_choice === "estimate" && !row.spam) {
        // Both webhooks can arrive together: only the one that claims the row makes the lead.
        const claim = await db.prepare("UPDATE calls SET lead_id = 0 WHERE id = ?1 AND lead_id IS NULL").bind(row.id).run();
        if (claim.meta && claim.meta.changes) {
          try {
            row.lead_id = await leadFromCall(db, row);
          } catch (err) {
            await db.prepare("UPDATE calls SET lead_id = NULL WHERE id = ?1").bind(row.id).run();
            row.lead_id = null;
            throw err;
          }
        }
      }
    }
  } catch (err) {
    console.error("[callrail] lead step failed (call saved):", err?.message || err);
  }

  // ---- 3. tell the office ----------------------------------------------------
  const worthTelling = !row.spam && !row.notified && (row.voicemail || (!row.answered && row.menu_choice));
  if (worthTelling) {
    const claim = await db.prepare("UPDATE calls SET notified = 2 WHERE id = ?1 AND notified = 0").bind(row.id).run().catch(() => null);
    if (claim && claim.meta && claim.meta.changes) {
      let sent = false, why = null;
      try {
        const res = await sendStaffAlert(env, { label: "National Closet Co. Phones", ...alertFor(row, new URL(request.url).origin) });
        sent = !res.skipped && !res.error;
        if (!sent) why = String(res.reason || res.error || "unknown").slice(0, 300);
      } catch (err) {
        why = String(err?.message || err).slice(0, 300);
      }
      if (why) console.error("[callrail] staff alert failed (call saved):", why);
      await db.prepare("UPDATE calls SET notified = ?1, notify_error = ?2, updated_at = datetime('now') WHERE id = ?3")
        .bind(sent ? 1 : 0, why, row.id).run().catch(() => {});
    }
  }

  return json({ ok: true, id: row.id, lead_id: row.lead_id > 0 ? row.lead_id : null });
}

export async function onRequest() {
  return json({ error: "Method not allowed." }, 405);
}
