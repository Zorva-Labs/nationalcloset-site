# Cloe — the site's chat assistant

Added 2026-11-11 (Michael: "add the ai chat bot to the site with the new instructions for popup. name her Cloe"). It is site-kit's assistant (`~/site-kit/assistant`), copied in, and it meets the estate chat standard (`~/fleet/docs/chat-standard.md`): the "Any questions?" card after the first scroll, the empathetic voice block, and the focus that stays in the chat box.

## The parts
- **Widget:** `assets/js/assistant.js`. `build.mjs` puts `<script src="/assets/js/assistant.js" defer>` before the last `</body>` of every public page. It skips the CRM, the customer's token pages (`book/`, `contract/`, `estimate/`, `invoice/`, `proposal/`, `thanks/`), `404`, `thank-you`, `calc` and `/free-design`, the paid landing page that should keep the visitor on its form (`NO_WIDGET` in `build.mjs`). The build logs `assistant: the widget on N page(s)`.
- **Index:** `scripts/assistant-index.mjs`, the last step of `build.mjs`. It writes `dist/search-index.json` (the panel's site search) and `dist/assistant-index.json` (the page chunks Cloe answers from), puts the config from `site.json → assistant` into the widget's BOOT slot, and renames the widget to its content hash. Both JSON files are noindex in `_headers` and disallowed in `robots.txt`.
- **Endpoint:** `functions/api/ask.js` calls the Messages API with the excerpts that match the question and streams the answer. Model: `ASSISTANT_MODEL` in `wrangler.toml [vars]` (`claude-sonnet-5`). Key: the Pages secret `ANTHROPIC_API_KEY`. Every question goes into D1 `assistant_log` (migration 0086, applied 2026-11-11), which also enforces the caps: 30 questions per visitor a day and 400 for the whole site a day.
- **Call-backs:** the call-back card in the chat posts to `/api/contact`, the same endpoint as the site's forms. `contact.js` maps its fields onto the form's and saves the lead with `source_page` "chat: Cloe". It gets the staff alert and "Where this lead came from" like any form lead.

## What she says (`site.json → assistant`)
- `persona: "Cloe"` gives the panel title "Search the site · Ask Cloe", the card's greeting and the "I'm Cloe, the website assistant…" answer. The name is a site-kit option (since 2026-11-11). Without it, nothing changes on other sites.
- `nudge`: "Hi, I'm Cloe. Any questions?" · "I'm happy to help with closets, pantries, garages or cabinets." · **Ask Cloe**. It appears 3 s after the first scroll past 150 px, once a visit, and × hides it for 7 days.
- `rules`: the site's standing calls, which she keeps:
  - no prices;
  - no online booking (a designer texts or calls);
  - no financing, only the 50/25/25 payments by check;
  - no Murphy or wall beds;
  - acknowledge the visitor's frustration first.

  A new standing call in `CLAUDE.md` that touches what a customer is told goes here too.
- On phones the launcher and the card sit above the 56 px call bar (the last rule in `css/styles.css`).

## Changing or checking her
- Edit `site.json → assistant`, then `node build.mjs` and deploy. The index rebuilds on every build, so a page change reaches her answers on its next deploy.
- Ask the live bot the chat standard's questions, one at a time, as `POST /api/ask {"q": "...", "page": "/"}`. Each answer streams as lines of JSON with the text in `d`:
  - something worried;
  - a price;
  - "are you a person?";
  - something off-topic;
  - a town.

  Don't send a call-back as a test: it is a real lead in the live D1.
- What it costs and who has been asking: `SELECT * FROM assistant_log ORDER BY id DESC` on the live D1 (tokens, cached tokens, the question, the page).
