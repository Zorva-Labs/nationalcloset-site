// Manual / cron-scheduled IMAP poll endpoint.
//
// Auth: Bearer token matching env.CRON_SECRET (or admin session — admin can
// trigger an out-of-cycle sync from the CRM UI).
//
// Typical use:
//   - External cron service (cron-job.org, GitHub Actions, etc.) hits
//     POST /api/internal/email-sync with header Authorization: Bearer <CRON_SECRET>
//   - Admin clicks "Sync now" in the CRM (uses session cookie auth)
//
// We don't ship a built-in Cloudflare Pages cron trigger because Pages Functions
// don't yet support the [[triggers]] block in wrangler config. External cron
// is dead simple and runs on whatever schedule the admin wants.

import { requireAuth, json } from "../../_lib/auth.js";
import { runImapSync } from "../../_lib/email-sync.js";

async function authenticate(context) {
  // Bearer token (for cron services) — check this first to avoid a DB round-trip
  // for the common scheduled case.
  const authHeader = context.request.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer && context.env.CRON_SECRET && bearer === context.env.CRON_SECRET) {
    return { ok: true, actor: "cron" };
  }

  // Admin session cookie (for "Sync now" button in CRM)
  const session = await requireAuth(context);
  if (session && !(session instanceof Response)) return { ok: true, actor: "admin", id: session.id };
  return { ok: false };
}

export async function onRequestPost(context) {
  const auth = await authenticate(context);
  if (!auth.ok) return json({ error: "unauthorized" }, 401);

  try {
    const result = await runImapSync(context.env, { maxPerRun: 50 });
    return json({ ...result, actor: auth.actor });
  } catch (e) {
    console.error("[email-sync] failed:", e?.message || e);
    return json({ error: e?.message || "sync_failed" }, 500);
  }
}

// Also accept GET for cron services that can only do GETs
export const onRequestGet = onRequestPost;
