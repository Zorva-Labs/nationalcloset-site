# The CRM — `/crm`

`crm/` is the UI (30 static pages over `crm-app.js` and `crm-app.css`), `functions/api/` the API and `functions/_lib/` the shared code, over the D1 `nationalcloset-crm`. Mail and the scheduled sweeps are in `docs/automations.md`.

## Sign-in
- One login, the admin hello@nationalclosetco.com (`admin_users`), password `NCC_CRM_PASSWORD` in `~/.env`, at `/crm/login.html` (styled by `admin.css`). The same session opens `/crm/traffic` (`docs/traffic.md`).
- `node crm/setup-admin.mjs <email> [pw]` sets a password: it hashes it locally (PBKDF2-SHA256), writes the hash to D1 through the Cloudflare API with `CLOUDFLARE_API_TOKEN`, and prints the password (it makes one up if none is given). It does not touch `~/.env`.

## The pipeline
- leads → contacts → projects → proposals → contracts → invoices (Stripe) → jobs advanced by the cron (`docs/automations.md`); the conversions between them are in `_lib/lifecycle.js`.
- Every sent proposal is valid for two days (`EXPIRY_DAYS` in `_lib/proposal-expiry.js`).
- Contract types (`validTypes` in `_lib/lifecycle.js`): `custom_order`, `wallprep` (with wall repair and paint), `install_only` and `repair`. The live wording of `custom_order` and `wallprep` is in D1 `document_templates`, rows 1 and 6 (row 4 is the two-option proposal, row 5 the estimate's standard notes). `install_only` and `repair` have no row and use the code's fallbacks, which also stand in for any missing row: `FALLBACK_TERMS` for a contract made from an accepted proposal, and `TERMS_BY_TYPE` in `functions/api/contracts/index.js` for one made in the CRM directly.
- `_lib/lifecycle.js`: `PAYMENT_SCHEDULE` is the 50/25/25 terms (50% at signing, or more if the materials, shipping and processing fees need it; 25% when the materials are in and the install is scheduled; 25% on install day; a pay-in-full proposal replaces it with one payment), and `FALLBACK_TERMS` carry the lifetime warranty (install-only and repair work carry 90 days).
- `QUOTE_MARKUP_RATE=0`: prices are entered with any markup already in them (the var is a fraction, clamped 0–25%, added to every proposal and estimate).

## Invoices and Stripe
- `_lib/invoices.js`: deposit, scheduling (25%), balance (the last 25%, billed on install day by the cron), full and custom invoices, each emailed with a pay link to `/invoice/`. A paid deposit or full payment books the job.
- The pay page creates the Stripe PaymentIntent (`_lib/stripe.js`, no SDK) with automatic payment methods, so it offers whatever the Stripe Dashboard has switched on, Klarna included until the owner turns it off (`CLAUDE.md` → Open items). `/api/stripe/webhook`, verified with `STRIPE_WEBHOOK_SECRET`, is what marks an invoice paid.

## The customer's pages
- `book/` (self-booking; slots from `/api/public/slots`), `estimate/`, `proposal/`, `contract/` (signing, then the install slots), `invoice/` (paying, `/invoice/?t=<token>`) and `thanks/`, backed by `functions/api/public/*`; the document pages open from the token link in the email. All six are noindex, and the edge log never counts the four document pages as traffic.
- `CALENDAR_FEED_TOKEN` is the token in the calendar subscription feed's URL (`/api/public/calendar/<token>.ics`, every appointment not canceled): treat that URL as a password.

## Team and assignment
- **Team + assignment:** `team_members` is the roster (Michael and Noah at blaircustominteriors.com; add more at `/crm/team.html`, never a migration). `assignments` is a join table keyed `(entity_type, entity_id, team_member_id)` where entity_type is `appointment` or `project` — more than one person per consult or job on purpose. `_lib/team.js` owns every read/write (`setAssignees` is a diff, so an existing `assigned_at` survives a re-save); the appointments and projects endpoints take `assignee_ids` on POST/PATCH and return `assignees`, and a crew-only save is valid. D1 never fires `ON DELETE CASCADE`, so `_lib/cascade.js` deletes the rows by hand on a job/lead purge.
- Crew can be picked in the lead page's Book consultation form, the calendar view (Assign) and Edit. The morning brief goes to them (`docs/automations.md`).

## The UI on a phone
- **Mobile (`crm-app.css`, the `≤700px` block at the end).** Two rules that bit hard: a data table lives in `.tbl`, which must keep `overflow-x: auto` — `overflow: hidden` there clips the table with no way to scroll; and a grid track that holds free content must be `minmax(0, 1fr)`, never a bare `1fr`, which will not shrink below min-content. A page that sets `grid-template-columns` in an inline `style=` beats the stylesheet's media query, so those need `!important` or a class (`.tpl-layout`, `.lead-grid`). No CRM page may have content off-screen and out of reach at 375px; re-measure after adding a page.

## Contrast
- **Accent colors split by job, and text is measured** (the terracotta `:root` block at the end of `crm-app.css`, over the file's first, blue one). A color that fills well is too light to write with: the brand terracotta `--accent` (#D2683F) carries white at 3.63:1 and reads as text at 3.44:1. So `--accent` is fills/borders/focus rings only, `--accent-fill` (+`-hover`) is a filled control with a white label, and `--accent-text` (+`-hover`) is the accent as text — it clears 4.5:1 on every surface the CRM paints on. `--accent-ink` and `--accent-hover` are aliases into that scale so inline `style=` on the pages resolves correctly. The `--s-*` tokens are pill text only and are already taken down to ≥4.7:1. `admin.css` carries the same split for the login page as `--color-brass-fill` / `--color-brass-text`.
- Nothing in the CRM is below AA as painted at 1280px and 375px: re-measure after adding a color, and never put text on `--accent` itself.

## Mail templates and times
- **Templates → Email edits the plain text AND the HTML.** Every automated send prefers `body_html`; a template edited only in `body_text` changes nothing in the recipient's inbox. The editor exposes the HTML box for any template that has one.
- `reminder_sent_at` / `team_brief_sent_at` are stamped with `datetime('now')`, which is **UTC** — unlike `start_at` and the other appointment datetimes, which are naive Central wall-clock. Anything that displays them has to say so (`fmtStampUtc` in calendar.html).

## The D1 and its migrations
- `crm/schema.sql` is the base; `crm/migrations/` runs 0002–0071 (0054 pageviews, 0065 `ads_conversion_uploads`, 0066 GA ids on leads, 0067 review_request_visit, 0068/0069 template wording, 0070 the team, the assignments and the consult brief, 0071 its day words), each applied with `d1 execute --file` once: `npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/<file>`, with the account token as in the build block (the older files' "Apply via" comments still name the removed key pair).
- The tables (59, besides `_cf_KV` and `sqlite_sequence`):
  - the CRM: `leads`, `lead_notes`, `contacts`, `projects`, `project_notes`, `project_vendors`, `job_financials`, `windows`, `vendors`, `products`, `estimates`, `estimate_lines`, `proposals`, `proposal_tiers`, `proposal_tier_lines`, `proposal_attachments`, `proposal_comments`, `contracts`, `contract_lines`, `documents`, `document_templates`, `invoices`, `invoice_lines`, `invoice_payments`, `expenses`, `expense_payments`, `appointments`, `availability_rules`, `availability_blocks`, `team_members`, `assignments`, `communications`, `email_messages`, `email_templates`, `email_sync_state`, `activity_log`, `sequences`, `admin_users`, `sessions`;
  - the traffic page: `pageviews`, `page_engagement`, `rank_*` (5), `ga4_*` (4), `bing_*` (8) (`docs/traffic.md`);
  - Google Ads: `ads_conversion_uploads` (`docs/google-ads.md`).
