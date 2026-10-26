# Changelog — National Closet Company

Newest first. One entry per session that changed this repo: what changed, why, what the client asked for, what is still owed. Infrastructure changes also go in `site.json` and `CLAUDE.md`. Entries dated before 2026-09-17 are reconstructed from git history; the reasoning behind them is in `CLAUDE.md`, `docs/` and `~/fleet/docs/archive`.

## 2026-10-26 — billing: $1,000 → $1,150/mo

- **Asked:** Michael, "add $40 a month to the existing the national closet subscription for Terry McCarthy", then "change it to $1150 total."
- **What (Stripe, cus_V3p3PeXrdvb9C2):** `sub_1UNuYDDmvNoGaAxPcTX1mu3H` went to $1,040/mo (`price_1UUpghDmvNoGaAxPhN97FJAM`), then the same day to **$1,150/mo** (`price_1UUpiJDmvNoGaAxPWQoIK7io`, same product, `proration_behavior=none`); the $1,000 and $1,040 prices are archived. Still one line on the invoice. Both changes were before the first charge (trialing to 10/28/2026 20:00 UTC), so nothing was prorated; the invoice preview reads $1,150.00 on 10/28, then the 28th of every month, on Terry's Mastercard 6830. `site.json → billing` updated.

## 2026-10-25 — the team: Riley Woodhouse, Anthony's and Terry's titles, Terry's address

- **Asked:** Michael: add Riley Woodhouse (riley@nationalclosetco.com, 615-517-0063) as a sales rep with sales access; Anthony Potts is General Manager with admin access; Terry McCarthy is the owner with admin access, on terry@nationalclosetco.com.
- **What (live D1, no code change):** `team_members` #6 Riley Woodhouse, Sales Rep, and a `sales` login (`admin_users` #6, made with `crm/setup-admin.mjs --role sales`; the password went to Michael to hand over and is not kept in `~/.env`). Anthony's roster title `manager` → `General Manager`; his login (hello@, #1) was already admin. Terry's roster row (#3) and his login (#2) moved from tmccarthy33@yahoo.com to terry@nationalclosetco.com, title `Owner`, still admin; his password and his job assignments are unchanged (assignments key on the roster id).
- **Still owed:** Terry signs in with the new address from now on. The consult brief goes to each assignee's roster address, and to the whole active roster when nobody is assigned, so terry@ and riley@ get it from now on (Riley included on unassigned visits): those Workspace mailboxes have to exist.

## 2026-10-24 — every lead carries where it came from

