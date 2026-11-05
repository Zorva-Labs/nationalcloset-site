/* CallRail signs every webhook with the company's signing key: the Signature
   header is a Base64 HMAC-SHA1 of the raw body (CALLRAIL_SIGNING_KEY, a Pages
   secret; ~/.env CALLRAIL_SIGNING_KEY_NATIONALCLOSET). */
export async function signatureOk(key, raw, given) {
  if (!key || !given) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(raw)));
  const want = btoa(String.fromCharCode(...mac));
  if (want.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
