// Auto-advance scheduled jobs into the "installing" stage on their install date.
//
// A booked job (status='contracted') becomes 'scheduled_install' when the admin
// picks an install_date. This endpoint promotes any such job to 'installing'
// once its install_date has arrived, so the pipeline moves on its own without
// anyone clicking. The cron worker (nationalcloset-email-cron) calls this on
// the same schedule it polls IMAP.
//
// Auth: Bearer token matching env.CRON_SECRET, OR an admin session cookie
// (so the admin can trigger a manual sweep from the CRM if needed).
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";
import { sendStageEmail } from "../../_lib/stage-emails.js";

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

  // Use US Central local date (CDT = UTC-5 right now) so a job flips to
  // "installing" at the start of the install date in the customer's timezone,
  // not prematurely at UTC midnight (which is the prior evening in Central).
  const due = (await DB.prepare(
    `SELECT id, name, install_date FROM projects
      WHERE status = 'scheduled_install'
        AND install_date IS NOT NULL
        AND install_date <= date('now','-5 hours')`
  ).all()).results || [];

  for (const p of due) {
    await DB.prepare(
      `UPDATE projects SET status='installing', updated_at=datetime('now') WHERE id=?1`
    ).bind(p.id).run();
    await recordActivity(DB, {
      entityType: "project", entityId: p.id, action: "install-started",
      actorKind: "system", actorId: null, actorName: "auto-scheduler",
      details: { install_date: p.install_date },
    }).catch(() => {});
    // Notify the client their install is underway + log to Messages.
    await sendStageEmail(context.env, "installing", p.id, { name: "auto-scheduler" });
  }

  return json({ ok: true, advanced: due.length, ids: due.map((p) => p.id) });
}

export const onRequestPost = advance;
export const onRequestGet = advance;
