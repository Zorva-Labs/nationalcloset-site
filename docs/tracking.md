# Tracking — the lead forms, the tags and the CSP

## The lead forms
- Every form asks for a name and a phone number: `/api/contact` (name + phone) → D1 `leads` (email may be "" until `/api/contact-address` or the booking supplies it; a contact row is created then) → welcome mail via `_lib/lead-ack.js`. The row is saved before any mail, and a mail failure never loses the lead. Each lead keeps its GA4 client and session ids and the gclid, for the offline conversions (`docs/google-ads.md`).
- After the save the form offers the booking calendar, then optional details. Every CTA → `/book/` (slots from `/api/public/slots`, `lead_token` from sessionStorage `ncc_lead`); "Text a photo" is an `sms:` link in the mobile bar.
- Anti-spam, all fail-open: Turnstile (the sitekey is in `js/main.js`, the secret is `TURNSTILE_SECRET`; only a token siteverify rejects counts as a bot, and any other siteverify fault is logged and let through), the `hp_url` honeypot and the `hp_ms` time-trap. A bot drop answers 200 `{ok:true}`: "200 means received, `success:true` means saved" — the client once fired GA4/Ads/Meta on bot drops, so the tags fire on `success:true` only.

## The tags
- Tracking: GA4 `G-EJEDXZZWJN` (property 539664920 — no other tag in the code), in each page's `<head>`; Ads `AW-18306256681` (form label `UnZvCNvcxMwcEKmejZlE`, click-to-call `rm_UCOCV2_AcEKmejZlE`), configured by `js/main.js` and still loaded, though the ads stopped; Meta pixel `904015652453670`.
- `track()` in `js/main.js` fires the GA4 event, the matching Ads conversion and the Meta event (`generate_lead` → Lead, `contact` → Contact) together. The events: `generate_lead` (a saved lead only), `contact`, `consult_cta_click`, `estimate`, and `booked_consultation`, which the booking page fires.
- With a saved lead, `js/main.js` also sets `user_data` (email, phone, name) for Enhanced Conversions; the switch for it is in the Ads UI (`CLAUDE.md` → Open items).
- The GA4 "0 since Jul 17" cliff was account-side + the owner's ad blocker; Cloudflare edge = true traffic, CRM = true conversions.

## The CSP
- `_headers` (`/*`) allows Google's hosts for the Google tag and the Ads tag (developers.google.com/tag-platform/security/guides/csp), the bare `analytics.google.com`, `ad.doubleclick.net` and `stats.g.doubleclick.net` included, plus Turnstile, Stripe, the Meta pixel and Cloudflare's beacon. `connect-src` still lists `https://purelymail.com`, a leftover of the old mail host.
- The preview in `.claude/launch.json` is `python3 -m http.server 4117` over the repo root: it sends no `_headers` and runs no functions, so a CSP change needs `dist/` served with its headers. A preview deployment has the functions, but it shares the live D1 (`DB` is bound to both environments), so a form sent there is a real lead.