- **Asked:** Michael, across the estate: "all forms are supposed to send the traffic info with the lead form info." On the stored lead row and in the lead alert.
- **Why this site was blind:** `functions/_middleware.js` logged page views but never set the first-touch `ts_src` cookie, so nothing downstream could know the visit behind a form post.
- **What:** `_middleware.js` `sourceCookie()` (same payload as traffic-kit's, this file's `classifyChannel` so a lead and its `/crm/traffic` row agree; people only, first touch wins). `_lib/visit.js` is the kit's copy. `_lib/lead-visit.js` saves the visit on the row after the insert in `/api/contact`, leaving `utm_source`, `utm_medium` and `gclid` as the form sent them (the kit's own save would have overwritten the click id with 0/1). `_lib/lead-alert.js` and `/api/lead` add the "Where this lead came from" block to the staff alert's text and HTML and the channel to the subject (`· Google Ads`); the `/api/contact-address` follow-up carries the row's channel so the thread subject still matches. The customer's acknowledgment is unchanged.
- **Migration 0080 `crm/migrations/0080_lead_source.sql`, applied to `nationalcloset-crm`:** 15 columns on `leads` (channel, referrer_host, landing, device, first_seen, browser, os, language, geo_city, geo_region, geo_postal, metro, timezone, isp, asn); the kit's list minus `utm_source`, `utm_medium` and `gclid`, which already existed.
- **Checked:** the real endpoints against a mocked request (cookie plus `request.cf`), D1 and mail — the UPDATE, the block in text and HTML, the subject, "Unknown" without a cookie, a lead kept when the columns are missing, the follow-up's subject; the cookie's rules against bots, internal navigation, `/api/`, `/crm/`, static files and token pages. Live: the home page answers with `ts_src`, a stylesheet does not. No real lead was submitted. One test page view (`utm_source=nwdcheck`) is in the `pageviews` log.
- **Owed:** `site-kit check` still fails on `functions/api/leads/index.js` and `leads/import.js` (the CRM's manual add and import, behind sign-in, with no visit to carry); left alone as asked, the check needs to skip authenticated endpoints. Leads before today have no source. The CRM lead card does not show the new columns yet.

## 2026-10-24 — billing: $1,011 → $1,000/mo

- **Why:** Michael's list of Terry McCarthy's subscriptions (2026-10-24), every one billing monthly from 10/28/2026.
- **What (Stripe, cus_V3p3PeXrdvb9C2):** `sub_1UNuYDDmvNoGaAxPcTX1mu3H`, $1,011 → $1,000/mo; first charge 10/28/2026, then the 28th of every month, on Terry's Mastercard 6830. `site.json → billing` updated.

## 2026-10-23 — Direct is called Direct/ChatGPT on /traffic

- **Why:** Michael, across the estate ("every site present and in the future"). A visit with no referrer is most often an AI assistant now — ChatGPT and the rest send none when a link is opened inside their app or pasted — so that traffic has always landed in Direct, while `/traffic` explained Direct as "someone who typed the address or used a bookmark". Wrong, and read as "they already knew us".
- **What (`crm/traffic.html`), the four edits `~/traffic-kit/bin/add-direct-chatgpt.mjs` makes:** the legend and `chName` say **Direct/ChatGPT** wherever a channel is printed — the rows, the chips, the summary line; the channels card now says no referrer was sent at all, that most of that is an AI assistant, and that the **AI assistants** channel is therefore the floor and not the total; the leads card says what **Unknown** means — no visit cookie came back, so the edge never saw that visit begin (a page left open since the browser last closed, or a browser that keeps none).
- **Display only.** The classifier and the stored channel stay `Direct`, so the edge log, the rows and every figure already recorded still line up; nothing was backfilled (Michael's standing rule: leave the data alone, fix it for future).
- The wording and the patcher are the kit's (`~/traffic-kit/CHANGELOG.md`, 2026-10-23), so a new site gets it from the template.

## 2026-10-22 (Company address: 513 Red River Road, Gallatin, TN 37066)
- Asked: Michael, "change the address to 513 Red River Road Gallatin, TN 37066."
- The site carried no street address before, only "Gallatin, TN". Now: the Organization schema on the home page (`streetAddress`, `postalCode`, and `geo` moved from the Gallatin centroid to the building, 36.3888 / -86.4570, geocoded from the address) in `index.html` and `tools/site-build/sections/head.html`; the footer's contact column on all 74 pages (above the hours); the letterhead and footer of the customer contract page (`contract/index.html`), the CRM contract and invoice prints (`crm/contract.html`, `crm/invoice.html`), the branded email footer (`_lib/email.js`), the report letterhead (`crm/reports.html`), the contract intros in `_lib/lifecycle.js` and `api/contracts/index.js` ("National Closet Company (513 Red River Road, Gallatin, TN 37066)"), and the one live contract template that named where the company is based (migration 0079, applied). `llms.txt` gets an Address line; `site.json → client.address`.
- Left as they were: the copyright line ("· Gallatin, TN."), the about page's "Based in Gallatin, TN", and the service-area copy ("within about 90 miles of Gallatin, TN"). Contracts already sent or signed keep their terms.
- Deployed 855d389b, checked live (footer, schema, llms.txt, contract page), submitted.
- Still owed: the same address on the Google Business Profile and anywhere else outside the site (Bing Places, directories), which this change does not touch.

## 2026-10-21 (Subscription to $1,011/mo)
- Asked: Michael, "adjust the national closet subscription for terry mccarthy to $1011 monthly on the 28th of every month starting 10/28/2026."
- Stripe `sub_1UNuYDDmvNoGaAxPcTX1mu3H` (Terry's customer `cus_V3p3PeXrdvb9C2`) now bills a new $1,011/mo price `price_1UTBRqDmvNoGaAxP9JhOyIf9` on the same product, swapped with `proration_behavior=none` while still in its trial, so nothing was billed for the change; the $495 price is archived. The anchor was already 10/28/2026 20:00 UTC, so the first charge previews at $1,011 on 10/28 and then the 28th of every month. `site.json → billing` updated. No site change, no deploy.

## 2026-10-21 (no profit or labor math; deposit always 50%)
- **Asked (Michael):** "remove all calculations for profit, labor etc..." Asked where, he chose **remove for everyone**; asked about the deposit, which had a materials floor, he chose **always 50%**.
- **Removed:** the job card's "Expenses & profit" card; the Jobs list's Net profit and Labor columns and profit tiles (now Open jobs, Completed jobs and All jobs by value); the proposals list's Profit column; the Reports P&L view with its PDF, CSV and API (`functions/api/reports/index.js`); estimated installer labor on Payables (its KPIs are now total, overdue, not yet due and oldest); modeled job costs on Cash flow; `functions/api/projects/[id]/financials.js`; the cost formula, `resolveFinancials` and `costBasis`; the wallprep and option-change writes to `job_financials`. Reports opens on Leads.
- **Deposit:** `depositForTotal` is now 50% of what the customer pays, no materials floor and no pre-discount basis (contracts, invoices, proposal acceptance, `/proposal/` and the calculator). The contract terms in `functions/api/contracts/index.js`, `_lib/lifecycle.js` and the two live templates (migration 0078, applied) lost "or, if greater, the amount required to cover the materials and shipping". Contracts already sent or signed keep their terms. CRM labels read "50% deposit at signing".
- **`calc.html`** is now a plain payment schedule: total, optional discount, pay in full, then the three payments.
- **Kept:** the D1 rows in `job_financials` and `proposals.cost_rates` (unread), bills under Expenses (real payables), the installer vendor role.
- Checked locally at 1280 and 375 px (Reports tabs, Jobs list, job page, calculator: $10,001 → $5,000.50 / $2,500.25 / $2,500.25) and live (the removed APIs 404, the others carry no cost fields). Deployed b7019fd6. `crm-app.js` → `?v=ncc116`.

## 2026-10-21 (Mike Cornwell's CRM login)
- Asked: Michael, "Yes, create Mike Cornwell's installer login and give me the password."
- Login #5, cornwellmike98@gmail.com, role installer, made through `/api/logins` on the live CRM; the password went to Michael in the session and is not kept anywhere. His email matches team member #5, so the jobs he is assigned to show on his My jobs page. Checked live: he signs in as an installer, leads answer 403, and he has no jobs assigned yet.
- Still owed: assign him to his jobs (the job's Overview → crew).

## 2026-10-21 (CRM roles; invoices paid by check, Stripe removed)
- Asked: Michael, "I need to create roles for sales, installers and admin. Admin has access to everything and would be the hello@ account. Sales role needs access to leads, jobs, calendar, scheduling, proposals, contracts and invoices. Installers only neead to see the job details they are assigned to and schedule/calendar for those jobs." Then "also remove the connection to stripe and just set invoices to accept a check" and "remove the wording in the footer of the invoice about the payment /stripe".
- **Roles.** Migration 0077 adds `admin_users.role` (applied to the live D1 before the deploy): hello@ and Terry McCarthy are admin. `functions/_lib/roles.js` holds the rules and `requireAuth` enforces them with a 403 on every CRM endpoint, so anything not listed is admin-only. Sales: leads, clients, jobs, the calendar and scheduling, proposals, contracts, invoices, estimates. Installer: `/crm/my-jobs.html` and `/crm/my-job.html` (new), the install worksheet and a read-only calendar of their own jobs, all from `/api/crew/jobs`, which carries no prices. The CRM nav follows the role (`crm-app.js?v=ncc115`). Logins are managed on `/crm/team.html` → CRM access (`/api/logins`, admin only): give a login, change the role, reset the password, remove. `setup-admin.mjs` takes `--role`.
- Defaults I chose, because the questions went unanswered: Terry is admin (he owns the business); installers see no money at all; sales does see the job card's cost and profit (it is on the job); Mike Cornwell has no login yet.
- **Stripe removed.** `/invoice/` now shows the amount due and "Make your check payable to James Blair", handed to the Project Manager (the payee already on the old page's check option). The deposit / pay-in-full chooser stays. Same wording in the invoice email, the part-payment receipt, the CRM invoice footer (the card/ACH line is gone), the contract terms (`contracts/index.js`, `send.js`, `lifecycle.js` — "payment-processing fees" out of the deposit clause) and the proposal page. Record payment offers Check, Cash, Other. Deleted `_lib/stripe.js` and `/api/stripe/webhook`; the bank-verification resend and the processing/failed paths are gone; option switching reads D1 only. `DEPOSIT_FEE_RATE` 0.03 → 0 (no card-fee buffer on the deposit floor). CSP without Stripe's hosts; `STRIPE_PUBLISHABLE_KEY` out of `wrangler.toml`; Pages secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` deleted (production and preview) and redeployed; both Stripe webhook endpoints (live `we_1TdHFBFwmijYgch1BjjjYtxE`, sandbox) disabled, not deleted. Nothing was open or in flight: all 35 invoices were paid or void. Past card payments keep their fees in the P&L.
- Public copy: the payment FAQ on the home page and `/faq` (and the factory section) now says payment is by check; `/privacy` drops the Stripe paragraph (dated October 21, 2026).
- Checked on the local CRM: sales and installer logins made through the Team page's API; sales gets 403 on expenses, reports and logins and no 403 anywhere on a job; the installer sees only the assigned job (another job 404s, `project.html` redirects to `my-job.html`), and the calendar shows only that install; the invoice page and a recorded check (`Check · #1042`). Deployed 1baa2ae9, then 6991b6c5 after the secrets came out; live `/api/stripe/webhook` 404s, the agency sign-in is admin. Submitted (3 URLs).
- Still owed: a login for Mike Cornwell (installer) and for any salesperson, on Michael's word; the payee "James Blair" to be confirmed by Michael.

## 2026-10-21 (Proposal: Save & open for customer)
- Asked: Michael, "on the proposal screen add a button to open the proposal next to the send and save button. make it save and open link so that the customer can complete the booking on a tablet that the salesman hands them."
- `crm/proposal.html`: "📲 Save & open for customer ↗" beside Save proposal and Save & Send on a draft ("Open for customer ↗" once sent). It saves, then opens `/proposal/?t=<token>` in a new tab; no email is sent. The tab is opened before the save because iPad Safari blocks a popup after an await; if it is blocked anyway the CRM tab goes to the customer page. `saveAll()` now returns true/false so a failed save never opens the page.
- A draft is never expired on the customer page (`proposal/index.html`) or in `/api/public/proposal` — a re-opened draft kept its old `valid_until` and showed "Proposal expired" on the tablet. The expiry sweep already skipped drafts.
- Checked on the local CRM (`nationalcloset-local-crm`): the button saves and lands on the proposal with Accept & sign. Deployed c089d12b. Nothing public changed, so no submit.

## 2026-10-21 (Subscription to $495/mo)
- Asked: Michael, "change the national closet subscription for Terry McCarthy to $495 instead of $1,024."
- Stripe `sub_1UNuYDDmvNoGaAxPcTX1mu3H` (on Terry's customer `cus_V3p3PeXrdvb9C2`) now bills a new $495/mo price `price_1USrlNDmvNoGaAxPKwnkImp0` on the same product; swapped with `proration_behavior=none` while still in its trial, so nothing was billed for the change. The $1,024 price is archived. The first charge on 10/28 previews at $495. `site.json → billing` filled in (it was empty). No site change, no deploy.

## 2026-10-20 (New business number: 615-857-5668)
- Asked: Terry McCarthy's email "National Closet Company - phone number" (2026-10-20): 615-857-5668 is the number for the directories (Google Business Profile and the others), the website and all digital advertising.
- 629-298-8241 is Nashville's Web Design's own line, so every place it stood for the business now says 615-857-5668 (`tel:`/`sms:` +16158575668, schema `+1-615-857-5668`): all 70 pages, the 404 and geo-block pages, `js/main.js` (the text-a-photo pill and the form's error), the customer pages (`estimate/`, `proposal/`, `contract/`, `invoice/`, `book/`, `thanks/`), every mail and calendar invite the functions send, the CRM's contract, invoice, worksheet and report letterhead, the page factory (`chrome.py`, `stage1.py`, `stage4.py`, `stage5_privacy.py`, sections), `llms.txt`, `site.json → client.phone`, and the printed review card (PDF re-rendered). The `AGENCY` block in `crm/traffic.html` (the Ads tab's offer) keeps 629-298-8241 on purpose: that one is the agency.
- Live D1: migration 0076 moved the number in the 16 email templates and the 1 document template that carried it. Mail already sent, proposals and contracts (signed ones are hashed) and the team roster (Michael's own phone) are untouched. The old migrations keep the old number as history.
- `stage4.py` re-run: no further change, so the factory and the pages agree. Built, checked in the browser pane (every call and text link, the schema and the visible number on the home page), deployed, live pages confirmed, submitted (34 URLs).
- Still owed, outside the repo: the number on the Google Business Profile, Bing Places, Apple Business Connect, Facebook and the other directory listings; the call asset in Google Ads 8968122786 (the campaign is paused) and the Meta page. The site invites customers to text photos, so 615-857-5668 needs to take texts.

## 2026-10-17 (Option 2 jobs: book the painter)
- Asked: "I need a way for jobs that booked option 2 to stand out so we know to book the painter."
- Option 2 is the `wallprep` contract (closet plus wall repair and paint). A job with one signed now shows "🎨 Book painter" in four places: on its page, as a banner with a "✓ Painter booked" button; on the Jobs list, as a badge, an amber edge and a banner naming the jobs; on the dashboard, under "Needs your attention" (→ `/crm/projects.html?painter=1`); and on the calendar, on its install day. Ticking it stamps `projects.painter_booked_at` (migration 0075, applied to the live D1), and the flag turns into a quiet "Painter booked" with an undo.
- Flagged at launch: Lesia Wood, Wonda Askew, Derek Smith, Helena Kirkendall. Amy Hill's Option 2 job is completed, so it isn't flagged.
- `crm-app.css?v=ncc124`, `crm-app.js?v=ncc114`. Checked on a local D1 at 375px and desktop: banner, badge, tick and undo, the dashboard count, the calendar mark. Contrast 6.4:1 and better, taps 44px, no sideways scroll.

## 2026-10-17 (Mike Cornwell on the team)
- Asked: "add mike cornwell from vendors as a team member to be added to jobs."
- Added as team member #5 through `POST /api/team` (name, email and phone copied from vendor #1, role Installer), so he is in the assignee picker on jobs and visits. It is a data change only: no deploy, and no CRM sign-in for him. He gets the crew emails only for the visits and jobs he is assigned to. Vendor #1 stays as it is.

## 2026-10-17 (Breadcrumbs to the job; upcoming visits open the job)
- Asked: "make sure there are bread crumbs leading back to the main job page on every page to do with a job" and "when clicking a link in upcoming events it should go to the job, not the calendar event."
- Breadcrumbs: the install worksheet now shows Jobs › job › Install worksheet (not in print); a lead with a job shows Jobs › job › Lead (Leads › name without one); a proposal, contract, invoice or estimate with no job falls back to its list. The four job documents already led back to the job.
- Upcoming visits on the dashboard open the job. Appointments carry the lead, not the job (every live one has `project_id` null), so `/api/dashboard` and `GET /api/appointments/:id` resolve `job_id` through the lead. No job → the lead; neither → the calendar. The calendar's event card gained "Open job →".
- Fixed in passing: the dashboard and activity links to an appointment used `?focus=`, which the calendar never read (it reads `?appt=`), so they opened a bare month.
- `crm-app.js?v=ncc113`. Checked on a local D1 at 375px and desktop: rows route job/lead/calendar correctly, crumbs link to the job, no sideways scroll, taps 44px+.

## 2026-10-17 (Switching options after signing)
- **Why:** Michael: "clients want to change their mind after selecting option one in the proposal. They need to be able to go back and select option 2 and sign that contract and pay the new amount." The case was Helena Kirkendall (PROP-2026-0056, job 79). On 2026-10-16 she chose Option 1 ($5,746.60) and signed C-2026-0033. Then she emailed that she wanted Option 2 ($6,396.60) and hadn't paid anything. Her proposal answered "Your contract is already signed. Call or text…". The option switch existed only before signing. It also had a bug: an unsigned switch voided the old contract, but the deposit invoice was deduplicated by proposal, so the customer was still billed the first option's deposit.
- **Now:** until money moves on the deal, "Switch to this option" works signed or not. New `functions/_lib/option-change.js` voids the live contract and every unpaid invoice of the deal, and cancels their Stripe PaymentIntents (new `cancelPaymentIntent` in `_lib/stripe.js`), so the old amount can't be charged. The proposal endpoint's `continue` then makes the new contract and deposit as before, and logs `option-changed`. When a signed contract was replaced, the office gets an "Option changed after signing" alert. A payment that is paid, processing, partly recorded, or whose Stripe intent succeeded, is processing or is waiting on micro-deposits locks the options, and the customer is told to call. Leaving Option 2 resets the job card's price to the contracts, unless it was set by hand. `select_tier` no longer moves the selection under a live contract.
- **The pages:** the proposal page, signed but unpaid, says "Your contract is signed. Your deposit is next." with a pay button. Switching asks first ("The contract you signed for Option 1 will be canceled…"). The contract page and the deposit's pay page carry "Want a different option? … Change my option →" while nothing is paid. A replaced contract or invoice link says so and links to the current one. The contract page also stops saying "Your job is booked! 🎉" while the deposit is unpaid (Helena: "Also, I have not made a down payment?"). It shows the pay-deposit box instead.
- **Verified** on a local D1 seeded with PROP-2026-0056's real options (`wrangler pages dev`, Stripe not configured locally). Choose Option 1 → sign → switch to Option 2 (the browser confirm, C1 and its $2,873.30 deposit voided, C2 and a $3,198.30 deposit created) → sign → resume the same option (same contract) → back to Option 1 (the job price handed back) → pay → a switch refused with 409 and the options locked. The contract, replaced and proposal states were checked at 375px.
- **Helena:** her proposal was re-opened as a draft in the CRM at 07:18 CT today. From her proposal link she can now choose Option 2, sign, and pay the new deposit. C-2026-0033 and INV-2026-0040 are voided automatically. The link stays valid until 2026-10-18 17:09 CT. After that it shows "expired", and resending the proposal stamps a new window.

## 2026-10-17 (Reminders the day before and the morning of every visit)
- **Why:** Michael asked for every scheduled visit's notification emails to go out twice: the day before and the morning of. Until now the customer got one reminder at 7am on the day, and the crew got one brief at 7am on the day. Both covered consultations and measures only. The stamp columns were never cleared on a reschedule, so a visit moved after its reminder got none for the new time. An install's only notice was the "installing today" stage email, which went out at midnight.
- **Now (`docs/automations.md` → Day-before and morning-of notices):** every appointment of any customer type (consultation, measure, install, service) gets a customer reminder and a crew brief **the day before, 9am–8pm Central**, and again **the morning of, from 7am Central**. A job's install date gets a new "your install is tomorrow, clear the space" email the day before. Its morning-of notice is the `job_installing` stage email, now sent at 7am: `advance-jobs` no longer moves a job before 7am Central on its install day. A date already past still moves at any hour. What the balance invoice bills is unchanged. It now goes out at 7am, not at midnight.
- **Once each:** new table `event_notices` (migration 0074, applied to the live D1; it backfilled the 22 customer and 10 crew morning-of sends already made). One row per send, keyed on the start time it was for, inserted before the email goes. The 3-minute cron cannot double-send, and a rescheduled visit gets fresh reminders. A customer reminder is skipped and recorded when the booking (or the "install scheduled" email) is under 6 hours old. The crew brief is never skipped. All Central math goes through `centralNow()` / `addDays()` in `_lib/dates.js`. New `_lib/event-notices.js` holds the windows and the guard.
- **Verified:** a dry run against an in-memory copy of the live D1 schema. It had 7 appointments (all four types, one cancelled, one booked an hour earlier, one rescheduled mid-run), one install job, the two-person roster and Gmail mocked. The Central clock was stepped through 13 ticks over two days. Each visit got exactly one day-before and one morning-of email to the customer and to its crew. Repeat ticks sent nothing; nothing went before 9am, after 8pm or before 7am. The rescheduled visit was reminded again for its new time. The install job stayed put at 6:59 and moved, with its stage email, at 7:00.
- **Deployed** 00bcac4 as `b1be1700`, from a clean worktree of origin/main: another session's uncommitted Stripe/option-change work was in this checkout and stayed out. A live POST of both internal endpoints answered in the new shape with nothing due. The first real sends are the day-before reminder and briefs for consult #47 (Oct 22), on Oct 21 at 9am. No page changed, so there was no `site-kit submit`.
- **Cron Worker:** unchanged. It already POSTs `/api/internal/advance-jobs` every 3 minutes, and that endpoint runs all of this.
- **Owed / not done:** there is no crew brief for a job's install date. Jobs carry a date, not a time, and the brief needs a time. If Michael wants one, it needs an install arrival time on the job first.

## 2026-10-14 (Every post opens with its short answer)
- **Why:** Michael, 2026-10-14: optimize every current and future post for AI answer engines. The estate standard (`~/fleet/docs/content-standards.md` §7, fleet 542431f) puts a 40–120-word short answer under each post's title, carried as the BlogPosting `abstract` and in `speakable`, with at least two section headings that are the question their section answers and a FAQ of four or more. Answer engines quote passages that stand on their own and read the HTML, not the layout.
- **The template:** each post's short answer is a field, its slug's entry in `tools/site-build/short-answers.json`. The new `stage4.py → sweep_short_answers()` renders it as the first thing in the post's `.prose` (an `aside.answer-box` labeled "The measured answer", the text on `p[data-short-answer]`), writes it as the BlogPosting `abstract` with `speakable.cssSelector: ["[data-short-answer]"]`, and stops the run on a post with no entry or one outside 40–120 words. The `.answer-box` styles are in `css/styles.css` (clay-deep label on clay-wash, ink text). The sweep also moves the accordion FAQ inside each post's `<article>`, so the post's text is one unit. The FAQ had sat after `</article>`, and the answers report could not see it ("FAQ n not on the page" on 17 posts).
- **The 29 short answers** were drafted from each post's own text and sources. They make no new claims. The only big-brand comparison in them is the $6,700 walk-in, in the posts that already tell that job. 66–79 words each.
- **Question headings:** 26 posts had fewer than two real ones. Headings were rewritten as the question their section answers ("The math: how much storage you lose" → "How much storage do you lose at 12 inches?"). Where needed, that section's first sentence was adjusted so it answers the question: affordable-custom-closet-systems, closet-installation-cost, closet-shelf-depth-12-vs-14, custom-pantry-design, fraley-pantry-master-closet-makeover. On large-walk-in-closet-6700, "So how is the price barely half?" went with its heading's rewrite. Posts that reached two only through a closing call-to-action ("Ready to…?") each got a real one. No post's FAQ was under four, so no new FAQ question was needed.
- **Result:** `blog-post answers nationalcloset` reports 29 of 29 complete, and `blog-post check` reports Ready with no warnings on all 29. Checked in the browser pane at 375 (20px gutters, no overflow) and 1280. Deployed (247763cf), and `site-kit submit` sent 29 URLs to IndexNow, Search Console and Bing.
- **Left, not in scope:** `/blog/affordable-custom-closet-systems` still says "we routinely come in 20–40% below the national-brand quotes", the kind of percentage claim the 2026-10-13 narrowing removed elsewhere. `/blog/large-walk-in-closet-6700` still says "roughly half" and has a "Half the price" pull quote. Both are about that one job, so they are true, but Michael may want them reworded to match.

## 2026-10-13 (Google Ads: "half the price" out of every ad)
- **Why:** Michael, 2026-10-13: "update the ads too", after the site's "often lands around half" claim was narrowed to the one real job (the "price claim narrowed" entry below). This settles its owed Ads item.
- **Read first:** every ad and asset in customer 8968122786 over GAQL — 4 campaigns (3 removed, NCC Search Campaign 24052252978 paused), 14 RSAs, 360 assets (sitelinks, callouts, structured snippet, price, call, message, images, PMax asset groups). Only the RSAs of the paused campaign carried the claim; no sitelink, callout, snippet, price or PMax asset did.
- **Changed (`scripts/ads-copy-2026-10-13.mjs`, validateOnly then `--apply`, 13 RSAs):**
  - Headline "Half the Price of the Big Guys" → "Walk-In for $6,700, Not $17K" in the closet ads (Custom Closets – Nashville, Closet Company Near Me, Closet Design & Installation, Walk-In & Reach-In Closets, both ads of each; both ads of the paused "Ad group 1"); → "One Honest Price, Upfront" in Custom Pantry; → "No Pressure, No Obligation" in both Garage, Laundry & Wardrobes ads.
  - Headline "Save Thousands on Your Closet" (paused "Ad group 1") → "One Honest Price, Upfront" (ad 817555925977) and "Most Closets Done in One Day" (823801473319).
  - "Same custom-built quality as the big brands at about half the price. No 40%-off games." → "National brands quoted one walk-in at $12K–$17K. We built it for $6,700. No 40%-off games." (Closet Company Near Me)
  - "Walk-in and reach-in closets designed free in your home, installed at half the price." → "A walk-in the national brands quoted at $12K–$17K, we built for $6,700. Free 3D design." (Walk-In & Reach-In)
  - "Custom closets designed free in your home, installed at half the big brands' price." → "Designed free in your home. A walk-in quoted $12K–$17K elsewhere, we built for $6,700." (Custom Closets – Nashville)
  - "Custom closet design and installation in Nashville at half the big brands' price." → "Design and installation in Nashville: a walk-in quoted $12K–$17K, built by us for $6,700." (Closet Design & Installation)
  - "Custom closets at half the price of the national brands — one honest quote, no games." → "National brands quoted a walk-in at $12K–$17K. We built it for $6,700. One honest quote." (paused "Ad group 1")
- **Unchanged:** every other headline and description and their order, the one pin (HEADLINE_1), paths, ad and ad-group statuses, the campaign (still paused), budgets, bids, keywords. Nothing on the site changed, so no deploy.
- **Checked:** a rerun finds 0 of 13 ads to change; a full re-query of the account finds no ad text with the claim. The seven old lines remain in the asset library as unlinked text assets — the API refuses to edit one (`IMMUTABLE_FIELD`) and has no remove — and nothing serves them.
- **Source of truth:** `docs/google-ads.md` → "What the ads say"; `scripts/ads-optimize-2026-09-12.mjs` now says it is superseded and must not be rerun as is.
- **Owed:** Google re-reviews the edited ads when the campaign runs again; it stays paused until the terms are split with BCI (`docs/google-ads.md`).

## 2026-10-13 (the fake-discounts post reworked around the $6,700 walk-in)
- **Why:** Michael, 2026-10-13: "rework it around the $6,700 job." The post's story of two families quoted $12,800 by a national brand and $5,350 by us has no record outside the post.
- **What:** `blog/fake-discounts-65-percent-off` (slug unchanged) is retitled **"Fake Closet Discounts and the $6,700 Walk-In"**, in the title, H1, OG, BlogPosting headline and description, and the `/closet-cases` card and its `blogPost` headline. The lead and a new opening section, "The walk-in quoted at $12,000 to $17,000", tell the real job: three-wall primary walk-in; quotes from the national brands; what we built; $6,700 installed; 14-inch vs 12-inch shelves; $5,300–$10,300 kept. All of it comes from `large-walk-in-closet-6700`, which the post links. It says plainly that we don't know how each of those quotes was built. The "two homeowners" section is gone. "We've watched quotes come back at roughly double" is now the measured 1.8–2.5× on this job. The figure is the real walk-in photo (`blog-large-walkin`) with a new alt and caption, in place of the $12,800/$5,350 comparison picture. The arithmetic, the FTC sections and the sources are unchanged.
- **Checked:** `stage4.py` reverted nothing; `node build.mjs`; `blog-post check` is Ready (3 sources; 8 links out, 10 in); `site-kit check` shows only the 5 problems it had before; `fleet audit` has no finding. Deployed `028349e8`, submitted.
- **Owed:** the Writing page on whoismichaelblair.com, refreshed in that repo.

## 2026-10-13 (the price claim narrowed to the $6,700 walk-in; the Costco answer fixed)
- **Why:** Michael, 2026-10-13: "soften it to the $6,700 example and fix the Costco answer." Only one job backs a national-brand comparison: the large walk-in that was quoted $12,000–$17,000 by the national brands and built for $6,700 (`/blog/large-walk-in-closet-6700`). The general claim that our price "often lands around half" of a national brand's quote is gone from every page.
- **Replaced with that one job, linked to its post:** the 19 city pages (the "cheaper than the national brands?" FAQ), the six `*-alternative` pages, the home and `/faq` answer on discounts, `/faq` "best closet company" and "cheapest", `custom-closet-cost-nashville`, and the posts `best-closet-company`, `california-closets-vs-local`, `closet-installation-cost`, `contractor-cost-to-build-a-closet`, `home-depot-lowes-closet-installation`, `what-closet-company-does-costco-use` and `fake-discounts-65-percent-off` (its general lines only).
- **Dropped where no example fit:** `custom-pantry-design` (twice), `maximize-small-reach-in-closet`, a second line in `custom-closet-cost-nashville`, and the `california-closets-alternative` installments answer.
- **`/free-design` (the ad landing page):** the description, OG and WebPage description (153 characters now), the lead (it now names the $6,700 walk-in), the H2 ("Same custom quality. An honest price."), the "One honest price" card and the FAQ question ("How can you cost less than the big brands?").
- **`/faq` Costco answer:** now matches the Costco post. Costco's closet page sends members to Closet Factory; the perk is a 10% Costco Shop Card, which is store credit, not money off; you still pay Closet Factory's price; we have no club tie-in; partners change. The "franchise pricing through a middleman" claim is gone. Also fixed in `tools/site-build/sections/7-faq.html` and `head.html`, so a rerun keeps it.
- **Kept:** the $6,700 post's own "roughly half", which is true for that job.
- **Checked:** `stage4.py` reverted nothing; `node build.mjs` (FAQPage rebuilt from the visible FAQs); `site-kit check` shows only the 5 problems it had before; `blog-post check` passes all 9 edited posts; `fleet audit` has no finding. Deployed `0bebab4e`, submitted (38 URLs to IndexNow; sitemaps to Search Console and Bing).
- **Owed:**
  - `fake-discounts-65-percent-off` still tells the story of two families quoted $12,800 by a national brand and $5,350 by us ("less than half"). No record backs it outside the post: Michael to confirm the job or cut it.
  - The Google Ads copy (`scripts/ads-optimize-2026-09-12.mjs`) still says "Half the Price of the Big Guys", "installed at half the big brands' price" and "about half the price". It was not changed; Michael to say.

## 2026-10-13 (the four claims left open: California Closets prices, Home Depot/Lowe's, rail cost, the walk-in listicle)
- **Why:** the four items the 2026-10-12 entry left owed (Michael: fix them all). Nothing new was invented: every number below is already on the site or on a cited primary page.
- **`california-closets-alternative.html`:** the "California Closets (reported)" column ($2,000–$5,000 reach-in up to $15,000–$40,000+ premium) and the FAQ answer repeating it are gone; no primary source supports them, and californiaclosets.com publishes no range (it books a free design consultation, now linked). The section now says so, gives the one comparison we can vouch for (national-brand quotes of $12,000–$17,000, our $6,700, linked to the post) and keeps our own installed ranges unchanged. Meta and OG descriptions no longer promise "reported costs".
- **Home Depot and Lowe's "mostly sell DIY kits":** the one remaining instance was the `/faq` answer "How much does Home Depot or Lowe's charge to install a closet?". It now matches the Home Depot/Lowe's post: kits in the aisle plus in-home custom programs, Home Depot's published installed ranges ($1,000–$4,000 / $4,000–$8,000 / $8,000+, linked to homedepot.com), Lowe's custom closets by Closet Factory (linked to lowes.com), installed by outside providers; the "half of a national brand's quote" line dropped from this answer. Same text in `tools/site-build/sections/7-faq.html` and the FAQPage text in `sections/head.html`, so a `stage1.py` rerun writes the corrected answer. Every other big-box mention in the source is about kits themselves and stays.
- **Rail cost (`closet-systems-compared` vs `affordable-custom-closet-systems`):** no cited source prices Elfa or freedomRail; the site's own numbers are a rail reach-in from about $700 installed (`rail-closet-systems`) against our custom reach-ins from about $1,000 (home page), with the ranges overlapping at the top. Both posts now say the same conditional thing: rail has the lowest starting price on a simple layout; loaded with drawers and accessories it comes close to custom. The compare post's "usually more expensive than our custom cabinetry" (summary, table, the "Custom doesn't have to cost more" section, the blockquote and its FAQ) is gone, rail is no longer "the big-box option", and its FAQ no longer calls rail a DIY-only system (we install it, per the rail post). The affordable post's modular line now agrees with the compare post (about what custom costs for a comparable design), and "all three are made in our shop" became "we design and install all three" (the rail post's claim).
- **Walk-in post retitled and restructured (slug unchanged):** "9 Walk-In Closet Design Ideas That Feel Like a Boutique" → **"Walk-In Closet Design: What Makes One Feel Like a Boutique?"** (title, H1, OG, BlogPosting headline, description, `/closet-cases` card and its `blogPost` headline; 5 min read). No numbered list: an answer-first lead and question headings, worked through the real $6,700 walk-in (its double-hang, long-hang, drawer banks, shoe wall and full-height shelving, from that post), with the island, lighting, glass fronts, finishes and finishing touches as conditional additions. Kept: the ENERGY STAR and DOE citations, the FAQ, the internal links (plus links to the $6,700 post, the Fraley post, the shelf-depth post and the cost guide); added the Composite Panel Association as a third source (inline, Sources list, `citation`). **The Writing page on whoismichaelblair.com lists this post by title: refresh it there (`node scripts/writing.mjs`).**
- **Deployed** `07a161d8`, submitted (6 URLs to IndexNow; Search Console and Bing sitemaps).
- **Checked:** `stage4.py` (0 pages swept, nothing reverted), `apply-alt.mjs`, `node build.mjs`; `site-kit check` shows the same 5 pre-existing problems; `blog-post check` on all 29 posts: no ✗; `fleet audit`: no copy shared, no new finding; the five changed pages at 375 px with nothing wider than the viewport. `site.json → build.check` is null.
- **Owed:** the home page and several FAQs still say our price "often lands around half of a national brand's discounted quote" (one job behind it, the $6,700 one); the `/faq` Costco answer still says a warehouse club adds "a middleman" markup, which the Costco post no longer claims. Both are untouched here.

## 2026-10-12 (open items: stage4 fixed, every post cites its sources, orphans linked, pantry retitled)
- **Why:** Michael, 2026-10-12: "fix all open items." `blog-post check` failed posts with fewer than two outside sources (the standard: two or more primary sources on distinct hosts, linked inline where each fact is stated, `~/fleet/skills/blog-post/SKILL.md`); four posts had no inbound link from a page; the pantry post's title read as a listicle; and `stage4.py` overwrote the cabinets page (the note in the entry below).
- **stage4.py:** cause: Parts 2 and 3 rebuilt `custom-cabinets-nashville.html` and `/about` from their September copy, though both had been edited in place since (fonts, schema, srcsets, copy), then stopped in `update_homepage()` on the old home title. Fix: Parts 2 and 3 are retired and not called; a run now does Part 1 only (chrome, credit and post sweeps, homepage CSS). The two pages are their own source. `CLAUDE.md`, `site.json → deploy.notes`, `docs/content.md` and `tools/site-build/README.md` say so. This supersedes the note below.
- **Citations, all 29 posts:** each cites two to five primary sources on distinct hosts, linked inline at the sentence, a Sources list at the end of the article and the same list as the BlogPosting `citation`; `dateModified` 2026-10-12. Every page cited was fetched and read (government and retailer pages that refuse curl were read in a browser). Most used: compositepanel.org (TFL, 9 posts), ftc.gov and consumer.ftc.gov (franchise guide, Cooling-Off Rule), eyeonhousing.org (NAHB buyer surveys), ecfr.gov (16 CFR 233.1), ikea.com, containerstore.com, lowes.com, homedepot.com, energy.gov/energystar.gov, fsis.usda.gov, cpsc.gov; also the Census Bureau, tn.gov, nashville.gov, the USDA Wood Handbook, NPS Preservation Brief 21, the Carpet and Rug Institute, Costco, California Closets, FirstService, ClosetMaid, Organized Living, Blum, Brannock, the Met and Tversky and Kahneman (1974).
- **Claims fixed or cut where no source held them:** the franchise royalty percentage (cut); California Closets' "reported" price ranges (cut from the cost post; its table shows only our installed ranges, new description); Home Depot and Lowe's as kit-only or hourly subcontracted installs (rewritten: both run in-home custom programs, Home Depot's with its published ranges and lead times, Lowe's through Closet Factory); Costco's partner ("we're not naming" became Closet Factory, from Costco's own page, with its 10% Shop Card, and "takes its cut" is gone); the stacked-discount math (40/15/10 is about 54% off); the velvet-hanger 30%; the shoe-size and fabric-cube shelf-depth claims; "triple the storage"; resale "time on market"; "makes colors true"; "thousands of dollars" in the garage post; "settle unevenly" on carpet; thinner-shelf sag now cube-law math from the Wood Handbook.
- **Inbound links (the orphans):** `/faq` → the Costco post and the Home Depot/Lowe's post; `/service-areas` → `custom-closets-middle-tennessee`; `/custom-pantry-nashville` → `custom-pantry-design`.
- **Pantry retitle:** "15 Pantry Organization Ideas That Actually Last" → "Which Pantry Organization Ideas Still Work a Year Later?" (title, H1, schema and the `/closet-cases` listing).
- **Checked:** `stage4.py`, `apply-alt.mjs`, `node build.mjs`; `site-kit check` shows only the 5 problems it had before (3 brass contrast pairs, 19 city-page images with no alt, the Maps `sameAs`); `blog-post check` on all 29 posts: no ✗, no warning; `fleet audit` adds no finding. Checked at 375px in the browser pane. Deployed `7f5decea`, submitted (33 URLs to IndexNow, Search Console, Bing); the live Costco post carries its Sources list, inline Costco link and `citation`.
- **Owed:** `california-closets-alternative.html` still carries the unsourced California Closets ranges ($15,000–$40,000 and the like); other pages may still call Home Depot and Lowe's kit-only; `affordable-custom-closet-systems` and `closet-systems-compared` disagree on whether rail costs more; "9 Walk-In Closet Design Ideas" still reads as a numbered list. The three brass contrast pairs, the 19 missing alts and the Maps `sameAs` predate this.

## 2026-10-12 (posts linked to Michael's author site)
- **Why:** E-E-A-T, one author entity across his sites (Michael, 2026-10-12): his author site https://whoismichaelblair.com/ went live today, and `fleet audit` warned that 30 posts signed by Michael Blair had no `sameAs` to it.
- **What:** `tools/site-build/stage4.py` → `AUTHOR` (the Person node on every BlogPosting and Article, the blog index's `blogPost` list and the pricing guide) names `https://whoismichaelblair.com/` first in `sameAs`, ahead of the two it had; `url` unchanged (the node has no `@id`). `sweep_posts()` ends every byline with a plain followed link, "More about Michael" → https://whoismichaelblair.com/, in the byline's existing style, and adds it to an existing byline that lacks it. 29 posts, `closet-cases.html` (schema only, no byline) and `custom-closet-cost-nashville.html`. Nothing in the header, nav or footer.
- **Checked:** `node build.mjs`; `blog-post check nationalcloset dist/blog/california-closets-cost.html` shows the author identity line (its one failure, no outside sources cited, predates this change); `fleet audit` has no nationalcloset finding. Deployed `fdc0bf2e`, submitted (31 URLs to IndexNow); the live post carries the link and the `sameAs`.
- **Note for the next session:** `stage4.py`'s Part 2 (the custom-cabinets build) is stale: running the file rebuilds `custom-cabinets-nashville.html` from old copy and then stops on an assertion in `update_homepage()`. Part 1 (the sweeps) completes first. Revert the cabinets page with `git checkout custom-cabinets-nashville.html` after a run, until Part 2 is retired or guarded. (Retired the same day; see the entry above.)
- **Owed:** nothing from this change.

## 2026-10-11 (geo gate moved into the code)
- **Why:** Lighthouse SEO scores of 40 across the estate (the monitor's findings; Springhaven's #285 tonight): Cloudflare zone WAF country rules, set up in the dashboard before the fleet and never in a repo, answered PageSpeed's Lighthouse run from Google's Taiwan data center with a 403. Michael, 2026-10-11: one gate for every site, in the code — "US only everywhere except Elopements Inc".
- **What:** `functions/_middleware.js` reads the allowed countries from `GEO_ALLOW` in `wrangler.toml [vars]` (`"US"`) instead of a hard-coded set, so this site's gate is set the same way as every other site's; behavior unchanged (US only; crawlers, Lighthouse and PageSpeed, the CRM, its APIs and static files never gated). CLAUDE.md → Infrastructure notes it.
- **Checked:** `node build.mjs`; deployed `e899dd61`; live `/`, `/robots.txt`, `/crm/` and a Lighthouse user agent answer 200; PageSpeed mobile SEO 100.

## 2026-10-11 (image rights: all six fields on every ImageObject)

- **Why:** Search Console's Image metadata report lists `creditText` and `copyrightNotice` as missing (non-critical) on an ImageObject that carries only a creator and a license (dropzonepainting.com's logo, elopementsinc.com's images, emails of 2026-10-10 and 2026-10-11). `site-kit check` now warns on an ImageObject missing any of `creditText`, `copyrightNotice` or `copyrightHolder` and `--strict` fails it (site-kit, 2026-10-11); the estate standard (`~/fleet/docs/seo-standards.md` → ImageObject) names all six fields.
- **What:** `copyrightNotice` ("© 2026 National Closet Company") and `copyrightHolder` (the Organization, the same node as `creator`) on the logo ImageObject in every page's inline JSON-LD (42 files); the check had warned on both. Built, checked, deployed and submitted.
- **Owed:** nothing; Search Console's next crawl of the pages clears the report.

## 2026-10-11 (monitor triage: Lighthouse and PageSpeed pass the geo gate)
- **Why:** the estate monitor reported "Lighthouse SEO score 50" twice in a row (failing audits: http-status-code, is-crawlable, meta-description). PageSpeed ran Lighthouse from Google's Taiwan data center on 2026-10-10 (the same minute, four sister zones' firewall logs show the identical Lighthouse user agent from TW), and this site's middleware gate answers a non-US request with its 403 — Lighthouse was not in `BOT_UA`, so the gate treated it as a visitor. The 10-09 note that the 50 "did not reproduce" was a run from a US data center.
- **What:** `functions/_middleware.js` → `BOT_UA` gains `chrome-lighthouse`, `lighthouse` and `pagespeed` (the needles the network's middleware already carries), so a PageSpeed run from anywhere sees the page a US visitor sees. Nothing else changed.
- **Checked:** `node build.mjs` (312 files); `site-kit check` reports the same five pre-existing problems as before (sameAs map search URL, image dimensions, hero srcset — none from this change; `site.json → build.check` is unset on this repo). Deployed `ceb33e45`; live, a Lighthouse user agent gets 200 on `/` and `/robots.txt`.
- **Owed:** nothing on this site from this change.

## 2026-10-09 (monitor: Ads check off)
- **Why:** the estate monitor reported "Google Ads account could not be read" (the account is not under our manager). Michael: "ignore national closets ad access."
- **What:** `site.json → monitor.ads: false`, roster re-synced, finding 152 closed with the reason. If the account is ever linked, remove the switch.

## 2026-10-09 (the agency passwords open the CRM; monitor login path)
- **Why:** the estate monitor found `/api/traffic/auth` answering 401 to the agency passwords — this site's dashboard lives inside the CRM behind its user login, which took only email + password, so the rule that the two agency passwords open every `/traffic` (Michael, 2026-09-29) did not hold here.
- **What:** `functions/_lib/auth.js` gained `agencyPasswords` (the `TRAFFIC_AGENCY_PASSWORDS` secret, one per line) and a constant-time `safeEqual`; `functions/api/auth/login.js` accepts an agency password with no email and signs in as the first admin user (Anthony's). Email + password login is unchanged; a wrong password with no email still gets a 400. Secret stored, built, deployed, both passwords verified live. `site.json → monitor.loginApi` is `/api/auth/login` so the monitor checks the right door; `cloudflare.secrets` lists the new secret.
- **Also found by the monitor, not fixed here:** the Google Ads account 8968122786 is not under the NWD manager (API 403) — `/client-access` when Michael says so; the monitor's "Lighthouse SEO 50" did not reproduce (PageSpeed gives 100 on the same URL).
- **Owed:** nothing on this site.

## 2026-10-09 (SEO scan, Phase 4: contrast, LCP, schema, titles, the California Closets cost post)
- **Why:** the 2026-10-09 estate scan (`~/fleet/reports/seo/estate/2026-10-09/F.md` → nationalclosetco.com, plan row 4.5): scanner 92, the primary button at 3.62:1, a 14.3 s lab LCP, a dead `SearchAction`, titles Google truncates, and a cost post stuck at positions 8-14. Michael's three constraints held: no form changes, no phone added, no claim removed or softened.
- **Contrast:** `--clay-deep` is #a34927 (was #b9542f, 4.06:1 on fog); `.btn--primary` and the mobile bar's "Book a visit" are white on `--clay-deep` (5.93:1, was 3.62:1); the stars, value numerals, drawer numbers, the stamp, the service arrows, `::selection`, the "Only National Closet Co." badge and the review initials (painted `--muted` on `--ink` by a stray selector) are fixed. Measured as rendered on 20 pages at 375 and 1280 px: no text under 4.5:1 (3:1 large).
- **LCP:** the home page's LCP element was the "organized by <month>" line, rewritten late by `js/main.js`; it is now filled inline as the hero paints and main.js leaves it alone. The hero picture is `srcset` 480/800/1280 with a preload and `decoding="async"`. Montserrat is self-hosted on every page (declared in `styles.css`, preloaded) instead of the Google Fonts swap that was the posts' LCP. GA4 and the Meta pixel load on the first interaction or 3.5 s after load. Header logo is a 4.7 KB WebP (was a 28 KB PNG). 38 pages' lead pictures got 480/800 `srcset` variants; 132 images got `width`/`height`. Four unreferenced originals (1.2 MB) are kept out of `dist/` (`build.mjs → ORIGINALS`). Mobile PageSpeed, live, before → after (after = six home runs and three post runs once the edge's stale `main.js` was purged): home 54 → 52–98, mostly 78–97 (LCP 15.3 s → 2.1–7.7 s); `/blog/california-closets-cost` 58 → 77–85 (LCP 8.0 s → 2.0–2.1 s). The home score still swings: in the slow runs the tags' 3.5 s fallback lands inside the measured window (TBT up to 630 ms), and the LCP is still the capacity line. Next step if it matters: tags on interaction only, or a later fallback. That is a tracking decision, so it was left.
- **Schema:** `potentialAction` SearchAction removed from the WebSite node (the `?q=` page ignored the query); `dateModified` on the 20 WebPage/AboutPage nodes that lacked it (site-kit lastmod dates them); a `Service` node on the eight comparison pages; `license` and `acquireLicensePage` on the 41 logo ImageObjects; `sameAs` points at the Business Profile (`maps.google.com/?cid=…`) instead of a place-id search URL; the home WebPage `name` matches its title.
- **Titles and descriptions:** home "Custom Closets in Nashville, TN | National Closet Company"; shelf-depth post "Closet Shelf Depth: 12 vs 14 Inches and Which to Choose"; cost post "California Closets Cost in 2026: Price Ranges by Project"; `/our-work`, `/gallery`, `/reviews`, `/faq`, `/closet-cases`, the Fraley post and `/free-design` cut to 42-56 characters; every description over 160 (19 pages) brought inside 120-160, and a description on `/404`. The two "A Local The … Alternative" H1s now read "A Local Alternative to The Tailored Closet / The Closet Company" (grammar only; same claim, same wording otherwise).
- **The cost post:** opens with the real job (the $6,700 walk-in the national franchises quoted at $12,000-$17,000, and the $2,290 reach-in), linked both ways with `/blog/large-walk-in-closet-6700` and `/our-work`; three FAQ answers now lead with those numbers. Linked into it from the home FAQ, `/our-work`, `/custom-closet-cost-nashville`, `/blog/custom-closet-cost`, the $6,700 post and the fake-discounts post ("California Closets sale").
- **Robots and markup:** `/contract/`, `/estimate/` and `/traffic` disallowed in both robots groups; page content wrapped in `<main>` (and in `chrome.py`'s `page()`); `alt=""` on the Meta noscript pixel; llms.txt says "5.0 from 6 Google reviews"; "seamless", "isn't just" and "say goodbye to" rephrased on six posts.
- **Not touched:** the 19 town pages (held for Phase 5; they keep the Google Fonts link, the old tag loader, the pixel without `alt` and no `<main>`), the comparison pages' competitor claims, tables and H1 wording, every price and claim (the cost post's reported-range table and franchise-fee paragraph stand as they were).
- **Still owed by the owner** (F.md): the towns with real installed jobs; which national brands quoted the $6,700 job and whether he has the paper; a source for each reported California Closets range; which comparison pages he stands behind and a source per competitor claim; today's Google review count and the last 30 customers to ask; typical weeks from signing to install for a reach-in versus a walk-in.
- **Not done here:** merging the six overlapping cost posts and the two listicles (item 7) and the town/comparison consolidation (items 2-3) are later phases; no new FAQs (no page under four has questions supplied by the scan); the CRM's own contrast (`--c-brass` table heads and calendar) and site-kit's `GEO_ALLOW` note (the gate is hard-coded to US in `_middleware.js`) are unchanged.

## 2026-10-07 (CRM: Noah removed, Anthony Potts added)
- **What the client asked for:** Michael: "remove noah from the crm and add Anthony Potts his email will be the hello@nationalclosetco.com with the password … to login to the crm."
- **Noah Blair** (team member 2, inactive since 2026-10-01) is deleted from `team_members`, with his three assignments (consult 40, jobs 48 and 49). Nobody else is assigned to those in his place.
- **Anthony Potts** is team member 4, `hello@nationalclosetco.com`, no role set yet (edit it at `/crm/team.html`). The CRM sign-in `hello@nationalclosetco.com` now shows as Anthony Potts, and its password was reset with `crm/setup-admin.mjs`; the new one is `NCC_CRM_PASSWORD` in `~/.env`. Anyone else who signed in as hello@ needs the new password. A live sign-in was checked (200, `ok:true`).
- Data change only, in the live D1; the code change is comments. No deploy.
- **Later the same day:** Michael: "Anthony is a manager." His role is now `manager`, and the Team screen's role list offers manager (`crm/team.html`). The role is a label only; nothing in the CRM keys off it. Deployed 5490e950.

## 2026-10-06 (CRM: invoice the full remaining balance when the install is scheduled)
- **What the client asked for:** Michael: "I need a button to check to invoice for the remaining balance on install schedule instead of just the 25%."
- **The checkbox:** "Invoice the full remaining balance, not 25%" sits beside the install date. It shows on the job's action card and in the Schedule modal (the pipeline's Scheduled step), and only while the job has no install date, because that first date is what raises the invoice. Ticked, the PATCH carries `bill_balance: true`. `functions/api/projects/[id]/index.js` then raises the balance invoice at once instead of the scheduling one, through `createInvoice`'s new `early` option.
- **What the customer sees:** "Remaining balance (N%) — your installation is scheduled". The email note says it is the last N% of the project and nothing else is due after it. A final-payment discount rides on it as it would on install day.
- **Nothing is billed twice:** the install-day hop (installing/completed) dedups against that balance invoice. Unticked, nothing changes: 25% at scheduling, the rest on install day.
- **Tested** on the local CRM (4119) with a $10,000 job, a $5,000 deposit and a $300 discount. Ticked, both the card and the modal raised one $4,700 balance invoice, and Start install added nothing. Unticked, it raised the usual $2,500 scheduling invoice. At 375px the checkbox row is 44px tall with no overflow. `docs/crm.md` is updated. Deployed d9f959dc.

## 2026-10-06 (/crm/traffic: traffic-kit's tabbed page)
- **What the client asked for:** Michael: "change the traffic page to the new version."
- **The page:** `/crm/traffic` is now traffic-kit's tabbed dashboard (Edge, Search Console, Analytics, Google Ads, Bing). It replaces the bespoke page, stays behind the CRM sign-in and has a CRM link in its top bar. `crm/traffic.html` is built by `tools/traffic/port.py` from `~/traffic-kit/template/public/traffic/index.html` with anchored edits, so a later kit version goes in the same way (`docs/traffic.md`). The edits:
  - the brand;
  - the CRM sign-in and sign-out;
  - an All visitors / Tennessee switch (`?tn=1`);
  - forms in place of the kit's calls;
  - a "Which state" card in place of devices;
  - no crawler card.
- **The endpoints:** `functions/api/traffic/` holds `data`, `ads`, `watch` and `bing`, behind a folder middleware with the CRM's `requireAuth`. `watch` and `bing` are the kit's files unchanged. `data` and `ads` are ported to this site's tables:
  - visits come from the beacon's `page_engagement` (rows with a channel, since 2026-09-13);
  - forms come from the website's `leads` rows (`functions/_lib/traffic-leads.js`).
  The old `/api/traffic-channels`, `-rankings`, `-ga4`, `-watch` and `-bing` are removed. `/api/traffic` stays for the CRM home page.
- **Google Ads tab:** `site.json → traffic.kit` is now `traffic-kit`, so the nightly ads-report sync (`com.zorvalabs.ads-sync`) writes this account's `ads_*` tables into the live D1. It was run once by hand with `--apply`. The tab shows the paused campaign's last run: Aug 17–Sep 15, $2,398, 131 clicks, 4 conversions.
- **How it was checked:** on a local CRM over copies of the live tables, then on the live site signed in.
  - Over 30 days: 569 visits, 4 forms, 26 ad visits. With the Tennessee switch on: 110 visits, 25 of the 26 ad visits.
  - Every tab drew without errors, and nothing was wider than the viewport at 375 px.
  - A signed-out visit goes to the CRM login, and the endpoints answer 401.
- **Noticed:** only 19% of the beacon's visits in the last 30 days came from Tennessee. Virginia, Washington, Oregon and New York send many, most likely headless browsers on hosting networks.
- **Not done:** taps to call are not logged on this site, so the page counts forms only. A first-party call beacon would add calls.
- Deployed e16395aa.

## 2026-10-06 (CRM: a discount on the final payment, breadcrumbs, no costs on the proposal)
- **What the client asked for:** Michael: "a way to add a discount for the final invoice after the booking is set in the crm, there should also be bread crumbs for going back to the previous job screen when clicking on proposals or messages, etc... Remove the calculations from the proposal screen and only show them on the job screen."
- **Discount on the final payment:** a booked job (contracted → completed) gets a "🏷 Discount on final payment" button on its Invoices tab and its action card. It takes $ or % of the job total, a reason the customer sees, and Remove. Migration **0073** (applied to the live D1) adds `projects.final_discount_cents` / `final_discount_note` and `invoices.discount_cents`. The new `POST /api/projects/:id/discount` sets the discount and moves any money already billed and unpaid. It refuses more than is still owed, since collected money would need a refund. The job total in billing, the jobs list, the P&L (with `costBasis`), Receivables and the job card are all net of it. The scheduling payment ignores it, so the whole discount comes off the final invoice. The CRM invoice sheet, the invoice email and `/invoice/` show it as a discount line. Setting it emails nothing. How it works: `docs/crm.md` → Invoices and Stripe.
- **Breadcrumbs:** Jobs › job › Proposals/Contracts/Invoices › document on the proposal, contract, invoice and estimate pages. Their back link is now "← Back to job" and goes to the tab you came from (`SSCrm.jobCrumbs`; `docs/crm.md` → Getting around). Messages already open inside the job.
- **Proposal page:** the cost-rate bar and the per-option cost/profit boxes are gone. "Expenses & profit" on the job is the one place for those figures. `proposals.cost_rates` stays in the D1, unused.
- CRM assets pinned `crm-app.css?v=ncc123`, `crm-app.js?v=ncc112`.
- **How it was checked:** a local CRM (`wrangler pages dev dist` over a seeded local D1, `docs/tracking.md`) with a $10,000 job, $7,500 paid and a $2,500 final invoice open:
  - A $250 discount took the invoice to $2,250 and the job to $9,750. The sheet showed Subtotal $2,500, the discount line and Total due $2,250.
  - Removing it put back $2,500.
  - A $300 discount set before the final invoice existed gave a $2,200 balance invoice carrying it.
  - $10,000 was refused ("$2,500.00 can come off").
  - The breadcrumbs and back links were correct on all four pages, and the proposal showed no cost figures.
  - At 375px nothing was wider than the viewport, the dialog fit, taps were ≥44px and the discount text measured 5.02:1.
- Nothing on the live site was discounted or emailed.

## 2026-10-05 (lead forms: email and the space required)
- **What the client asked for:** Michael, after lead #86 (Stacia Graffia, Google organic, home page) came in with a name and a phone only: "make email and what they want required."
- **Every lead form** (36 pages' `form[data-lead]`, the homepage's bottom form) now has a required **Email** and a required **What space?** select after Name and Phone; the select's options are the CRM's `SERVICES` (so Kitchen Cabinets and Bathroom Vanity, missing from the public picker, are back in step). The homepage ballpark takes its space from its chips as before and gains a required Email. The trade-partner form already required both.
- **`/api/contact`** answers 400 "Name, phone, email and the space are required." without all four (and checks the email's shape), before anything is saved. The bot and spam gates still run first.
- **The follow-up step** (`js/main.js → mountDetailsStep`) now offers the address and a note; it shows the email or the space only if the form didn't send them. Assets pinned `ncc129` (`chrome.py PIN` and every page). `/privacy`'s form paragraph rewritten (`stage5_privacy.py`), `docs/tracking.md` and `docs/content.md` updated.
- Checked in the browser pane at 375 px (four full-width fields, nothing wider than the viewport, the form refuses name + phone alone) and 1024 px (two by two), and the ballpark (space set from the chip, email required). Deployed 1c9dd4fd; on the live site name + phone alone gets the 400.
- **Test lead #87 "Form Check"** (615-555-0100): my first live check reached the edge before the new deploy had propagated, so it saved and sent the team the usual new-lead alert. Archived (`archived_at`), not deleted.
- **Trade-off to watch:** the two-field form was cut down on 2026-09 because most visitors who started the four-field one left it. Watch the lead count over the next weeks.

## 2026-10-03 (Don Bruce: one job, one invoice)
- **What the client asked for:** Michael: "combine all into one job and one invoice" (after confirming the record: $284.20 paid on the shoe tower, nothing on the laundry). No email to Don.
- **Live D1:** project #57 renamed "Shoe Tower & Laundry — Don Bruce"; INV-2026-0034 ($320 laundry deposit, never sent) voided; **INV-2026-0035, $924.20, "Shoe tower and laundry shelving — remaining balance"**, type `custom`, tied to C-2026-0029, open and not emailed. That is the whole job ($1,208.40) less the $284.20 paid, so the scheduling and install-day milestones bill nothing (what is left to invoice is $0). The two signed contracts stay as signed. Checked on the live CRM: booked, $1,208.40, $284.20 paid, $924.20 balance; no email to Don today.
- **Code (deployed 2e46a9a7):** `markInvoicePaid` marks a contract's deposit received when any invoice tied to it is paid and covers the deposit, not only a `deposit`/`full` invoice, so C-2026-0029 shows its deposit paid once INV-2026-0035 is. A `custom` invoice offers no deposit/full choice on `/invoice/`, so Don sees one amount.
- **Still owed:** sending INV-2026-0035 is Michael's call (Send on the invoice in the CRM).

## 2026-10-03 (Don Bruce's laundry deposit; online accepts lost pay-in-full)
- **What the client asked for:** Michael: "Don didn't make a full payment on the first invoice", then "the second invoice is for $640 and it didn't ask him to pay anything."
- **The record:** INV-2026-0024, the shoe tower deposit (C-2026-0028, $568.40), $284.20, paid by card 2026-08-28; Stripe live agrees (pi_3U9QOKFwmijYgch10XgVBrPK, $284.20 received, no refund or dispute), and it is the only Stripe payment on the job. The laundry contract C-2026-0029 ($640) was never billed: signing it showed Don the shoe tower's paid deposit (the dedup bug fixed earlier today).
- **INV-2026-0034 corrected to $320**, "Laundry shelving — deposit (50%)": C-2026-0029 as signed is 50/25/25 with a $320 deposit, not the $640 pay-in-full this session first raised from the proposal's setting. Still open and not emailed.
- **Bug: an online accept dropped pay-in-full.** The customer's accept passed `createContractFromProposalTier` only the proposal's id, project, number and tier, so `payment_plan` and `default_contract_type` were never read and every online accept made a 50/25/25 contract. It now reads the stored proposal first (deployed 7eeb0d87). Only Don's contract was affected (PROP-2026-0050 pay in full → C-2026-0029 installments).

## 2026-10-03 (hello@ CRM password)
- **What the client asked for:** Michael gave the hello@ password and asked for it to be set and noted in `~/.env`.
- Set with `node crm/setup-admin.mjs`, and `NCC_CRM_PASSWORD` in `~/.env` updated (single-quoted: the value has a `$`). Signed in on the live site with the value read from `~/.env`, read Don Bruce's job card (booked, $1,208.40, $284.20 paid — the fix above, confirmed on the live CRM), signed out. The open item about the stale password is closed in `CLAUDE.md`.

## 2026-10-03 (Don Bruce's job, and jobs with two contracts)
- **What the client asked for:** Michael: "where is the don bruce job?", then "same job, create the invoice and fix the bugs", and "do not send any emails to the client."
- **What had happened:** project #57 (Shoe Tower — Don Bruce) was booked on 2026-08-28 (C-2026-0028, $568.40, deposit INV-2026-0024 $284.20 paid). A second proposal on the same project, PROP-2026-0050 (laundry shelving, $640, pay in full), was accepted and C-2026-0029 signed on 2026-09-01. Accepting it set the project back to `proposed`, so it vanished from Jobs; signing found the shoe tower's paid deposit (the deposit dedup was per project), so the laundry was never invoiced; and every total read the newest contract alone, so the job read $640.
- **Fixed in code** (deployed 42d15192): `_lib/job-total.js` totals a job as every signed contract once (a revision of the same proposal once), with the accepted tiers on the same rule, and the jobs list, job card, vendors, P&L, cash flow, payables, receivables and `getProjectBilling` use it. A deposit is per deal: `getProjectBilling(db, id, { contractId, proposalId })` and `existingInvoice` match the contract or its proposal; the `/invoice/` pay-in-full choice reads the invoice's own deal. `createContractFromProposalTier` and contract signing never move a booked job back to `proposed`, and signing a no-deposit contract on a booked job doesn't re-book it or resend the Booked email. Checked against the live D1 before deploy: of 41 projects only #57 changes total.
- **Don's job, in the live D1:** #57 back to `contracted` (booked); INV-2026-0034, $640, "Laundry shelving — payment in full", tied to C-2026-0029, **open and not emailed**. The job now reads $1,208.40: $284.20 collected, $640 invoiced and open, $284.20 still to bill (the shoe tower's 25% + 25%, billed as usual at scheduling and on install day). Nothing was emailed to Don; booking a job with no install date sends nothing automatic, and no sweep reminds about open invoices.
- **Still owed:** sending INV-2026-0034 to Don is Michael's call (the invoice's Send in the CRM emails it). A manual price on a job card still overrides the sum of contracts.

## 2026-10-03 (CRM login for Terry McCarthy)
- **What the client asked for:** Michael: set Terry McCarthy's CRM login, tmccarthy33@yahoo.com, with the password he gave.
- `node crm/setup-admin.mjs` wrote the login to the live D1 (`admin_users`), display name "Terry McCarthy" (Terry was already on the team roster). Signed in on the live site, read an authenticated endpoint (200) and signed out. The password is not in the repo or `~/.env`.
- The CRM has no roles, so Terry's login has the same full access as hello@. `docs/crm.md` → Sign-in updated.

## 2026-10-03 (/crm/traffic blank)
- **What the client asked for:** Michael: "the traffic page is blank."
- **Cause:** the Bing block ported from traffic-kit on 2026-09-24 (7571498) sits inside the page's `innerHTML` template string, and its CSS `content:"\2212"` (the minus on the open "Show all" toggle) is an octal escape, which JavaScript refuses inside a template literal. The whole render script failed to parse, so the page showed the CRM chrome and nothing else from then on. Now `"\\2212"`, which writes the same CSS. Checked: every inline script in `crm/traffic.html` parses, and the page renders all four sections locally; deployed 80aa3a74.
- **For the next port:** a traffic-kit block pasted into a JS template needs its backslashes doubled. NWD's and the network's traffic pages carry the block as plain HTML and parse clean.

## 2026-10-03 (receivables PDF and P&L show all income)
- **What the client asked for:** Michael: "the receivables report in the crm isn't showing all receivables on the pdf download", then "make sure all P&L and receivables show all income."
- **Receivables PDF (and CSV):** the screen showed open invoices *and* the Remaining balances (booked job value not yet invoiced), with Total owed = both; the PDF and CSV printed only the open invoices. Live on 2026-10-03 that meant $1,423.05 of $22,898.71. `crm/reports.html → brandedReceivablesHTML()` now carries Total owed / Billed / Overdue / Remaining balance, the Remaining balances table with its total, and a note on what each figure is; the CSV adds the same table and Total owed.
- **Wall-finishing income was missing from the P&L and the job card:** accepting a `wallprep` proposal (`_lib/lifecycle.js`) wrote the closet alone as the job price and parked the wall amount in `job_financials.wall_total_cents`, which nothing has read since the wall became a line inside the gross. Wonda Askew (#66) was short $850 and Derek Smith (#69) $750. `resolveFinancials` now folds a legacy `wall_total_cents` back in as the wall-charged line (no D1 change; saving the card itemizes it), and new wallprep contracts write the whole price with closet and wall as the charged lines. `wall_total_cents` added to the P&L, jobs list, payables and cash-flow queries.
- **Jobs invoiced outside the won stages:** Shoe Tower — Don Bruce (#57) has an accepted $640 proposal and a paid $284.20 deposit but its card is still "proposed", so the P&L left it out and receivables skipped its $355.80 balance. Both reports now count any job with a non-void invoice, and the P&L never reports a job's revenue below what was invoiced on it.
- **Checked against the live D1:** 26 paid invoices, $72,148.80, every payment tied to an invoice and every invoice to a job; the P&L (all time) now $95,132.29 across 15 jobs (was $92,892.29 across 14). Lesia Wood (#44) stays as itemized on her card ($11,141.98, $84.78 over the contract). The rendered receivables PDF checked in the browser pane with the live figures. Deployed b3ba0a60.
- **For Michael:** move the Shoe Tower job (#57) to Booked if the work is going ahead; it reports correctly either way now.

## 2026-10-02 (Klarna removed from Stripe and the site)
- **What the client asked for:** Michael: "remove Klarna from stripe options and from the website. Don't use or offer klarna any where on the site or in stripe."
- **Stripe:** Klarna's display preference set to `off` in the default payment method configuration on the live account (`pmc_1TdEkIFwmijYgch11rn42XgR`) and the sandbox (`pmc_1TdEkcFp54lWWmFAsyQaE1wV`), over the API. This closes the "turn off Klarna" open item.
- **Code, so it can't come back from the Dashboard:** `_lib/stripe.js` exports `EXCLUDED_PAYMENT_METHODS = ["klarna"]` and sends it as `excluded_payment_method_types` on every PaymentIntent (tested on the sandbox with API version 2024-06-20: the parameter is accepted and Klarna is left off the intent). The invoice endpoint's `piAcceptable` now recreates a stored intent that still lists Klarna, and the idempotency key went from `_v3` to `_v4` so a recreated intent isn't the cached old one. The one open invoice with an intent (INV-2026-0032) is processing and isn't touched. `/invoice` dropped `klarna` from `paymentMethodOrder`. In the CRM, "Klarna" is gone from the record-a-payment method picker and from the method labels. The live D1 had no Klarna text in templates, contracts or email templates and no Klarna payments.
- **Copy:** `/proposal` no longer offers Klarna ("card, bank transfer (ACH) or digital wallet"). `/faq`'s "Do you require a deposit, and do you offer financing or buy now, pay later?" (answered "Yes to both") is now "Do you require a deposit, and how do payments work?", answered "Yes." The FAQPage schema follows from the build. `/custom-closet-cost-nashville`'s "Use financing wisely — flexible payments" tip is now the three-step payments. The page-factory sources (`sections/7-faq.html`, `sections/head.html`) and the seed contract template in migration 0006 no longer carry the old Klarna paragraph, so a rebuild can't bring it back.
- Deployed 98c42fd6; no page on nationalclosetco.com contains "Klarna" or "pay later"; submitted (IndexNow 2 URLs, Search Console, Bing).
- **Affirm too (Michael: "remove affirm as well"):** its display preference was "on" in both configurations, though Stripe had it unavailable, so it was never offered. It is now `off` on live and sandbox, and `EXCLUDED_PAYMENT_METHODS` is `["klarna", "affirm"]` (sandbox test: both left off the intent). No page ever named Affirm. Deployed 25e8e096; no page content changed, so nothing to submit.

## 2026-10-01 (honeypot hidden from autofill; every dropped submission kept)
- **Why:** on 2026-10-01 cabinetmakerpro.com dropped a real contact-form submission: Chrome autofilled the honeypot `zq7x`, which was only positioned off-screen, so the endpoint treated the visitor as a bot, answered `{ok:true}` without saving, and left nothing but a console line. Michael asked for the same fix on every site with the same code. This site's honeypot is `hp_url`, injected into each `form[data-lead]` by `js/main.js`.
- **What changed:**
  - `js/main.js`: the `hp_url` input is `display:none!important` (was off-screen at `left:-9999px`). Browsers don't autofill a field they can't focus; a script reading the HTML still fills it. The field's name, `tabIndex`, `autocomplete="off"` and `aria-hidden` are unchanged, and `FormData` still carries it.
  - `functions/_lib/spam.js` → `botReason`: an `hp_url` value that is contained in, or contains, the submitted `name`, `email`, `phone`, `address_street`, `address_city`, `address_zip` or `zip` is autofill and no longer a drop. A real drop's reason now carries the value (`honeypot: …`, first 60 characters).
  - `functions/api/contact.js` and `functions/api/lead.js`: a `botReason`/Turnstile drop is inserted into D1 `lead_drops` (reason, name, email, phone, message, page, country, hp_ms, ua) inside try/catch before the `{ok:true}` answer, so a failure can never change the response. Never emailed, never put in `leads`. The `spamReason` paths are unchanged (`contact.js` still emails a "[Filtered — please review]" alert; `lead.js` still drops those without a record, as before).
  - `crm/migrations/0072_lead_drops.sql` (site-kit's `lead_drops` SQL), applied the way this repo applies its migrations: `npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0072_lead_drops.sql`. `docs/crm.md`, `docs/tracking.md` and `site.json` say so.
- **Verified:** `node build.mjs` (`build.check` is null; `site-kit check` has nothing to see here since the honeypot is injected by script). `botReason` in node: honeypot equal to the name or phone → null, `http://bot.example` → `honeypot: http://bot.example`. Deployed `5a0eda0e`; the live `/js/main.js` carries `display:none!important`; bot-shaped JSON POSTs to `/api/contact` and `/api/lead` both answered `{"ok":true}`, left no lead, and each left one `lead_drops` row, which were then deleted. The `main.js?v=ncc128` pin is unchanged: `.js` is served `max-age=600, must-revalidate`, so visitors have the new file within ten minutes.
- **Lost leads, read-only look:** `leads` per month: June 4, July 15, August 12, September 10 (41 in all). Page views (pageviews table starts 2026-07-26): July 1,971, August 9,076, September 3,320. This D1 keeps no form-start or submit events, so there is nothing to compare the leads against. The lead count held steady through the months, which doesn't suggest a stretch of dropped leads, but drops before today left no trace and can't be checked.
- **Still owed:** read `lead_drops` after a few weeks.

## 2026-10-01 (Noah Blair removed from the CRM)
- **Why:** Michael: "yes remove noah from the crm" (the open item from the owner change above).
- **Live D1:** `team_members` #2, Noah Blair (noah@blaircustominteriors.com), set `active = 0`, exactly what the Team page's Remove does (`DELETE /api/team/[id]`). He had no upcoming consult assignments to drop, and an `activity_log` row records the change. He no longer appears in the assign pickers or the roster. He no longer gets the morning consult brief, including the "nobody assigned → the whole active roster" fallback, which is now Michael alone.
- **Kept as history:** his past assignments, the 2026-09-23 consult (appointment #40) and jobs #48 (installing, install 2026-10-01) and #49 (completed). They only display; nothing sends on a job assignment. Never a hard delete: assignments cascade on delete.
- `docs/crm.md` and a comment in `functions/api/team/index.js` updated. No deploy needed: data only.

## 2026-10-01 (the Bible verse removed)
- **Why:** Michael: "remove the bible quote from national closet."
- **/about** foundation paragraph (`stage4.py → FAITH_P`): the Colossians 3:23 sentence and the verse are removed. The sentence after it, which explained the verse, now stands alone: "We are dedicated to excellence, to treating others with respect and fairness, and to the belief that a job worth doing is worth doing right." The rest of the paragraph and the "A faith-based business, built on integrity" heading are unchanged. No other page quoted scripture.
- `css/styles.css`: the now-unused `.faith__p q.verse` rule is removed, and the homepage's inline copy re-synced by the sweep. Deployed `7378f1ff`, submitted (1 URL).

## 2026-10-01 (Michael Blair the only owner)
- **Why:** Michael: "remove noah blair, only michael blair is the owner."
- **/about** (built by `stage4.py → build_about_page`): Noah Blair's card and his Person schema node are removed. Michael is "Founder & Owner" on the card and in the schema (was "Co-Owner"), and the Organization's `employee` lists only him. The note reads "One owner, one crew, every project." The foundation paragraph now opens "Michael Blair built National Closet Company on a simple foundation…" and continues in the company's "we" (same values, same verse). No other public page named Noah.
- **Kept as written:** the Google review quoted on /about, /reviews and the cabinets page ("The owners are wonderful people…"); it is the customer's own words.
- **Not changed, waiting on Michael:** the CRM roster still has Noah Blair (noah@blaircustominteriors.com, role `owner`). He is assigned to consults and receives the morning consult brief. Removing him or changing his role there changes who gets the briefs.
- `CLAUDE.md`, `site.json → client.contact` and a comment in `functions/api/team/index.js` updated. Deployed `a53b89c8`, submitted (1 URL).

## 2026-10-01 (readable lead alerts; Blair Custom Interiors removed from the site)
- **Why (alerts):** Michael said the contact forms were "sending garbled messages" that looked like spam. They were real leads. The form asks for a name and phone only, and the alert went out at that moment printing every other field empty: "Email (not given — ask on the call)", "Address ,", a Maps link to ", ,", "Considering (not specified)", "(no message)". Whatever the customer then added on the details step was saved to the CRM with no email at all. The example he forwarded: Catherine O'Mara (lead #85, 2026-09-30) added her email, Reach-In Closet, 1706 Stewart Place and a note, and none of it reached the inbox.
- **`functions/_lib/lead-alert.js` → `sendLeadAlert()`**, used by `/api/contact` and `/api/contact-address`: lists only the fields given (Name, Phone, Email, Space, Address on one line, the page the form was on, the customer's note), plus Text and Open-in-CRM buttons. The details step now sends a second alert, "<name> added details…", with everything known, Reply-To the customer, in the same Gmail thread (the first alert's Message-ID is `<lead-<id>.alert@nationalclosetco.com>`; `sendStaffAlert` now passes `inReplyTo`/`references`). The spam-filtered "[Filtered — please review]" alert is unchanged.
- **Checked:** both alerts rendered with a stubbed sender for lead #85's data (name + phone only; then everything). Not tested with a live submission: a preview shares the live D1, so a test would be a real lead and a real email. The next real lead is the test.
- **Why (Blair Custom Interiors):** Michael asked to remove every mention. Gone from all 70 public pages, `llms.txt` and the privacy page: the top bar is back to "Family-owned · Serving Nashville & all of Middle TN"; the drawer line, the footer parent block and the copyright mention are removed; `parentOrganization` is out of every schema block; the copy sentences that named it are cut. The "parent company coordinates the licensed plumbing and electrical trades" claim went too (cabinets FAQ and the cabinets page), and so did the About FAQ "Are you part of Blair Custom Interiors?". About's description is now "Meet the family behind National Closet Company in Gallatin, TN: …".
- **`tools/site-build/stage4.py`:** the sweep now *removes* the parent company (`PARENT_SUBS`, `strip_parent()`) instead of adding it, so a re-run can never put it back; the About and Cabinets pages are rebuilt from cleaned text. `stage5_privacy.py`, `css/styles.css` (a comment), the site-build README, `site.json → client.name`, two `_middleware.js` comments, `CLAUDE.md` (a standing call) and `docs/design.md` are updated to match.
- **Left on purpose (internal, never served):** the team's @blaircustominteriors.com mailboxes (the roster, migration 0070, the consult brief), the history in this CHANGELOG, and `docs/google-ads.md`'s note that BCI runs its own closet ads.
- Deployed `ad827c39`, submitted (70 URLs: IndexNow 200, Search Console, Bing).

## 2026-09-30 (completing a job sends the final invoice; Send on a phone)
- **Why:** Michael marked the Marquart job (#49) Completed today and no final invoice went out. The job had been moved to Installing on 2026-09-26, four days before its install date (2026-09-30), and that raised and emailed the balance, INV-2026-0031, $4,536.51 (the last 50%, no scheduling invoice having been raised), with the "we're installing today" email. Completion then asked for the balance again, `createInvoice` found it and returned without a word. Still unpaid today.
- **`_lib/invoices.js → billOnCompletion()`**, called by `PATCH /api/projects/[id]` on a move to `completed` instead of the bare balance: raises the balance if it never was; bills any money still uninvoiced as one `custom` invoice, "Final payment — remaining project balance"; re-sends the balance invoice if it is open and not fully paid, unless it was raised in the last 12 hours; logs `invoice-resent`. `sendInvoiceEmail` now shows what is left on an invoice (amount − paid), which is all the pay page charges, so a re-send after a partial payment asks for the rest.
- **Checked:** the function against an in-memory copy of the schema and migrations: never billed → one balance invoice; balance unpaid 4 days → re-sent; balance raised 3 hours ago → nothing; balance paid → nothing; contract $1,000 above what was invoiced → a $1,000 invoice plus the re-send.
- **Sending an invoice from a phone** (Michael: "there's no way to send the invoice from the CRM mobile"). The job's Invoices tab had no Send at all (`resendInvoice()` in `project.html` was never called), and at 375px each invoice row's pinned first cell filled the screen, leaving the amount and the buttons out of reach. Now each outstanding invoice has **✉️ Send** (asks first, then emails it with its pay link), and at ≤700px `.inv-tbl` lays each invoice out as a card with its buttons wrapped underneath (`crm-app.css`). CSS pin `ncc122` on the 27 CRM pages. Checked in the browser at 375px (every button on screen, no sideways scroll) and 1280px (one row, as before).
- **Owed:** deploy (not done from the cloud session: no credentials there). The Marquarts' INV-2026-0031 was not re-sent by this change: after the deploy, Send on it (the job's Invoices tab, or the invoice itself) does it.

## 2026-09-29 (self-booking removed: customers ask, a designer texts to set the visit)
- **Why:** Michael asked to remove the feature where visitors schedule their own appointments on the site. Two consults were ever self-booked (source `web`, the last on 2026-09-27); 31 were booked by staff in the CRM.
- **Every CTA → `/#consult`** (the request form), about 500 links on 73 pages and in the factory (`stage4.py`): the header "Free Design", the drawer, the mobile bar, the footer, the in-page buttons, the home page's service cards. Labels kept. The "— or pick your time now →" / "book it now →" clauses after the forms are gone. `js/main.js`: a page with its own `id="consult"` form scrolls to it and focuses the name field instead of leaving for the home page; `consult_cta_click` counts `/#consult` too.
- **The form's second step** no longer offers "Pick my visit time now"; it says a designer texts within one business day, then the optional details. `ncc_lead` (sessionStorage, only for prefilling the booking page) is gone. The welcome email (`_lib/lead-ack.js`) no longer links to a booking page.
- **`/book/` is cancel-only:** `/book/?cancel=<token>` (the link in confirmation and reminder emails, staff-booked visits included, and the install invite) still cancels through `/api/public/cancel`, with "call/text to reschedule". The bare `/book/` 301s to `/#consult` (`_middleware.js`). The page stays noindex and out of the sitemap.
- **Deleted:** `functions/api/public/book.js`, `public/slots.js`, `functions/api/availability/`, `crm/availability.html` (its only use was the public slot grid), its CRM nav entries and the calendar's "Edit availability" button, the unused `.slot` CSS. The `availability_rules` / `availability_blocks` tables stay in D1, unused. The contract page's install picker was already never called; untouched.
- **Privacy page** (`stage5_privacy.py`, regenerated): no booking page, no `ncc_lead`; visit confirmations and the offline `booked_consultation` are for visits we set up. Thank-you meta: "requesting", not "booking". Cache pins: pages `ncc128`, CRM `crm-app.js` `ncc111`.
- **Manual:** standing call "no self-booking" in `CLAUDE.md`; `docs/tracking.md` and `docs/crm.md` updated.

## 2026-09-28 (the new-post steps are in the manual)
- `CLAUDE.md` and `docs/content.md` now give the full order for a new post: `stage4.py`, then `apply-alt.mjs`, then `node build.mjs`. The byline entry below found that order (the sweep rewrites some alt text), but until now it was only in its "Owed" line. `/blog-post` in fleet sends every post through the site's own steps from this manual.

## 2026-09-28 (every post signed by Michael Blair, with a byline under the title)
- **Why:** the estate rule since today (`~/fleet/docs/content-standards.md` §7, `~/fleet/skills/blog-post/SKILL.md`): posts on our own sites are signed by Michael Blair. This is one of ours (`site.json → client.contact` "Michael Blair & Noah Blair"), and `fleet audit` failed it: "30 post(s) not signed by Michael Blair", every BlogPosting's `author` being the Organization. Michael asked for the author to be his Person node and a visible byline on each post, made by the generator so the next build keeps it.
- **The generator:** `tools/site-build/stage4.py` gains `AUTHOR` (Person: "Michael Blair", url `https://nashvilleswebdesign.com/about/`, sameAs that and `https://zorvalabs.com/team/michael-blair`) and `sweep_posts()`, run in part 1 after the credit sweep. It sets `author` on every BlogPosting (the 29 posts' own nodes and the 29 in `/closet-cases`' `blogPost` list) and on the pricing guide's `Article` (`/custom-closet-cost-nashville`, which the first run missed and `blog-post byline` then named; the `publisher` stays National Closet Company, untouched) and puts on those 30 pages `<p class="byline">By <a href="/about#michael-blair">Michael Blair</a> · <time datetime="…">…</time></p>` under each post's h1, dated by its `datePublished`. Idempotent: a second run changes nothing. The byline links to his bio on `/about`, not off the site.
- **`css/styles.css`:** `.phero .byline` (0.95rem, 600, `--muted` on `--fog`, 4.8:1, the breadcrumb's pair; the name in `--ink`, underlined), re-synced into `index.html`'s inline stylesheet. No pin bump: the CSS is cached 10 minutes.
- **`ROOT` in `chrome.py` and `stage4.py`** is now the checkout the script sits in, not the main clone's path, so a run from a worktree edits the worktree (it used to edit `~/nationalcloset-site`). `tools/site-build/README.md`, `docs/content.md` and `CLAUDE.md` say how posts are signed.
- **Checked:** `stage4.py` then `tools/images/apply-alt.mjs`: 29 posts and `closet-cases.html` changed, nothing else but the CSS; `node build.mjs` (lastmod: the 30 changed pages dated today, 40 kept). In the browser pane at 375px: the byline under the title, 20px gutters, no sideways scroll.
- **Deployed** `c63f13d2` (the posts), then `dbab1f23` (the pricing guide); live pages serve the Person author and the byline; submitted (IndexNow 30 URLs then 1, 200; Search Console; Bing).
- **Held:** `node ~/fleet/skills/blog-post/bin/blog-post.mjs byline nationalcloset` → "every post on the built site is signed right" (exit 0); `fleet audit` exit 0, nothing on nationalcloset.
- **Owed:** nothing. A new post: run `stage4.py` (and `apply-alt.mjs`) before building, or write the byline and author as the sweep does.

## 2026-09-28 (the privacy page names the tags' ids and cookies, the geo-gate and Cloudflare's beacon)
- **Why:** site-kit `check` has a Privacy step since `3893e37` (rulebook 8, `~/fleet/docs/content-standards.md` §5). Over every live site it found yesterday's page naming Google Analytics without the id the pages load, `G-EJEDXZZWJN`. Michael asked for each flagged page to say what the site's code does.
- **`tools/site-build/stage5_privacy.py` → `privacy.html`** (the factory, then the page it writes), three additions and the date:
  - "Each of them sets cookies of its own" now names them: GA4 `G-EJEDXZZWJN` → `_ga`, `_ga_EJEDXZZWJN`; the Ads tag `AW-18306256681` (`js/main.js → GADS_ID`, still configured though the ads stopped 2026-09-22) → `_gcl_au`, and `_gcl_aw` after an ad click; the Meta Pixel → `_fbp`, and `_fbc` after a Facebook or Instagram ad click;
  - the visit log paragraph says what it implied: visits from outside the United States are turned away (`ALLOWED_COUNTRIES` in the middleware);
  - Cloudflare's own Web Analytics script: Cloudflare injects it into every page on the live domain (not in the repo, so the build and `check` never see it) and `_headers`' CSP allows `static.cloudflareinsights.com`. It reports load speed and the page, and sets no cookies;
  - "Last updated September 28, 2026". The factory's docstring lists where the ids and the beacon come from.
- **Checked:** `python3 tools/site-build/stage5_privacy.py` (only these lines changed), `node build.mjs` (lastmod: `/privacy` only); `site-kit check .` → Privacy "✓ /privacy is linked from every page and names what they load: G-EJEDXZZWJN, Cloudflare Turnstile, Google Fonts, the Google Ads tag, the Meta Pixel, Stripe". In the browser pane at 375px: no overflow, the new lines, the date.
- **Deployed** `97e28440`; submitted (IndexNow 1 URL, 200; Search Console; Bing).
- **Owed:** as before, the page changes with the code (a new tag, a form field, the ads coming back, `ncc_attr`'s rules).

## 2026-09-27 (a privacy page, linked from every page's footer)
- **Why:** the estate's scanner (core 4.0, check `about-privacy`, rulebook rule 8) found no privacy policy linked from the home page, and `/privacy` answered 404. Michael asked for one on every site that lacked it: what the site's own forms and analytics keep, read from the repo, in the business's name.
- **`/privacy` (`privacy.html`)**, built with the page factory (`tools/site-build/stage5_privacy.py`, which writes that page and nothing else; its docstring names the code each paragraph comes from). The phero, then the warranty page's `.prose`. What it says:
  - the forms: name and phone, then optional email, space, address and note (`js/main.js`, `/api/contact-address`); the booking page's fields (`functions/api/public/book.js`); what a lead row keeps besides (source page, landing page, referrer, click id and UTM tags, user agent, the truncated SHA-256 of the IP, the GA4 client and session ids; `functions/api/contact.js`);
  - the mail: from hello@ over Google Workspace (welcome, booking confirmation, the morning reminder, proposal, contract, invoices, review requests), the inbox sync that files mail to hello@ with the contact, and the team's consult brief (`docs/automations.md`);
  - proposals, contracts, invoices: private links; what a signature records (name, email, drawn signature, time, user agent, IP hash); Stripe on the invoice page; project files on Cloudflare (R2);
  - Google Analytics, the Google Ads tag and the Meta Pixel: what they're told (`track()`), the `user_data` handed to the Google tag on a saved request, and the booked consults sent to GA4 by `scripts/ads-offline-conversions.mjs`;
  - the edge log (US page views: page, referrer, UTM, click id flag, state and country; no IP) and the seconds-on-page beacon;
  - `ncc_attr` (localStorage, until cleared) and `ncc_lead` (sessionStorage, removed on booking);
  - Cloudflare and Turnstile, Google Fonts (76 of 78 public pages load it), the "Text a photo" link;
  - how to ask what we hold or have it corrected or deleted: hello@ or 629-298-8241.
  No retention period is stated, since none is set.
- Title "Privacy Policy | National Closet Company" (40), description 146, canonical, OG and Twitter image (`/img/hero-closet-og.jpg`, the factory's head), `WebPage` + `BreadcrumbList`. In `sitemap.xml` (yearly, 0.3).
- **The footer link:** `stage4.py`'s chrome sweep gains one idempotent step, Privacy after FAQ in the footer's Company column, and was run over every page: 72 pages, one line each, nothing else changed. The pages with no footer: `404.html` gets it in its links row, the proposal's two footers and the invoice's footer line get it. The estimate and contract pages (no footer on screen), `/thanks/` and `calc.html` don't.
- **Checked:** `node build.mjs` (272 files; lastmod: only `/privacy` new); `site-kit check` finds nothing on the new page (its 42 problems are the earlier titles, descriptions and schema items). In the browser pane at 375px: no sideways scroll, 20px gutters, one h1, the footer link.
- **Deployed** `a2dcf4cb`; submitted (IndexNow 1 URL, 200; Search Console; Bing). Live `/privacy` 200.
- **Scanner** (`--no-psi`): 96, `about-privacy` **pass**: "The home page links an About page (/about) and a privacy policy (/privacy)."
- **Owed:** change the page with the code: a new tag, a form field, the ads coming back, `ncc_attr`'s rules.

## 2026-09-26 (the FAQ schema is the visible FAQ: one list, written by the build)
- **The finding** (Michael): the live site served FAQPage JSON-LD its pages don't show. Every sitemap URL was fetched, and each Question's name and answer were looked for in the page's visible text. 64 pages carried a FAQPage, with 453 questions, and 52 didn't match:
  - `/faq`: 1 question not on the page ("Does National Closet Company have reviews?") and 32 answers not the page's;
  - `/`: 6 answers;
  - `/blog/closet-shelf-depth-12-vs-14`: 2 questions and 3 answers;
  - `/blog/fake-discounts-65-percent-off`: 1 question and 4 answers;
  - `/custom-pantry-nashville`: 1 question, whose name carried `&ldquo;`/`&rdquo;` as text;
  - `/warranty` and `/work-with-us`: 1 answer each.

  Google's FAQ rules want the markup to describe what the page shows, and ours say the visible FAQ and the schema come from one source.
- **Where it came from.** Every page kept its own copy of its questions in its JSON-LD (64 standalone blocks, and one node in `/work-with-us`'s `@graph`), written apart from the accordion:
  - The home page's copy has been a third-person, no-contraction version of its answers for as far back as this repo goes (2026-08-01). `/faq` was built on 2026-09-10 (`stage1.py`), with its accordion taken from the home page's FAQ section and its FAQPage from the old home page's head: that same copy. So it never matched, and it asked "Does National Closet Company have reviews?" over a visible "Do you have reviews I can read?".
  - Both posts have carried a different FAQ in their schema from the one they show since they were published (2026-08-01 and 2026-08-02).
  - The pantry question: the 2026-08-26 script that added the accordions escaped its quote marks twice, so since then the page itself has shown "&ldquo;custom&rdquo;" as text.
  - `/warranty` and `/work-with-us` matched in the repo. Live, Cloudflare's Email Address Obfuscation (on for the zone, as on every estate zone) served the address in each answer as "[email protected]", while the schema carried it. `/faq`'s "How do I get started?" was the same.
  - 25 more pages (the 19 city pages and six of the competitor pages) had `&ldquo;`/`&rdquo;` as text in 27 answers, where the page shows quote marks. Both checks drop entities, so they counted these as matching.
- **The fix: the visible FAQ is the list** (the Harmony Tax and Nittany Tax fix of the same day).
  - The FAQPage is gone from all 65 pages that had one (`/free-design` too). It was cut by its text span: every other JSON-LD block is byte-identical, and `/work-with-us`'s graph parses back to itself minus the node. The home page's `JSON-LD: FAQ` comment now says where the FAQPage comes from.
  - `build.mjs` writes each page's FAQPage into `dist/` from what the page shows, word for word (`@id` = canonical + `#faq`). It reads the `.faq__item` accordion, or, on the 8 posts without one, the `<p><strong>Question?</strong><br>Answer</p>` paragraphs under "Frequently asked questions". Entity names are matched with their case (`&Prime;` is ″, `&prime;` is ′), because the discounts answer on `/` and three answers on `/faq` write 14″ as `14&Prime;`.
  - The build stops on a page that carries its own FAQPage, an item it can't read, an entity it can't decode, or an email address in an answer outside `<!--email_off-->…<!--/email_off-->`. On a throwaway copy, each case stopped it (exit 1, no dated sitemap): a FAQPage put back on the home page, the warranty address unfenced, the pantry question escaped twice again, a post's list unreadable, a `<div>` in an answer, and an item the reader misses.
  - `stage4.py`'s two builders (`/custom-cabinets-nashville`, `/about`) now write the accordion from their lists and no FAQPage.
- **What visitors see changed in two places only:**
  - The pantry question reads “custom” in quote marks.
  - The three addresses are fenced with `<!--email_off-->`, so Cloudflare serves them as written. The fence closes after the punctuation that follows the address, so the words site-kit hashes don't move.

  No wording changed. The two schema questions with nothing on their page were dropped rather than shown, because a visible item already answers each:
  - the shelf-depth post's "Is 12-inch depth ever the right choice for a closet?": its visible "Does National Closet Company build 12-inch or 14-inch closets?" says when 12 inches is right;
  - the fake-discounts post's "Are stacked closet discounts real?": its first answer and its FTC answer.

  The schema now asks what the pages ask: "Do you have reviews I can read?", "Why do closet companies use 12-inch shelves?", "What does the FTC say about "regular price" claims?".
- **Found on the way, in the page factory:** re-running `stage4.py` would have undone two live changes. Its credit sweep wrote the footer credit as a followed link on 72 pages (every credit is nofollow since 2026-09-19). It also put back "a walnut island" in the cabinets page's hero caption, under the 2026-09-22 picture of a paneled range hood. Both are fixed. Run on a scratch copy of this checkout, `stage4.py` and then `apply-alt.mjs` now rebuild every committed page byte for byte.
- **The dates.** Moving the FAQPage out of the pages changed every page's structured data, so `site-kit lastmod` would have dated 64 pages today.
  - 34 of them say exactly what they said. They have the same questions and answers, and the block is only re-serialized: at the end of `<head>`, with an `@id` and `upvoteCount`. Their new hashes went into `.indexnow.json` with their dates kept.
  - The hashes came from site-kit's own `hashHtml`, lifted from its source at run time. It first reproduced all 69 recorded hashes from the pre-change build.
  - The 30 whose schema text changed are dated today: the 4 with drifted words, and the 26 with entities as text (the pantry page among them).
- **Checked:**
  - `node build.mjs`: FAQPage written on 65 pages, 456 questions. `lastmod`: 39 dates kept, 30 dated 2026-09-26.
  - `site-kit check .`: "every FAQPage question and answer is on its page (452 question(s) on 64 page(s))", down from 5 questions and 45 answers. The shelf-depth post's "fewer than four questions" warning is gone. It reports 43 problems, down from 51; the other 43 are the ones it reported before (titles and descriptions, the SearchAction, image licenses, robots groups, contrast, alt text, two stock phrases, a /traffic under another path).
  - A strict audit of `dist/` (each schema item equal to the page's item): 456 of 456.
  - In the browser pane, on `dist/` served locally (`nationalcloset-dist`, new in `.claude/launch.json`):
    - the browser's own parser, on all 65 pages: schema = the rendered FAQ text, 456 of 456;
    - the pantry question at 1280 and 375 wide, with no overflow;
    - the three fenced answers read as before.
- **Deployed** `53889979` (production).
- **Submitted:** IndexNow took the 30 changed URLs (200), the sitemap was resubmitted to Search Console, and Bing has it.
- **Verified live:**
  - All 69 sitemap URLs fetched (200). 64 pages carry a FAQPage, with 452 questions; every question and answer is in the page's visible text, and each page's FAQ equals its schema, item for item.
  - No answer shows "[email protected]".
  - The sitemap dates 30 URLs 2026-09-26 and keeps the other 39 dates.
  - nationalcloset.pages.dev is still `noindex, nofollow`.
- `CLAUDE.md` (a rule), `docs/content.md` (The FAQs), `docs/tracking.md` (the two previews) and `tools/site-build/README.md` say so.
- **Owed:** nothing for this. To add or change a question, edit it on the page; on `/custom-cabinets-nashville` and `/about`, edit it in `stage4.py` too. `chrome.py` and `stage4.py` still name the main checkout as `ROOT`, so run from a worktree they edit `~/nationalcloset-site`.

## 2026-09-26 (/traffic: Lead Gen Digital Marketing's scanner is ours, never a visit)
- leadgendigitalmarketing.com now runs a free scan. Its fetches carry `LeadGenDigitalScanner` in a Chrome user agent, and nothing here named it, so the middleware took the scanner for a person and logged a scan's first page as a visit. Michael asked for it on every site's own-checks list, beside our other two scanners.
- `functions/_middleware.js`: the token joins the `// our-checks:` needles in `BOT_UA` (traffic-kit `bin/add-our-checks.mjs`, `ccf9c82`). This site drops bots unlogged, so a scan is now neither logged nor counted, and like any bot here it passes the geo gate.
- Built, deployed (`218f0ad3`, production confirmed through the Pages API), submitted (nothing had changed). `traffic-kit check`: our checks ✓; its warning about opened prefetches was there before and is unrelated. Live: a request with the scanner's user agent to the new deployment got a 200 and left no page view, where a person's is logged on any host.
- **Owed:** nothing.

## 2026-09-25 (Central time from the zone in every sweep; the six missing posts in the sitemap)
- Michael: "yes, fix the daylight saving bug and the sitemap". Both were owed in the manual-split entry below.
- **Daylight saving.** The DB stores naive Central wall-clock strings, and four things read Central as a flat UTC-5, which is right only in daylight time. From 2026-11-01 (standard time, UTC-6) they would have been an hour off:
  - the customer's reminder would have gone at 6am, not 7am;
  - review requests would have run 8am–7pm instead of 9am–8pm;
  - a job would have flipped to installing, and its balance would have been billed, at 11pm the evening before the install date;
  - the traffic page's "today" would have started at 11pm the evening before, and its hour-of-day chart would have run an hour late.
- **The fix:**
  - `functions/_lib/dates.js` gains `centralAt(ms)`, `centralNow()` and `centralMidnightUtc(date)`, all through the IANA zone like `todayCentral()`. `centralNow()` moved from `consult-brief.js`, which re-exports it.
  - `appointment-reminders.js` and `review-requests.js` bind Central "now" into their SQL. `internal/advance-jobs.js` binds `todayCentral()`. `traffic.js` dates "today" and each hour bucket through the zone.
  - `traffic-channels.js` starts "today" at Central midnight in UTC (05:00 or 06:00), written into the SQL because that endpoint's last query takes no parameter.
  - No flat offset is left in `functions/`.
- **Checked:**
  - The helpers at 14 instants: daylight time; the 2026-11-01 fall-back, including the 1:30am that happens twice; standard time; midnight on both changeover days of 2026–27.
  - The real sweep code against a fake D1 with the clock pinned (10 checks):
    - reminders: none at 6:30am CST, and at 7:30am CST the query carries `2026-11-02T07:30:00`;
    - reviews: they run at 7:30pm CST, and not at 8:30pm or 8:30am;
    - install day: at 11:30pm CST on Nov 2 the query asks for jobs due by 2026-11-02 (the old code said 11-03), and at midnight by 11-03;
    - in daylight time, as today, every answer is the old code's.
  - The two traffic endpoints the same way (7 checks), across the change too.
  - SQLite reads the bound `YYYY-MM-DDTHH:MM:SS` form the same way as the stored datetimes.
  - After the deploy, one run of `/api/internal/advance-jobs` on production, the cron's own sweep: HTTP 200, `ok:true`, nothing due.
- **The sitemap.** Six posts had been live, indexable and linked from `/closet-cases` since 2026-08-19, but were never in `sitemap.xml`, so `site-kit submit` had never sent them: `best-closet-company`, `closet-installation-cost`, `contractor-cost-to-build-a-closet`, `custom-pantry-design`, `home-depot-lowes-closet-installation` and `what-closet-company-does-costco-use`. They're in it now (monthly, 0.7, like the other posts), for 69 URLs.
- **Their dates.** `site-kit lastmod` dates a page new to the sitemap today, and none of the six changed today.
  - First deploy (`8a226e1b`): IndexNow accepted the six, Search Console got the sitemap again, and Bing has it.
  - Then each post's `changed` in `.indexnow.json` was set to 2026-09-17, the last commit that changed what it says. That came from `site-kit lastmod --history` into a scratch state; the later commits were header and footer sweeps. The same method gives the recorded date for all 63 pages already listed.
  - Rebuilt and deployed again (`c8068a8f`). The live sitemap carries 2026-09-17 for the six, and `submit` found nothing new.
- `docs/automations.md` and `docs/content.md` say so, and `CLAUDE.md` gains two rules: Central time comes from `_lib/dates.js`, and a new page or post goes into `sitemap.xml` the day it goes live.
- **Owed:** nothing from this change. The other items owed in the entry below stand.

## 2026-09-25 (the manual split: CLAUDE.md under 14,000)
- **`CLAUDE.md` went from 17,217 to 10,964 characters, under `fleet audit`'s 14,000** (Michael: "trim those five too"). It loads into every session, so it now keeps only what the site is, the rules for every change, build and deploy, a map, the accounts and the open items. The detail moved to `docs/`, one file per part, the way Blair Custom Interiors', Nittany Tax's and Zorva's manuals were split today:
  - `docs/content.md`: the pages, the page factory, the payment terms and the services, the service vocabulary.
  - `docs/design.md`: the look, the header, the components, the home page's inline stylesheet, the landing page, the generated pictures and their alt text.
  - `docs/crm.md`: sign-in, the pipeline and the contracts, invoices and Stripe, the customer's pages, the team and assignment, the CRM on a phone and its contrast, mail templates and times, the D1 and its migrations.
  - `docs/automations.md`: mail, and the cron Worker's sweeps: install day, the customer's reminder, the consult brief, review requests, proposal expiry, the inbound sync.
  - `docs/tracking.md`: the lead forms, GA4, the Ads tag and the Meta pixel, the CSP, the local preview.
  - `docs/traffic.md`: `/crm/traffic`, meaning what the edge logs and drops, the views, and the panels and their sources.
  - `docs/google-ads.md`: the stopped campaign as it ran, the conversions, the daily launchd job and its scripts, what Google refuses.

  `build.mjs` copies into `dist/` only the root `.html` pages, its named files, the IndexNow key and the folders in `DIRS` (`blog`, `book`, `contract`, `crm`, `css`, `estimate`, `fonts`, `img`, `invoice`, `js`, `proposal`, `thanks`), skipping any `.md` inside them, and `site.json → deploy.command` deploys `dist/`. So `docs/` never reaches the site.
- **Deleted, because this log already records it:** when custom cabinets became a service (2026-09-17); which repo files a root deploy served until 2026-09-23; the date of the owner's ballpark ranges (2026-09-13); the dates of the CRM's phone and contrast passes, the amber pill's old ratio and `--crew-deep` folded into `--accent-text` (2026-09-22); every place Murphy beds and wall beds were removed from (2026-09-22).
- **Moved here, because the log lacked it:** nothing. The one date the log lacks, the landing-page test's decision about 2026-10-04, stays in `docs/google-ads.md`.
- **Corrected along the way, each checked against the code or the accounts:**
  - The secrets. `wrangler pages secret list` shows nine on production. The manual listed "Edge analytics secrets `CF_ANALYTICS_EMAIL/KEY`", which are no longer set (the edge panel reads `CF_ANALYTICS_TOKEN`, which the manual left out; the code's fallback to the pair is dead), and "`STRIPE keys`" for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The manual and `site.json → cloudflare.secrets` now list the nine, names only. `updated` is unchanged, because only the secrets were verified.
  - The vars. `wrangler.toml [vars]` and the Pages project hold nine; the manual named five. Added `STRIPE_PUBLISHABLE_KEY` (public, name only) and the Purelymail leftovers `PURELYMAIL_USER`, `IMAP_HOST` and `IMAP_PORT`, which no code reads.
  - The D1. The manual named a dozen tables; the 59 in `sqlite_master` (besides `_cf_KV` and `sqlite_sequence`) are now listed by group. `email_sync_state` has its INBOX row (the Gmail cursor; last run today, `ok`). Production and preview share the D1 and the R2 bucket (the Pages project's bindings), so that is now a rule.
  - The contract templates. The manual said "custom_order / install_only / repair templates, D1 `document_templates` rows 1/5/6 hold the live wording". The live contract rows are 1 (`custom_order`) and 6 (`wallprep`); row 5 is the estimate's standard notes and row 4 the proposal. `install_only` and `repair` run on the code's fallbacks (`validTypes` in `_lib/lifecycle.js`; migration 0069's header).
  - The portal. There is no `portal/` page, and there never was one in this repo's history: `/portal/` answers 404, and the `contacts.portal_token` column from migration 0004 is unused. The customer's pages are `book/`, `estimate/`, `proposal/`, `contract/`, `invoice/` and `thanks/`.
  - The competitor pages: eight "alternative" pages, all in the sitemap. The manual said four.
  - The endpoints: `functions/api/` has 84. The manual said ~60.
  - `scripts/adsapi.py` does not exist and was never in this repo. The pattern the manual named after it (assert the customer name, validateOnly, then apply) is what `scripts/ads-*.mjs` do.
  - `apply-alt.mjs` also maps the `-560`, `-840` and `-1200` sizes back to the base image.
  - "Enhanced conversions (hashed email/phone) not wired". `js/main.js` already sets `user_data` with each saved lead, and the account has accepted the customer data terms (read through the API); what the API can't show is the switch for the action in the Ads UI. The open item says so now, and applies only if the ads run again.
  - US spelling: color.
  - **Open items:**
    - Still open, each checked: the CRM password (no entry since 2026-09-22 says otherwise); the portrait, crew photo and video (none in `img/`); the Postmaster Tools TXT (the zone's newest TXT record is from 2026-08-01, and the 2026-09-10 deliverability note in `~/fleet/docs/archive` says Postmaster was not set up); Klarna (on in the live Stripe account's default payment-method configuration today, read only).
    - Added from this log: the two "Real project" captions on generated pictures (2026-09-22, still captioned so), and unloading the launchd job once the stop is known to be permanent (2026-09-22, night; it is still loaded and ran this morning).
    - The ads, read in the account: campaign 24052252978 is paused (Maximize Clicks, $14 cap, $130/day), with no clicks in the last seven days.
- **Added:** what each cron sweep does, and that all but the brief read Central as a flat UTC-5 (`functions/api/internal/*`, `functions/_lib/*`); the invoice types and how Stripe marks one paid; the two-day proposal validity; how `setup-admin.mjs` sets a password; the look and the type, read from `styles.css`; that the daily Ads job runs `git pull --ff-only` in this checkout (`~/bin/ncc-ads-conversions.sh`); that the preview in `.claude/launch.json` sends no `_headers` and runs no functions; the not-people block from the entry below.
- **Checked:** all 224 backticked names in the old manual are in the new manual or `docs/`, except `--crew-deep` (history in the 2026-09-22 entry) and `CF_ANALYTICS_EMAIL/KEY`, `STRIPE keys` and `scripts/adsapi.py` (the corrections above). So are its 16 ids and figures (the ballpark ranges, the CPC ceiling, the budget and the CPC baseline, the campaign, the GA4 property and tag, the Ads account and tag, the calls-from-ads action, the Meta pixel, the two addresses). The 12 clauses with less than 85% of their words in the new files were read by hand; each is reworded, history already in this log, or one of the corrections above. The build-and-deploy block is unchanged. Read only against the live systems: the Pages project, the D1, the cron Worker's secret names, the zone's DNS, the Ads account and Stripe. `fleet audit` no longer warns about this manual.
- **Owed** (noticed, not changed in this pass, for Michael or the next change to each file):
  - `site.json`: `crm.notes` still says "~60 endpoints" and lists `portal/`; `cloudflare.vars` lacks four of the nine vars; `notes` names Archivo + Hanken Grotesk, as `css/styles.css`'s header comment does, but the tokens are Montserrat (and Caveat).
  - `wrangler.toml`: the three Purelymail vars nothing reads, and a comment naming `RESEND_API_KEY` and `PURELYMAIL_PASSWORD` as secrets. Those two are set only on the preview environment, and nothing reads them. The CSP's `connect-src` still allows `https://purelymail.com`.
  - The customer's reminder, the review requests, the install-day flip and the traffic page's "today" use a flat UTC-5. From 2026-11-01 (standard time) the reminder goes at 6am, review requests run 8am–7pm, and a job flips to installing, and bills its balance, at 11pm the evening before.
  - The middleware's `REPO_INTERNAL` guard names `CLAUDE.md` and `CHANGELOG.md` but not `docs/`. Add it with the next middleware change, so a root deploy couldn't publish it either; `build.mjs` already keeps it out of `dist/`.
  - Six posts are live, indexable and linked from `/closet-cases` but missing from `sitemap.xml`, so `site-kit submit` has never sent them: `best-closet-company`, `closet-installation-cost`, `contractor-cost-to-build-a-closet`, `custom-pantry-design`, `home-depot-lowes-closet-installation`, `what-closet-company-does-costco-use`.
  - Ten migrations' apply comments (0003–0006, 0014–0016, 0067–0069) use the removed key pair; `docs/crm.md` gives the command with the account token.

## 2026-09-25 (/traffic: scripts and hosting networks are not counted)
- Michael, on the traffic audit's options: "go with your recommendation for the hosting networks" (traffic-kit CHANGELOG, 2026-09-25).
- `functions/_middleware.js` (traffic-kit `bin/add-not-people.mjs`, `82b6a28`): a user agent with no browser engine (a script) or a request from a data-center network (741 networks, less the ones people browse through: iCloud Private Relay, WARP, office proxies, Google's own, Meta's) is not logged, since this middleware logs no bots. Those requests still pass the geo gate like anyone else. This table keeps no network number or user agent, so nothing was added to it.
- Built, checked, deployed (`96417904`, production confirmed through the Pages API), submitted. A request with no browser engine to the new deployment: HTTP 200, not logged (this middleware logs no bots, and now none of these either).
- Past rows are left as they are.
- **Owed:** nothing.

## 2026-09-25 (/traffic: our own tools and Google's quiet fetchers are no longer visitors)
- Michael asked for an audit of what `/traffic` counts as people (the full audit is in traffic-kit's CHANGELOG, 2026-09-25). Its middleware drops bots unlogged, so the needles went into `BOT_UA` and the "Google" check into `isBot()`: our tools and Google's fetchers are now simply not counted. Its `pageviews` keeps no bot columns, so there was nothing to count past rows by.
- `functions/_middleware.js` (traffic-kit `bin/add-our-checks.mjs`, `467fe81`) now drops these unlogged, like every other bot here, so none of them is ever a visit:
  - our own tools, which have carried `NashvillesWebDesignCheck` in their user agent since today;
  - our scanners;
  - the desktop app's preview browser;
  - Google's fetchers that don't say "bot": AdWords-Express and AdWords-Instant, Read-Aloud, BusinessLinkVerification, NotebookLM, Apps Script, a bare "Google", and the rest of Google's list.
- Built, checked (`traffic-kit check` Classification ✓), deployed (`4c6779ed`, production confirmed through the Pages API), submitted. A request with the token to the new deployment: HTTP 200, not logged (this middleware drops bots).
- Past rows are left as they are (Michael: "leave the current data alone and just fix for future").
- **Owed:** nothing.

## 2026-09-25 (CSP: the rest of Google's hosts for the Ads tag)
- Michael: add what the CSP was missing from Google's list for the Ads tag. This came out of a check of the Ads CSP on every site that runs Google Ads. The tag (`AW-18306256681`, loaded by `js/main.js` on every page) still runs, although the ads stopped on 9/22.
- `_headers` (the `/*` policy), from Google's CSP guide for the Google tag (developers.google.com/tag-platform/security/guides/csp): `https://www.google.com` added to `script-src`, `https://pagead2.googlesyndication.com` to `connect-src` and `https://www.googletagmanager.com` to `frame-src`. Nothing else in the policy changed.
- Nothing was being blocked. The check ran `/free-design` under the live policy and every Ads hit went through. Google lists these three hosts for the Ads tag but the tag didn't request them, so they are added in advance.
- Checked locally before deploying. `dist/` was served with its `_headers`, with GA4 hits dropped and the Meta pixel stubbed, so nothing reached the site's accounts. The home page had no CSP violations and every Ads hit went through. Built (`node build.mjs`; this site has no check command), deployed (`e27c1ef9`), submitted (nothing changed). The live header has all three.
- **Owed:** nothing.

## 2026-09-24 (Turnstile: a wrong secret no longer drops the lead)
- `functions/_lib/spam.js` → `turnstileReason`: only a rejected token (`invalid-input-response`) counts as a bot now. Every other siteverify failure (`invalid-input-secret`, `missing-input-secret`, `bad-request`, `internal-error`, or no code at all) fails open and is logged as `[turnstile] siteverify error, not counted as a bot (check TURNSTILE_SECRET)`. Until today each of those dropped the lead silently with `{ok:true}`: no row, no email. So a mistyped or rotated `TURNSTILE_SECRET` would have lost every visitor who got a token, and a test without a token (the browser pane's) could never show it. `timeout-or-duplicate` still fails open; the honeypot and the time-trap are unchanged.
- This site has `TURNSTILE_SECRET` set, so the fix protects its forms today. This `spam.js` carries its own comments, so the same logic as the model's (`~/nittanytax-site`) went in under them (`~/fleet/docs/gotchas.md` → Forms and leads).
- Tested: 14 cases against a mocked siteverify, the old function beside the new, and the new one against the real siteverify (a valid secret with a dummy token is still rejected as a bot; a bogus secret fails open and logs `invalid-input-secret`). Built, no check in `site.json`, deployed (`c3cd9ce5`), submitted (nothing changed for IndexNow or Search Console; Bing has the sitemap).
- Why: Michael's call, 2026-09-24 — a lead form never silently drops a submission, and a wrong secret was a way this one could. Not a client request.
- **Owed:** nothing.

## 2026-09-24 (/traffic: a Chrome prefetch is not Google's ad review)
- Michael: roll out to every dashboard the fix first made on Blair Custom Interiors, where a lead from a Google ad came out "Unknown". Chrome fetches Google's results and ads before the click through Google's own proxy, so the fetch comes from Google's network with the ad's gclid on it. This morning's ad-review rule filed those fetches as "Google ad review", which gets no source cookie. An opened one was never counted as a visit, and its call or form lost where it came from.
- **By hand** (this middleware skips bots before logging and has no source cookie, so `add-ad-review.mjs` cannot patch it): the `// ad-review:` block was refreshed from the template, so a prefetch is never ad review. A prefetch is also not logged (`&& !isPrefetch(request)` on the `logPageview` call), but it stays behind the country gate. There is no `pv-view.js` here: the default traffic view is `page_engagement`, written by `js/main.js`'s own beacon, which already counts an opened prefetch. `pageviews` also has no bot or device columns.
- Deployed (`a73f830b`). Live test: a request with `Sec-Purpose: prefetch` was not logged, while an ordinary one was (the control row, 14133, was deleted).
- No Google ads run here since 2026-09-22, and bots are never logged, so there was nothing to correct.
- **Owed:** nothing.

## 2026-09-24 (/traffic section 4: what Bing holds now)
- Michael: add four things from Bing to the traffic page on every dashboard: which of the site's pages Bing has found and when it last read each, the pages it couldn't read, pages in its index over time, and the sitemap's status. `add-bing.mjs --apply` (traffic-kit `cf8ef48`) refreshed section 4 and the page (the endpoint is ported by hand). The figures come from gsc-ingest's nightly Bing pull (`66f863c`). "What Bing has read" and the two new panels show even while Bing has no search figures.
- What Bing holds for nationalclosetco.com today: two sitemaps: `/sitemap.xml` read 24 Sept, 63 pages, no errors; `www.nationalclosetco.com/sitemap.xml` read 23 Sept, 63 pages, no errors; no problem pages; its pages are asked about over the next nights. This evening's catch-up stopped before reaching it, when Bing throttled the account's page lookups.
- The CRM page's block was refreshed with `add-bing --no-endpoint` (its section points at `/api/traffic` and `/api/traffic-bing`). The endpoint `functions/api/traffic-bing.js` is the template's, ported by hand as before: the header, `requireAuth` from `../_lib/auth.js`, and `context.env.DB`, since `/api` here has no directory middleware.
- The page names the www sitemap with its host, so its two sitemap lines don't read the same.
- Built, deployed (`4a5aa8f1`), submitted (nothing new to send).
- **Owed:** nothing. The nightly pull keeps asking Bing about the site's pages: never asked first, then pages it hasn't found every three days, and the rest every ten.

## 2026-09-24 (ad-review visits)
- **Google's own ad-review visits are no longer counted as visitors.** Google loads ad landing pages from its own network with an ordinary browser user agent and a gclid, so this site's edge log counted each one as a person arriving from an ad. On Blair Custom Interiors, where it was found, that was 18 of the first 40 ad visits. `functions/_middleware.js` now carries traffic-kit's `adReviewBot()` block (the template's code, placed by hand because this middleware predates the kit). A request from Google's networks (AS15169, AS396982) with a click id is treated like the crawlers already are: served, never geo-blocked, and not logged. It matches by network number, so Google Fiber customers still count.
- No backfill here. `pageviews` stores neither the ISP nor the network, so the earlier review visits cannot be told apart from people. National Closet stopped advertising on 2026-09-22, so few were logged.
- Built, deployed, submitted (nothing changed).

## 2026-09-24
- **Edge panel restored.** The /traffic edge panel (Cloudflare zone analytics over GraphQL) now authenticates with `CF_ANALYTICS_TOKEN` — the read-only account token "Traffic-API" (Zone Analytics: Read), `CF_ANALYTICS_TOKEN` in `~/.env` — and falls back to the old `CF_ANALYTICS_EMAIL` + `CF_ANALYTICS_KEY` pair, which held the global API key that stopped authenticating estate-wide on 2026-09-23 (traffic-kit, same change in every copy). This site's panel had been failing since 2026-09-23; the secret `CF_ANALYTICS_TOKEN` is set on the Pages project and this deploy binds it.

## 2026-09-23 (nationalcloset.pages.dev noindex — deploy pending)
- **`nationalcloset.pages.dev` gets noindex.** Found in the estate sweep that followed a Search Console notice about harmonytax.pages.dev: this site's preview host answered 200 with `index, follow` and no header — an indexable copy of nationalclosetco.com, held back only by the canonical tag. `functions/_middleware.js` now sets `x-robots-tag: noindex, nofollow` on every response whose host ends in `.pages.dev` (deployment aliases included) — the exported handler now wraps the old one, so every return path (bypass paths, crawlers, allowed visitors, the geo-block page, the repo-file 404, the /review redirect) leaves with it — and never on nationalclosetco.com. Checked first that nationalclosetco.com (apex and www) serves the site itself and does not redirect to the pages.dev host, and that the pages.dev canonical points at nationalclosetco.com. Tested with a fake context (on pages.dev the page, a stylesheet, a 404 and a deployment alias carry the header; on nationalclosetco.com nothing does); built.
- **Not deployed yet.** The Cloudflare Global API Key in `~/.env` stopped authenticating at 22:10 UTC — a change of the Cloudflare account's email was requested at 22:09 — so `wrangler pages deploy` answered `Unknown X-Auth-Key or X-Auth-Email`. Owed: run `site.json → deploy.command` once `~/.env` works, then check `curl -sI https://nationalcloset.pages.dev/` shows the header and `https://nationalclosetco.com/` does not. `fleet audit` fails this site until then.

## 2026-09-23 (build check, icons)
- `build.mjs`'s link check no longer reports an encoded fragment (`%23…`, from an inline SVG data URI) as a missing file, so a build that warns is a build with a real broken link.
- **The customer estimate page and `/thanks/` render as designed again** (Michael: "fix all with your best recommendations"). Both linked `/styles.css` and `/assets/images/…`, which were never in this repo (404 since at least 2026-08-01), so they lost the design tokens their inline styles use (`--color-*`, `--font-*`): the estimate a customer opens from the CRM's email (`/estimate/?t=…`) rendered in a default serif on white. Each now carries NCC's tokens inline, as `/contract/` does, loads Montserrat and uses `/img/favicon-ncc.png`; the estimate gains the base body rules (cream ground, ink text, Montserrat) the missing sheet used to give. Its letterhead also said "Blinds, Shutters & Shades" — not this business — and now reads "Custom Closets & Closet Systems", as the contract and proposal do. Checked in the browser pane: `/thanks/` as designed, and the estimate rendered with sample figures (the page's own template, nothing saved). Deployed.

## 2026-09-23 (stop publishing the repo)
- **The site no longer publishes its internal files.** It was deployed from the repo root (`wrangler pages deploy .`), and Pages uploads everything there except `functions/`, `node_modules` and `.git` — the `.assetsignore` meant to prevent that is a Workers static-assets file Pages never reads. So `/CLAUDE.md`, `/CHANGELOG.md`, `/site.json` (client contact details), `/wrangler.toml`, `/.indexnow.json`, `/.gitignore`, `/.claude/launch.json` and every `/migrations/*.sql` answered 200. Also `tools/` and `scripts/`. The CRM's `schema.sql`, `setup-admin.mjs` and its 70 migrations, and `wrangler.toml`, were already refused by the middleware's guard, which only missed the manual, changelog, manifest and state files; the guard now covers those too, and `build.mjs` keeps all of them out of the upload. New `build.mjs` copies an allow-list into `dist/` — every root `.html` page (404 and `/traffic` included), the named files and folders, the IndexNow key; inside the folders nothing for the repo (`.md`, `.sql`, `.py`, `.sh`, `.log`, `.toml`, dotfiles, `migrations/`) — names any file a page links to that it did not copy, and ends with `site-kit lastmod` (the sitemap's real dates now go into `dist/sitemap.xml`; the root `sitemap.xml` carries none). `site.json → deploy.command` is `npx wrangler pages deploy dist …`; `site.json → build` is `node build.mjs` → `dist`; `wrangler.toml` `pages_build_output_dir = "dist"`; `.assetsignore` removed. Functions ship as before (wrangler reads `./functions` from the repo root).
- **The middleware refuses repo files** (`isRepoFile` → the site's own 404, `no-store`), whatever a deploy uploads. It was needed at once: after the first `dist/` deploy the domain still answered 200 for the exact URLs fetched during the before-check — copies held by Pages' edge (`s-maxage=604800`, a growing `age`, `cf-cache-status: DYNAMIC`; a zone purge did not reach them) while any other path, or the same one with a query string, was already 404. The middleware answers before that cache, so they went 404 on the next deploy.
- Checked: of the 395 files the root deploy published, the 271 in `dist/` are exactly the public ones, byte for byte — everything dropped is internal. A preview deployment (`--branch=allowlist-check`) served every `dist/` file and none of the internal ones, in the browser pane the pages rendered and the forms were intact (not submitted — a test would reach the client), and `/traffic` rendered its sign-in with the API answering as a function. After the production deploy the live domain serves every public file (200), `/CLAUDE.md`, `/CHANGELOG.md`, `/site.json`, `/wrangler.toml` and `/.indexnow.json` answer 404, `/traffic` shows its sign-in and `/api/traffic/data` answers 401 without a session (this site's dashboard is `/crm/traffic`, unchanged).

## 2026-09-23 (real sitemap dates)
- **Every sitemap date is now the day that page last changed** (Michael: "Switch [sitemaps] to real change dates"). `site.json → deploy.command` and the manual's deploy block start with `node ~/site-kit/bin/site-kit.mjs lastmod`: each `<lastmod>` is the day the page's own content last changed (the words, links and structured data of the page itself — not the header or footer), read from `.indexnow.json`, where `submit` records the day a page's content changes. A changed page gets that day; an unchanged one keeps its date. Google trusts lastmod only from sites whose dates prove accurate, and Bing leans on it.
- Dates seeded once from git history (`site-kit lastmod --history`): 2026-09-22 (38), 2026-09-17 (25). The old sitemap carried hand-set dates (2026-09-17, 2026-09-10, 2026-08-02, 2026-08-01, …). Deployed; the sitemap resubmitted to Search Console (`submit --resubmit`). The step rewrites `sitemap.xml` — commit it with each deploy, as `.indexnow.json`.

## 2026-09-23 (submit on every deploy)
- **Every deploy now submits to IndexNow, Google Search Console and Bing** (Michael: "when a site is created or updated it needs to be submitted to indexnow, google search console and bing"). An IndexNow key file at the site root (a 32-hex `.txt`; not a secret — it can only submit this site's URLs), and `site.json → deploy.command` plus the manual's deploy block end with `node ~/site-kit/bin/site-kit.mjs submit`: IndexNow for the pages that changed, the sitemap resubmitted to Search Console when anything changed, the sitemap to Bing when Bing lacks it — only once the real domain serves the deploy; state in `.indexnow.json` (commit it with each deploy). Deployed: IndexNow's first submission sent all 63 URL(s) (202), Search Console took the sitemap; Bing's daily sitemap cap was used up tonight, so its sitemap goes to Bing tomorrow (`node ~/fleet/bin/bing.mjs sitemaps --apply`); IndexNow already carries every change to Bing.
- Found while doing this, not changed here: this site is deployed from the repo root, so `/CLAUDE.md`, `/CHANGELOG.md`, `/site.json` and `/wrangler.toml` are served publicly (`.assetsignore` does nothing for Pages) — flagged as its own task (an allow-list build into `dist/`).

## 2026-09-22 (Bing on /crm/traffic)
- **The traffic page has a fourth section, Bing Webmaster Tools** (Michael: add Bing's report info to the traffic page on all sites). `functions/api/traffic-bing.js` is traffic-kit's `/api/traffic/bing` behind this CRM's own `requireAuth` (here `/api` has no directory middleware); `crm/traffic.html` gained the nav link, the section inside the page's template string after `<!-- /src-ga -->` (`data-watch="/api/traffic"`, `data-api="/api/traffic-bing"`), and traffic-kit's self-contained script ahead of the page's own inline script — it follows the page's `/api/traffic?…` request and asks for Bing's last 30 days (the page's Today view included). Checked in the browser pane against fixtures: the section renders in this CRM's styles (plain tiles, as this page has no `window.chart`), both inline scripts parse. The numbers come from gsc-ingest's daily Bing push (09:40 UTC); nationalclosetco.com is in Bing since today, so the section reads "connected, nothing yet" until Bing's first data lands. Deployed; `/api/traffic-bing` answers 401 without a session.

## 2026-09-22 (night)
- **Google Ads stopped** (Michael: "NCC will no longer be advertising"). Campaign 24052252978 "NCC Search Campaign" paused through the API. Closets, pantries, garage and laundry are now advertised from Blair Custom Interiors' account (390-380-7644, landing pages on blaircustominteriors.com/free-design/) — the two are affiliated and must never bid on the same terms at once. The daily launchd job `com.zorvalabs.ncc-ads-conversions` is left running: it still uploads booked consultations for past ad clicks, and its guard only pauses things, so it cannot restart the campaign. Unload it once the last clicks are past the conversion window if Michael confirms the stop is permanent.

## 2026-09-22 (evening)
- **Crew can be assigned where consults are actually booked, and the brief no longer says "Today" for a Friday visit.** Michael: there was no way to assign a crew member to Brad Lay's consult, and the brief he sent said "Today 11:00 AM" though the visit is Friday the 25th.
  - **Assigning:** the consult had been booked from the lead page's **Book consultation** form, which had no crew picker (only the calendar's Edit form and quick-add did), so nobody was assigned and the brief went to the whole team. That form now has the "Who's going" picker, and the calendar's consult view has an **Assign / Change** button beside "Going" that saves the crew without opening Edit.
  - **The day:** the wording was hard-coded "Today" / "Morning" — right for the 7am sweep, wrong for **Send crew brief** pressed days early. The brief now takes `{{day_word}}` (Today / Tomorrow / Friday / Friday, October 2), `{{day_relative}}` (today / tomorrow / on Friday) and `{{greeting}}` (Morning / Afternoon / Evening by the Central clock) in the subject, the heading and the first line. Migration `0071_consult_brief_day_words.sql` rewrote only those phrases in the live `consult_brief` template (applied remotely); `FALLBACK` in `_lib/consult-brief.js` matches it; the Templates page lists the new tokens.
  - **Still owed:** Brad Lay's consult (appointment 41, Fri 25 Sep 11:00) has nobody assigned — pick the crew in the calendar and the 7am brief on Friday will go to them only. Not clicked through in the browser pane: the CRM password in `~/.env` still 401s.

## 2026-09-22 (later still)
- **Murphy beds and wall beds are off the site.** Michael: drop the service. Every mention is gone — the word does not appear anywhere in the repo any more.
  - **Removed:** the home page service tile (and its picture, `img/svc-murphy.webp`, plus its entry in the image manifest); the "Murphy & Wall Beds" link in the footer services column on all 72 pages; the "Wall Beds & Murphy Beds" bullet in the service list on all 19 city pages; the two home page marquee items; the `Wall Beds & Murphy Beds` Offer in the Service schema (home page and the `head.html` source); the `Murphy Beds / Wall Beds` line and the FAQ answer in `llms.txt`; the "Murphy / Wall Bed" option in the site's lead-form space picker (`js/main.js`) and in the CRM's service vocabulary (`crm/crm-app.js`).
  - **Reworded** rather than deleted, so the sentences still read: three FAQ answers (visible copy **and** the FAQPage schema, on `/faq`, the home page, `/about` and the competitor pages), two schema/meta descriptions, and the service list on the competitor pages.
  - **The truck photo alt** on `/service-areas` used to transcribe the whole wrap, wall beds included. It now describes the truck without the service list. **The wrap on the actual truck still says "Well Beds & Murphy Beds"** — which is also a typo for "Wall" — so that is a physical item for the owner to decide about.
  - **CRM records are unaffected.** The CRM's service field is a `<datalist>`, not a `<select>`, so removing the option only removes the suggestion; a query of the live D1 found **no lead or project** referencing a Murphy or wall bed, so nothing historical loses its label.
  - **One layout fix came with it.** The services grid paints its own hairline borders, so dropping a tile left 8 in a 3-column grid and the empty cell rendered as a 393px grey block. `.svc-grid > .svc:last-child:nth-child(3n + 2)` now spans the last tile across the rest of its row, with the image at `32/10` instead of `16/10` so the row keeps its height. Re-synced into the home page's inline stylesheet with `stage4.py sync_inline_css()` — the diff was the new rule and nothing else.
  - Checked after the edits: 217 JSON-LD blocks across 72 pages all still parse (entries were removed from inside JSON, so this was the thing most likely to break), no page has a dangling image reference, all 375 content images still have alt text, `js/main.js`, `crm/crm-app.js` and the build scripts all parse, and the home page, `/faq` and a city page were read at 1280px, 800px and 375px with no horizontal overflow and no mention of the service in the rendered text.

## 2026-09-22 (later)
- **Every look image on the site is new.** Michael: the hero and the inspiration shots needed to be nicer — walk-in closets, cabinets, built-ins and pantries — with **no islands, no windows, no flat slab doors or drawer fronts, no glass doors or shelving, no carpet, proper handles and pulls, and a mix of white, dark wood and light wood**. 63 pictures were made to that brief and dropped in at the same paths and the same dimensions, so no layout moved.
  - **What changed:** the home page hero (`hero-closet` + its 480/800/OG sizes), all 34 `insp-*` inspiration shots (walk-in, reach-in, pantry, garage, laundry), all 9 `svc-*` service tiles, all 11 `cab-*` cabinet shots on `/custom-cabinets-nashville`, and the 8 photographic blog headers. Every OG card that crops one of those was rebuilt from the new source.
  - **What was deliberately left alone:** the real work — the Fraleys' closet and pantry, Keith & Irena's office wall, the `pantry-before/after` slider, `blog-closet-organization-before/after` — the 3D design renders, the wall-mounted vs floor-based comparison diagrams, the branded blog title cards, the truck and the logos. Generated pictures set the mood; they never stand as proof of a job.
  - **Two files were renamed** because their names described something that is no longer in the picture: `feat-island.webp` was never an island (its alt always said "reach-in closet") and is now `insp-reachin-9.webp`; `cab-island.webp` is now `cab-kitchen-run.webp` and shows a full walnut kitchen run with a coffee bar and tall pantry cabinets instead of an island. The "Kitchen cabinets & islands" card keeps its title and copy — islands are still a service, the picture just leads with the cabinet run.
  - **Alt text was rewritten for all 162 `<img>` tags** that point at a new picture, because the old text described white melamine and carpet that is no longer there. One accurate description per image, wherever that image appears. Two captions that named an island were corrected: the gallery tile and the cabinets-page hero caption (now "a paneled range hood").
  - **The prompts are committed**, in `tools/images/` — `rules.js` (the eight rules every picture obeys), `manifest.js` (one entry per image: subject, aspect, output size, alt), `generate.mjs` (Venice, reads the balance first and stops on the first 402, concurrency 5) and `convert.mjs` (PNG → the exact WebP and OG sizes the site serves). Re-running `generate.mjs` only makes what is missing, so a single picture can be redone by name.
  - Made with Venice: `flux-2-max` for the first pass after a four-model bake-off, `nano-banana-pro` for the ten that needed a second take — nine that came back weak (an empty walk-in, a pantry with fake brand names legible on the packaging, a vanity where a mirror swallowed the cabinetry, a "floor-based" shot that did not show a toe kick, a "rail" shot with nothing hanging in it) plus the new kitchen run. About $8.30 in all.
  - Checked as delivered: no page has a dangling image reference, nothing 404s, every content image has alt text (only the Meta pixel beacons have none, correctly), and the home page, gallery and cabinets page were read at 1280px and 375px in the browser.
- Still owed: `blog-large-walkin.webp` and `blog-3d-design-result.webp` are captioned "Real project" in the gallery but are generated pictures, not photographs of a job. That predates this session and was left alone rather than swapped for another generated picture. **They should be replaced with real photos of those two installs, or the captions changed** — under our own content standard a generated picture can never stand as proof of work.

## 2026-09-22
- **Team members, assignment, and the morning-of consult brief.** Michael asked for a way to put a name on a consult and on a job, and for the assigned people to be emailed everything they need on the morning of the visit.
  - New `team_members` roster (migration 0070), seeded with Michael Blair <michael@blaircustominteriors.com> and Noah Blair <noah@blaircustominteriors.com>, managed at `/crm/team.html`. A third installer can be added there without a migration.
  - New `assignments` join table — a consult or a job can carry more than one person, because both owners go out together often enough that one-assignee-per-row would have been wrong on day one. Assign from the Calendar (book + edit) and from a job's Overview tab; the crew shows as initials on the month grid and as chips on the job header and visit list.
  - New `consult_brief` email: client name, phone, email, the date and time, the address linked to Google Maps (plus an "Open in Google Maps" button), rooms, notes, who else is going, and a link back to the consult in the CRM. One email per assignee, sent as crm@ so a reply lands in the office inbox, never to the client. The wording is an editable `email_templates` row (Templates → Email); `_lib/consult-brief.js` carries a byte-identical fallback so deleting or deactivating the row cannot silence the morning email — a check in this session confirmed the two are identical.
  - It goes out on the morning of the visit, from the same cron tick as the customer reminder: after 7am Central, for consults and measures happening later today, stamped in `appointments.team_brief_sent_at` so it sends once. **Nobody assigned falls back to the whole active team** and the email says so — a visit three hours out that nobody was assigned to is exactly the one that must not go out unannounced. There is also a "Send crew brief" button on the appointment for sending it early; that one does not stamp, so the automatic brief still lands.
  - Templates → Email now exposes the HTML body. Every automated email prefers `body_html` at send time, so editing only the plain text used to change nothing in the recipient's inbox; the kind list also gained `consult_brief` and `review_request_visit`, which were sending but not editable.
  - Fixed while building: `assignments` rows are removed by `_lib/cascade.js` when a job or lead is purged (D1 never fires `ON DELETE CASCADE`); the brief's city-in-the-subject now survives all three address shapes we store; any template token we don't supply is blanked rather than delivered as a literal `{{token}}`; and the crew chips use a deeper terracotta (`--crew-deep`) because `--accent-ink` on `--accent-soft` measures 3.96:1, under WCAG AA — every crew element now clears 4.5:1 as painted at 375px.
- **Every word in the CRM now clears WCAG AA, measured as painted.** The 2026-09-22 mobile pass noted the shared accent tokens were below the line and worked around them locally; this fixes them at the source and folds the workaround back in.
  - **The accent is three tokens, not one.** A colour that fills well is too light to write with: the brand terracotta `--accent` (#D2683F) carried white at 3.63:1 and read as text at 3.44:1 — so *every link in the CRM* was failing, not just `.pill`. `--accent` is now fills, borders and focus rings only and is **unchanged**; `--accent-fill` (#B9542F, white on it 4.80) is a filled control with a white label; `--accent-text` (#A8481F) is the accent as text and clears 4.5:1 on every surface the CRM paints on — white 5.81, `--bg-alt` 5.52, `--bg-soft` 5.10, `--bg-hover` 4.92, `--accent-soft` 4.79. Each has a hover step. `--accent-ink` and `--accent-hover` are now aliases into the scale, so the inline `style=` attributes on the pages were fixed without touching them.
  - **`--crew-deep` is gone**, folded into `--accent-text` — it was the same #A8481F, scoped to the crew chips because fixing the shared tokens was out of scope then. One answer now, not two.
  - **The primary button.** Michael's call: the fill moves to `--accent-fill`, the shade it already turned on hover, so white passes at 4.80 and the button still reads as the same terracotta. Same for `.btn.success` (3.77 → 5.48), the quick-add button, the pipeline step dots and the Traffic toggles.
  - **Status pills, on Michael's call as well.** Their `--s-*` tokens are only ever pill text, so each moved down its own hue to ≥4.7:1 on its own tint, keeping the colour-coding: amber 2.00 → 4.70 (the "proposal" pill was the hardest word in the CRM to read), teal 2.39 → 4.74, emerald 2.41 → 4.75, slate 2.34 → 4.75, violet 3.86 → 4.70, indigo 3.99 → 4.70, cyan 2.33 → 4.70. `--danger` split into a fill (the error toast) and `--danger-text` (3.95 → 4.70 on its own tint).
  - Also caught while sweeping: the message-direction arrows (emerald at 2.54:1), the invoice sheet's uppercase labels (3.01:1), the Traffic page's muted grey (4.29:1), and the login page — which uses its own `admin.css` and needed the same fill/text split (`--color-brass-fill` / `--color-brass-text`).
  - Verified by walking every element on all 30 CRM pages, resolving the real painted background rather than the declared one, at 1280px and 375px, plus every hover and active state resolved by hand. Nothing is below 4.5:1 for text or 3:1 for a meaningful mark. The brand terracotta is untouched wherever it fills, borders or rings.

- **The CRM is usable on a phone.** Michael: some pages were too wide with no way to scroll. Every one of the 30 CRM pages was measured in a 375px viewport; 22 had content running off the side that could not be reached. Three causes, all fixed:
  - **The data-table card had `overflow: hidden`.** The Jobs list is 1,607px wide and the Leads list 1,019px — everything past the card edge was simply swallowed, on desktop as well as on a phone. It scrolls sideways now, and on a phone the first column (the client's name) is pinned so you never lose track of the row you are reading.
  - **`1fr` grid tracks.** A bare `1fr` is `minmax(auto, 1fr)` and refuses to shrink below its content's min-content width, so one long email address could push a whole column off the screen. Every track that holds free content is `minmax(0, 1fr)` now — the dashboard, the calendar grid, the job header, the lead/job two-column layouts, the reports cards.
  - **Inline `grid-template-columns`.** Reports and Templates set their columns in a `style=` attribute, which beats the stylesheet's own media query, so they stayed two-column on a phone regardless. Those now collapse.
  - Also: the month calendar shows a coloured dot per visit instead of a chip squashed to "2:3…" (tap the day for the full list, which already existed); the line-item editors on estimates, proposals, contracts and availability scroll in their own wrapper with 38px-tall inputs instead of 32px number boxes; page headers and button rows wrap; long unbreakable values (an email address, a URL) break rather than push a card off-screen; form inputs are 16px so iOS stops zooming on focus.
  - Verified by re-measuring all 30 pages at 375px: no page has content off-screen and unreachable. Desktop is unchanged — the dashboard is still two columns, the calendar still shows text chips — except that the wide tables now scroll there too, where they used to be clipped.

- Still owed: the owner should assign the Sep 23 consult (Brian Schaaf, 2:00 PM) — unassigned, so both owners will get the brief. `NCC_CRM_PASSWORD` in `~/.env` is stale and no longer logs in.

## 2026-09-19
- Footer credit link to nashvilleswebdesign.com is now `rel="nofollow noopener"` (was followed). Michael's call, estate-wide: every credit on every site, ours and clients', is nofollow from today — a credit, not a link signal; the WebSite schema creator/provider is unchanged. No other change; redeployed.

## 2026-09-17
- Operating manual added: `CLAUDE.md` (how it works), `site.json` (the manifest `fleet` reads) and this log. The old `CLAUDE.md`, where one existed, is replaced.
- Footer credit: Web Design, SEO and Hosting by Nashville's Web Design, followed link; creator/provider/maintainer on the WebSite schema
- Lifetime warranty covers custom cabinets
- Blair Custom Interiors as the parent company, custom cabinets as a service, About page rebuilt

## 2026-09-13
- Drop the SMS path from review requests
- Lower the walk-in and pantry floors, replace Klarna with the 50/25/25 payment terms
- Keep the price and label on one line in the price tiles
- Lifetime system warranty, monthly Klarna figures, SMS-ready review requests
- Sync the homepage's inline stylesheet, class-based three-button bar, prose form note
- Lead conversion: two-field forms, booking everywhere, ballpark hero, review requests

## 2026-09-12
- Ads: negatives, ad rewrites, schedule, a settings watchdog, faster landing pages

## 2026-09-10
- Staff alerts are sent as crm@ to hello@, never self-addressed
- Route staff alerts to crm@nationalclosetco.com
- CRM mail: no sends to dead domains, no self-addressed alerts with a foreign Reply-To
- Remove the 'Free · No obligation / Flexible payment options' pill above the lead form
- Never serve repo internals: build tools, ops scripts, migrations, wrangler.toml, admin setup
- Hero tagline: 'Saving marriages one closet at a time.'
- Keep the page factory and rebuild scripts with the site
- Site rebuild stage 3: blog index, competitor pages, pricing page
- Site rebuild stage 2: the homepage, halved and reordered around proof
- Site rebuild stage 1: Gallery, Our Work, About, Reviews and FAQ pages; new site navigation

## 2026-09-09
- Apply the eyebrow-contrast and CTA-bar clearance fixes to index.html's inline stylesheet too
- Landing page audit fixes: anchor the CTAs at the form, stop bots booking conversions
- Landing page: clear the fixed nav in the hero

## 2026-09-08
- Daily Ads housekeeping: also attach the 30s call conversion once the call terms are accepted
- CSP: allow analytics.google.com, stats.g/ad.doubleclick.net, Meta pixel fallback and the Cloudflare insights beacon
- CSP: allow the GA4/Ads measurement endpoints the tag actually uses; daily ad-group cutover check
- Capture GA4 client/session ids on leads; send booked consults to GA4 by Measurement Protocol
- Google Ads: free-design landing page, click-to-call conversion label, booked-consult offline upload

## 2026-09-02
- Show the rest of the Analytics the ingest was already storing
- Bill the whole remainder when the install date is already here

## 2026-09-01
- Serve the Analytics panel its figures, and say so when there are none
- Commit a portable dev-server config
- Ignore .wrangler/

## 2026-08-30
- Traffic dashboard: masonry panels, real space between sections

## 2026-08-29
- Give every ImageObject a typed creator, and every page a breadcrumb

## 2026-08-28
- Let the target keyword list be edited on the traffic page
- Add searches-that-brought-visitors, sortable columns, and keyword search
- Add a watched-keyword list to the rankings panel
- Proposals: persist internal cost rates + pay-in-full option
- Add the Google rankings panel to the CRM traffic page
- CRM: address-book picker in Book Appointment + Book links on contact/job/lead

## 2026-08-27
- Anti-spam on lead forms: Turnstile + honeypot + time-trap (fail-open)
- Scheduling invoice: state it's 25% + auto-bill balance on install day

## 2026-08-26
- Fix lead location not showing: capture Address in quick-add, store structured
- Add visible FAQ accordions + most-searched Q&A across all page categories
- Change footer design credit from Zorva Labs to Nashville's Web Design

## 2026-08-21
- Add Labor cost column to CRM Jobs list

## 2026-08-19
- Add 6 SEO blog posts (cost/comparison/buyer-guide) + Closet Cases registration
- FAQ: add People-Also-Ask questions (best/cheapest/Costco/design cost/reviews/install cost/Home Depot-Lowe's/contractor) with NCC positioned as the obvious choice

## 2026-08-17
- Fix consult reminder time: start_at is Central wall-clock, not UTC (noon was showing as 7am)

## 2026-08-16
- CRM calendar + dashboard: link appointment site address to Google Maps

## 2026-08-15
- Add automated morning-of consultation reminder email (cron sweep on advance-jobs)

## 2026-08-07
- P&L: fetch accessories/wall/mfr-discount columns in the report query (were undefined -> zeroed)
- P&L: show all expense lines (accessories, wall repair) + wall repair income, in screen and print views
- P&L/financials: default Materials expense to charged/gross ÷ 2.10 when no row saved (was showing $0)
- Job financials: derive Materials expense = Materials charged ÷ 2.10 (was backwards, zeroed gross on toggle)

## 2026-08-06
- Proposal builder: materials markup default 2.0 -> 2.10 (match calculator/financials)
- calc: enter the TOTAL client pays; list = total + discount; materials = list ÷ 2.1 (matches proposal math)
- Job financials: Materials charged auto-derives from Materials expense at a 2.10 markup (editable toggle)
- Consultation emails: '3D design' wording; drop stale window-company copy from booking confirmation

## 2026-08-05
- Fix: appointment_date/time is Central wall-clock (was shifted 5h by treating naive start_at as UTC)
- Email templates: auto-fill appointment_date/time from the appointment; strip unresolved {{tokens}} before sending to a customer
- Email: text-only sends now generate an HTML part (empty text/html rendered blank in HTML clients)

## 2026-08-04
- Traffic 'today' now Central-time across all sections: channels/pages (D1) + countries/edge-split (hourly countryMap), not just the headline number
- Traffic page: compute 'today' in Central time (was UTC — reset at 7pm CT and showed ~0)

## 2026-08-03
- Job financials: gross amount is now the calculated sum of the charged lines (section reconciles to net client)
- Manufacturer discount now supports $ or % (of materials) on job page and /calc
- Job page: install expense overridable again; parse $ and , in amount fields. Rewrite /calc to the manual model (accessories, mfr disc off materials, install auto/override, processing %/$)
- CRM financials: itemized Charged breakdown + Manufacturer discount (off materials); install calculated-only; reorder layout to match spec
- CRM financials: manual line items + accessories field; only labor auto (10%/$350); processing fee %-or-$; wall repair now a plain expense; simpler job-page layout
- contact.js: email team on filtered submissions instead of dropping them silently
- Remove company honeypot from all lead forms (browser autofill was silently dropping real leads)
- contact.js: never fake success when a lead fails to save (surface DB-unbound as 503)
- CSP: allow Google Ads conversion endpoints (googleadservices/google.com/doubleclick) so lead-form conversions can fire
- CRM: gross up deposit floor to cover materials + processing fees

## 2026-08-02
- CRM: exclude lost leads from the active Leads total badge
- Homepage: refocus 'works as hard as you do' on closets, pantries & laundry (drop garage/office lead)
- Depth image: relabel 12-inch side 'Shallow' (14-inch is the standard)
- Depth image: subtler realistic 12-inch overhang (fix broken/exaggerated version)
- Depth image: derive 12-inch from same 14-inch photo (identical items, shelf, camera)

_Only the 80 most recent commits are listed; `git log` has the rest._
