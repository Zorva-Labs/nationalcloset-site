// Morning-of sweeps (standalone): the customer's consultation reminder and the
// crew brief for whoever is assigned to today's visits. Both run automatically
// on the cron via advance-jobs; this endpoint lets the cron hit them directly or
// an admin trigger a manual sweep from the CRM.
//
// Auth: Bearer token matching env.CRON_SECRET, OR an admin session cookie.
import { requireAuth, json } from "../../_lib/auth.js";
import { sweepConsultationReminders } from "../../_lib/appointment-reminders.js";
import { sweepConsultBriefs } from "../../_lib/consult-brief.js";

async function authenticate(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer && context.env.CRON_SECRET && bearer === context.env.CRON_SECRET) return { ok: true };
  const session = await requireAuth(context);
  if (session && !(session instanceof Response)) return { ok: true };
  return { ok: false };
}

async function run(context) {
  const auth = await authenticate(context);
  if (!auth.ok) return json({ error: "Unauthorized" }, 401);
  const r = await sweepConsultationReminders(context.env);
  const b = await sweepConsultBriefs(context.env).catch((e) => {
    console.error("[appointment-reminders] consult-brief sweep failed:", e?.message || e);
    return { briefed: 0 };
  });
  return json({ ok: true, ...r, briefed: b.briefed, briefed_people: b.people || 0 });
}

export const onRequestPost = run;
export const onRequestGet = run;
