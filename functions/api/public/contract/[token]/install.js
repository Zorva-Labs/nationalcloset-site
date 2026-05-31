// GET  /api/public/contract/[token]/install — fetch existing install appointment (if any)
// POST /api/public/contract/[token]/install — book an install appointment for this contract's project
import { json, hashIp } from "../../../../_lib/auth.js";
import { genToken } from "../../../../_lib/tokens.js";
import { recordActivity } from "../../../../_lib/db.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../../_lib/email.js";
import { buildIcs } from "../../../../_lib/ical.js";
import { fmtPretty } from "../../../../_lib/dates.js";

const SITE_URL = "https://nationalclosetco.com";

export async function onRequestGet(context) {
  const token = context.params.token;
  const k = await context.env.DB.prepare(`SELECT id, project_id FROM contracts WHERE view_token=?1`).bind(token).first();
  if (!k) return json({ error: "Not found" }, 404);
  const appt = await context.env.DB.prepare(
    `SELECT id, start_at, end_at, duration_min, status FROM appointments
     WHERE project_id=?1 AND type='install' AND status IN ('pending','confirmed')
     ORDER BY start_at DESC LIMIT 1`
  ).bind(k.project_id).first();
  return json({ appointment: appt || null });
}

export async function onRequestPost(context) {
  const token = context.params.token;
  const body = await context.request.json().catch(() => ({}));
  if (!body.start_at) return json({ error: "Missing start_at" }, 400);

  const k = await context.env.DB.prepare(
    `SELECT k.*, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone, c.id AS contact_id,
            p.site_address, p.name AS project_name
     FROM contracts k JOIN projects p ON p.id=k.project_id JOIN contacts c ON c.id=p.contact_id
     WHERE k.view_token=?1`
  ).bind(token).first();
  if (!k) return json({ error: "Not found" }, 404);
  if (k.status !== "fully_executed") return json({ error: "Contract must be signed before scheduling install." }, 400);

  const startAt = body.start_at;
  const dur = parseInt(body.duration_min || 240, 10);  // installs default to 4 hours
  const endAt = computeEndIso(startAt, dur);

  // ── Install scheduling rules ──────────────────────────────────────────
  // Mirror what the install-slots feed enforces, so a malicious client
  // can't bypass UI restrictions by POSTing directly.
  //
  // 1. Custom-order contracts need 4-week manufacturer lead time from the
  //    customer-signature date.
  if (k.contract_type === "custom_order" && k.signed_by_customer_at) {
    const signedDate = k.signed_by_customer_at.slice(0, 10);
    const minDate = new Date(signedDate + "T00:00:00Z");
    minDate.setUTCDate(minDate.getUTCDate() + 28);
    const minIso = minDate.toISOString().slice(0, 10);
    if (startAt.slice(0, 10) < minIso) {
      return json({ error: `Custom orders need a 4-week lead time. Earliest install date is ${minIso}.` }, 400);
    }
  }
  // 2. Time of day must be 10:00 or 16:00 Central.
  const hhmm = startAt.slice(11, 16);
  if (hhmm !== "10:00" && hhmm !== "16:00") {
    return json({ error: "Install slots are 10:00 AM or 4:00 PM only." }, 400);
  }
  // 3. Max 2 installs per day total.
  const dayCount = await context.env.DB
    .prepare(`SELECT COUNT(*) AS n FROM appointments
              WHERE type='install' AND status IN ('pending','confirmed')
                AND substr(start_at, 1, 10) = ?1`)
    .bind(startAt.slice(0, 10)).first();
  if ((dayCount?.n || 0) >= 2) {
    return json({ error: "That day already has two installs scheduled — please pick another." }, 409);
  }
  // 4. Specific slot must be free.
  const conflict = await context.env.DB
    .prepare(`SELECT id FROM appointments WHERE status IN ('pending','confirmed') AND start_at < ?1 AND end_at > ?2`)
    .bind(endAt, startAt).first();
  if (conflict) return json({ error: "That time was just taken — please pick another." }, 409);

  const cancelToken = genToken(16);
  const ipHash = await hashIp(context.request.headers.get("CF-Connecting-IP"));

  const r = await context.env.DB.prepare(
    `INSERT INTO appointments (contact_id, project_id, type, start_at, end_at, duration_min, status, source,
       name, email, phone, site_address, notes, cancel_token)
     VALUES (?1, ?2, 'install', ?3, ?4, ?5, 'confirmed', 'web',
       ?6, ?7, ?8, ?9, ?10, ?11) RETURNING id`
  ).bind(
    k.contact_id, k.project_id, startAt, endAt, dur,
    k.contact_name, k.contact_email, k.contact_phone || null,
    k.site_address || null,
    `Install for contract ${k.number}`,
    cancelToken,
  ).first();

  await recordActivity(context.env.DB, {
    entityType: "appointment", entityId: r.id, action: "install-scheduled",
    actorKind: "customer", actorName: k.contact_name,
    details: { contract_id: k.id, ip_hash: ipHash },
  });

  // Move project to "installing" (or keep "contracted" until install day — we'll use "installing" since it's now imminent)
  await context.env.DB.prepare(`UPDATE projects SET status='installing', updated_at=datetime('now') WHERE id=?1`).bind(k.project_id).run();

  // iCal
  const ics = buildIcs({
    uid: `install-${r.id}@nationalclosetco.com`,
    start: startAt, end: endAt,
    summary: `National Closet Company · Install · ${k.project_name}`,
    description: `Install for contract ${k.number}.\\nQuestions? Call 629-298-8241.\\nReschedule: ${SITE_URL}/book/?cancel=${cancelToken}`,
    location: k.site_address || "Your home",
    organizer: "hello@nationalclosetco.com",
    organizerName: "National Closet Company",
    url: `${SITE_URL}/contract/?t=${k.view_token}`,
  });

  // Confirmation to customer
  await sendEmail(context.env, {
    to: k.contact_email,
    subject: `Install scheduled — ${fmtPretty(startAt)} · National Closet Company`,
    html: brandedEmail({
      title: "Your install is on the calendar.",
      body: `
        <p>Hi ${escapeHtml(k.contact_name.split(" ")[0])},</p>
        <p>Your install for contract <strong>${escapeHtml(k.number)}</strong> is scheduled:</p>
        <p style="font-size:18px;color:#14110D;font-weight:600;margin:14px 0">${escapeHtml(fmtPretty(startAt))}</p>
        ${k.site_address ? `<p>We'll be at:<br/><strong>${escapeHtml(k.site_address)}</strong></p>` : ""}
        <p>Plan for the team to be on site about ${Math.round(dur/60)} hour${dur >= 90 ? "s" : ""}. We'll arrive with drop cloths and tools, install every window, demo each motor or mechanism, and not leave until you're satisfied with the work.</p>
        <p>If anything changes, you can <a href="${SITE_URL}/book/?cancel=${cancelToken}">reschedule or cancel here</a>, or call/text us at <a href="tel:+16292988241">629-298-8241</a>.</p>
        <p style="margin-top:20px">See you then,<br/>— National Closet Company</p>
      `,
    }),
    text: `Install scheduled for ${fmtPretty(startAt)}.\nReschedule: ${SITE_URL}/book/?cancel=${cancelToken}\nQuestions: 629-298-8241`,
    attachments: [{
      filename: "stately-shades-install.ics",
      contentType: "text/calendar; method=REQUEST",
      // btoa() is Latin1-only, but our customer/project strings contain em-
      // dashes and other multi-byte UTF-8 chars. Encode to UTF-8 bytes first,
      // then base64 those bytes — otherwise btoa throws InvalidCharacterError
      // and the whole install scheduling endpoint crashes with a 1101.
      content: utf8ToBase64(ics),
    }],
  });

  // Staff notify
  await sendEmail(context.env, {
    to: context.env.STAFF_EMAIL || "hello@nationalclosetco.com",
    subject: `Install booked: ${k.contact_name} · ${fmtPretty(startAt)} · ${k.number}`,
    html: brandedEmail({
      title: "Install on the calendar.",
      body: `
        <p><strong>${escapeHtml(k.contact_name)}</strong> just scheduled their install for contract ${escapeHtml(k.number)}.</p>
        <p><strong>When:</strong> ${escapeHtml(fmtPretty(startAt))} (${Math.round(dur/60)}h)</p>
        ${k.site_address ? `<p><strong>Where:</strong> ${escapeHtml(k.site_address)}</p>` : ""}
      `,
      ctaLabel: "Open Calendar",
      ctaUrl: `${SITE_URL}/crm/calendar.html`,
    }),
  });

  return json({ ok: true, appointment_id: r.id, start_at: startAt, end_at: endAt });
}

function computeEndIso(startIso, durMin) {
  const [d, t] = startIso.split("T");
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  let total = h * 60 + m + durMin;
  return `${d}T${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
}

// UTF-8-safe base64 encode for email attachment bodies. btoa() chokes on
// any code point above 0xFF (em-dashes, smart quotes, accented chars,
// emoji, etc.), so we transcode to a byte sequence first then base64.
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
