// Auto-advance scheduled jobs into the "installing" stage on their install date.
//
// A booked job (status='contracted') becomes 'scheduled_install' when the admin
// picks an install_date. This endpoint promotes any such job to 'installing'
// once its install_date has arrived, so the pipeline moves on its own without
// anyone clicking. The cron worker (nationalcloset-email-cron) calls this on
// the same schedule it syncs inbound mail.
//
// Auth: Bearer token matching env.CRON_SECRET, OR an admin session cookie
// (so the admin can trigger a manual sweep from the CRM if needed).
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";
import { sendStageEmail } from "../../_lib/stage-emails.js";
import { sweepConsultationReminders, sendInstallEveReminders } from "../../_lib/appointment-reminders.js";
import { sweepConsultBriefs } from "../../_lib/consult-brief.js";
import { sweepReviewRequests } from "../../_lib/review-requests.js";
import { createInvoice } from "../../_lib/invoices.js";
import { centralNow, addDays } from "../../_lib/dates.js";
import { MORNING_FROM_HOUR } from "../../_lib/event-notices.js";

async function authenticate(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer && context.env.CRON_SECRET && bearer === context.env.CRON_SECRET) {
    return { ok: true, actor: "cron" };
  }
  const session = await requireAuth(context);
  if (session && !(session instanceof Response)) return { ok: true, actor: "admin", id: session.id };
  return { ok: false };
}

async function advance(context) {
  const auth = await authenticate(context);
  if (!auth.ok) return json({ error: "Unauthorized" }, 401);
  const { DB } = context.env;

  // The US Central date, from the IANA zone (centralNow), so a job flips to
  // "installing", and its balance is billed, on the install date in the
  // customer's timezone: not at UTC midnight (the prior evening in
  // Central), and not at 11pm the evening before, which a flat -5 did from
  // November to March.
  //
  // Not before 7am Central on the day (2026-10-17): the "installing today" stage
  // email is the customer's morning-of notice, and it used to land at midnight.
  // A date already past moves at any hour. What the balance invoice bills is
  // unchanged; it just goes out with the 7am move.
  const now = centralNow();
  const lastInstallDay = now.hour >= MORNING_FROM_HOUR ? now.date : addDays(now.date, -1);
  const due = (await DB.prepare(
    `SELECT id, name, install_date FROM projects
      WHERE status = 'scheduled_install'
        AND install_date IS NOT NULL
        AND install_date <= ?1`
  ).bind(lastInstallDay).all()).results || [];

  let balancesBilled = 0;
  for (const p of due) {
    // Materials are on the wall as of the install date — stamp it here so the
    // status can't drift from reality if nobody ticks a box.
    await DB.prepare(
      `UPDATE projects
          SET status='installing',
              materials_installed_at = COALESCE(materials_installed_at, install_date || ' 12:00:00'),
              updated_at=datetime('now')
        WHERE id=?1`
    ).bind(p.id).run();
    await recordActivity(DB, {
      entityType: "project", entityId: p.id, action: "install-started",
      actorKind: "system", actorId: null, actorName: "auto-scheduler",
      details: { install_date: p.install_date },
    }).catch(() => {});
    // Notify the client their install is underway + log to Messages.
    await sendStageEmail(context.env, "installing", p.id, { name: "auto-scheduler" });
    // Auto-bill the final payment (25%) ON INSTALL DAY. This direct-DB advance
    // bypasses the PATCH handler that normally fires the balance invoice, so we
    // create it here. createInvoice dedups the balance per project (a job the
    // admin already marked 'installing' won't be billed twice) and figures the
    // amount from what's still uninvoiced (a paid-in-full job bills $0/skips).
    const bal = await createInvoice(context.env, {
      projectId: p.id, type: "balance", actor: { name: "auto-scheduler" },
    }).catch((e) => { console.error("[advance-jobs/balance]", String(e)); return null; });
    if (bal && bal.created) balancesBilled++;
  }

  // The customer's reminders, the day before and the morning of every visit on
  // the calendar — runs on the same cron tick (_lib/appointment-reminders.js).
  const reminders = await sweepConsultationReminders(context.env).catch((e) => {
    console.error("[advance-jobs] consult-reminder sweep failed:", e?.message || e);
    return { reminded: 0 };
  });
  // The day before an install date, the customer's reminder to clear the space.
  const installEve = await sendInstallEveReminders(context.env).catch((e) => {
    console.error("[advance-jobs] install-eve sweep failed:", e?.message || e);
    return { reminded: 0 };
  });

  // Crew briefs, the day before and the morning of — the client's details, the
  // address and a Maps link to whoever is assigned. Same tick, same windows and
  // same stamp-first idempotency as the customer reminder above.
  const briefs = await sweepConsultBriefs(context.env).catch((e) => {
    console.error("[advance-jobs] consult-brief sweep failed:", e?.message || e);
    return { briefed: 0 };
  });

  // Google-review requests — the morning after an install, two days after a
  // design visit. Same tick, same idempotency pattern as the reminders.
  const reviews = await sweepReviewRequests(context.env).catch((e) => {
    console.error("[advance-jobs] review-request sweep failed:", e?.message || e);
    return { installs: 0, visits: 0 };
  });

  return json({ ok: true, advanced: due.length, ids: due.map((p) => p.id), balancesBilled, reminded: reminders.reminded, installEveReminded: installEve.reminded, briefed: briefs.briefed, reviews });
}

export const onRequestPost = advance;
export const onRequestGet = advance;
