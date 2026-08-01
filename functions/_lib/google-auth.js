// Google service-account OAuth2 for the Gmail API, from Cloudflare Pages
// Functions. Workers can't do reliable SMTP/IMAP (and Google is deprecating
// basic-auth for both), so all mail — outbound send AND inbound sync — goes
// over the Gmail HTTPS API using a service account with domain-wide delegation
// that impersonates a Workspace mailbox (default hello@nationalclosetco.com).
//
// One-time setup (admin — see the migration checklist):
//   1. Google Cloud: create a project, enable the Gmail API, create a service
//      account, and generate a JSON key.
//   2. Workspace Admin ▸ Security ▸ API controls ▸ Domain-wide delegation:
//      authorize the service account's Client ID for these scopes:
//        https://www.googleapis.com/auth/gmail.send
//        https://www.googleapis.com/auth/gmail.readonly
//   3. In the hello@ mailbox, add notifications@nationalclosetco.com as a
//      verified "Send mail as" alias (so we can send From: notifications@).
//
// Secrets (wrangler pages secret put --project-name=nationalcloset):
//   GOOGLE_SA_EMAIL        — svc-acct email (…@….iam.gserviceaccount.com)
//   GOOGLE_SA_PRIVATE_KEY  — the private key PEM from the JSON key
//                            (real newlines OR \n-escaped both accepted)
//   GOOGLE_WORKSPACE_USER  — mailbox to impersonate (default hello@…)

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly";

// Per-isolate access-token cache, keyed by impersonated user.
const _cache = new Map();

export function googleConfigured(env) {
  return !!(env.GOOGLE_SA_EMAIL && env.GOOGLE_SA_PRIVATE_KEY);
}

export function impersonationUser(env) {
  return env.GOOGLE_WORKSPACE_USER || "hello@nationalclosetco.com";
}

// Mint (or reuse) an OAuth2 access token that impersonates `sub`. Throws on
// misconfiguration or Google errors — callers decide whether to fall back.
export async function getGoogleAccessToken(env, sub = impersonationUser(env)) {
  if (!googleConfigured(env)) throw new Error("google_not_configured");
  const now = Math.floor(Date.now() / 1000);
  const hit = _cache.get(sub);
  if (hit && hit.exp - 60 > now) return hit.token;

  const header = { alg: "RS256", typ: "JWT" };
  const claim = { iss: env.GOOGLE_SA_EMAIL, scope: SCOPES, aud: TOKEN_ENDPOINT, sub, iat: now, exp: now + 3600 };
  const enc = (o) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(claim)}`;
  const key = await importPrivateKey(env.GOOGLE_SA_PRIVATE_KEY);
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error("google_token_failed:" + (json.error_description || json.error || res.status));
  }
  _cache.set(sub, { token: json.access_token, exp: now + (json.expires_in || 3600) });
  return json.access_token;
}

async function importPrivateKey(pem) {
  // Cloudflare secrets frequently arrive with \n-escaped newlines — normalize.
  const clean = String(pem).replace(/\\n/g, "\n").trim();
  const b64 = clean.replace(/-----BEGIN[^-]+-----/, "").replace(/-----END[^-]+-----/, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

// URL-safe, unpadded base64 of a byte array.
export function base64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
