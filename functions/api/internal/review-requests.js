// Review-request sweep (standalone). Runs automatically on the cron via
// advance-jobs; this endpoint lets an admin trigger it by hand from the CRM.
//
// Auth: Bearer token matching env.CRON_SECRET, OR an admin session cookie.
import { requireAuth, json } from "../../_lib/auth.js";
import { sweepReviewRequests } from "../../_lib/review-requests.js";

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
  const r = await sweepReviewRequests(context.env);
  return json({ ok: true, ...r });
}

export const onRequestPost = run;
export const onRequestGet = run;
