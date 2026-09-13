// Outbound text messages, via Twilio when it is configured and silently skipped
// when it is not. Three Pages secrets switch it on:
//   TWILIO_ACCOUNT_SID   — from the Twilio console
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM          — the Twilio number in E.164, e.g. +16295550123
//     (wrangler pages secret put TWILIO_ACCOUNT_SID --project-name=nationalcloset, etc.,
//      then redeploy — Pages binds secrets at deploy time.)
// Used by the review-request sweep. Best-effort: never throws.
export function smsConfigured(env) {
  return !!(env && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);
}

// "(629) 298-8241" → "+16292988241". Returns null for anything that is not a US number.
export function toE164(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  return d.length === 10 ? "+1" + d : null;
}

export async function sendSms(env, { to, body }) {
  if (!smsConfigured(env)) return { skipped: true, reason: "no_sms_transport" };
  const dest = toE164(to);
  if (!dest) return { skipped: true, reason: "bad_number" };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: dest, From: env.TWILIO_FROM, Body: String(body || "").slice(0, 600) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { console.error("[sms] Twilio refused:", res.status, json?.message || ""); return { skipped: true, error: json?.message || "twilio_" + res.status }; }
    return { ok: true, sid: json.sid };
  } catch (e) {
    console.error("[sms] send threw:", e?.message || e);
    return { skipped: true, error: e?.message || "sms_failed" };
  }
}
