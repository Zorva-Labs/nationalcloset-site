// ============================================================
// National Closet Company CRM — Tave-style app shell
// Loads on every /crm/ page. Renders the top nav, mounts the
// dashboard/section content, handles auth, global search, etc.
// ============================================================

const NAV = [
  { href: "/crm/",            label: "Dashboard", match: ["/crm/", "/crm/index.html"], icon: iconDash() },
  { href: "/crm/pipeline.html", label: "Pipeline", icon: iconKanban() },
  { href: "/crm/inbox.html",  label: "Inbox", icon: iconMail() },
  { href: "/crm/leads.html",  label: "Leads", icon: iconLead(), expandable: "leads" },
  { href: "/crm/contacts.html", label: "Clients", icon: iconUsers() },
  { href: "/crm/vendors.html", label: "Vendors", icon: iconTruck() },
  { href: "/crm/projects.html", label: "Jobs", icon: iconBriefcase(), expandable: "jobs" },
  { href: "/crm/calendar.html", label: "Calendar", icon: iconCal() },
  // Estimates removed — workflow is now Lead → Proposal → Contract → Booked.
  { href: "/crm/proposals.html", label: "Proposals", icon: iconDoc() },
  { href: "/crm/contracts.html", label: "Contracts", icon: iconDoc() },
  { href: "/crm/invoices.html", label: "Invoices", icon: iconInvoice() },
  { href: "/crm/expenses.html", label: "Expenses / Bills", icon: iconExpense() },
  { href: "/crm/templates.html", label: "Templates", icon: iconMail() },
  { href: "/crm/activity.html", label: "Activity", icon: iconActivity() },
  { href: "/crm/reports.html", label: "Reports", icon: iconReports() },
  { href: "/crm/traffic.html", label: "Traffic", icon: iconTraffic() },
];

// Lead status sub-items shown when the Leads nav row is expanded.
// `color` lights up the left bar marker so each stage is visually distinct
// (matches the pipeline kanban colors).
// Lead-side pipeline only — booked + installed are now job statuses (see
// JOB_STATUSES_NAV below). A lead automatically transitions out of the lead
// pipeline the moment the contract is signed; from that point it lives under
// /crm/projects.html.
const LEAD_STATUSES_NAV = [
  { key: "new",       label: "New Leads",     color: "#94A3B8" },
  { key: "contacted", label: "Contacted",     color: "#0EA5E9" },
  { key: "replied",   label: "Replied",       color: "#F59E0B" },
  { key: "consult",   label: "Consult",       color: "#6366F1" },
  { key: "proposal",  label: "Proposal Sent", color: "#8B5CF6" },
  { key: "lost",      label: "Lost",          color: "#94A3B8" },
];

// Job-side pipeline (parallels LEAD_STATUSES_NAV). Drives the expandable Jobs
// drill-down in the sidebar. Statuses come from the projects table's
// `status` column — see PROJECT_STATUSES below for the full list.
const JOB_STATUSES_NAV = [
  { key: "contracted",        label: "Booked",     color: "#2563EB" },
  { key: "scheduled_install", label: "Scheduled",  color: "#6366F1" },
  { key: "installing",        label: "Installing", color: "#14B8A6" },
  { key: "completed",         label: "Completed",  color: "#10B981" },
];

// Sidebar groups — all links visible (we have room in the vertical rail)
const NAV_GROUPS = [
  { label: null, items: ["/crm/", "/crm/pipeline.html", "/crm/inbox.html"] },
  { label: "Address book", items: ["/crm/contacts.html", "/crm/vendors.html"] },
  { label: "Leads & jobs", items: ["/crm/leads.html", "/crm/projects.html"] },
  { label: "Sales", items: ["/crm/estimates.html", "/crm/proposals.html", "/crm/contracts.html", "/crm/invoices.html", "/crm/expenses.html"] },
  { label: "Operations", items: ["/crm/calendar.html", "/crm/availability.html"] },
  { label: "Insights", items: ["/crm/reports.html", "/crm/traffic.html"] },
  { label: "Setup", items: ["/crm/templates.html", "/crm/activity.html"] },
];

// JS actions — no nav, opens an inline modal that creates the entity and routes to its page on success
const QUICK_ADD = [
  { label: "New lead",         action: "quickAddLead",        kbd: "L", icon: iconLead() },
  { label: "New contact",      action: "quickAddContact",     kbd: "C", icon: iconUsers() },
  { label: "New job",          action: "quickAddJob",         kbd: "J", icon: iconBriefcase() },
  { label: "Book appointment", action: "quickAddAppointment", kbd: "A", icon: iconCal() },
  { label: "New proposal",     action: "quickAddProposal",    kbd: "P", icon: iconDoc() },
  { label: "New contract",     action: "quickAddContract",    kbd: "K", icon: iconDoc() },
];

// ============================================================
// Auth + fetch
// ============================================================
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...opts,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    if (!location.pathname.endsWith("/login.html")) {
      location.href = "/crm/login.html?next=" + encodeURIComponent(location.pathname + location.search);
    }
    throw new Error("Unauthorized");
  }
  const body = (res.headers.get("content-type") || "").includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error((body && body.error) || "HTTP " + res.status);
  return body;
}

// ============================================================
// Mount: builds top nav + page shell, returns the user
// ============================================================
async function mount({ title = "", subtitle = "", actions = "", wide = false } = {}) {
  const me = await fetchJSON("/api/auth/me").catch(() => null);
  if (!me) return null;
  document.title = `${title} · National Closet Company CRM`;
  const path = location.pathname;
  const navByHref = Object.fromEntries(NAV.map((n) => [n.href, n]));
  const groupHtml = NAV_GROUPS.map((g) => `
    ${g.label ? `<div class="tnav__section-label">${esc(g.label)}</div>` : ""}
    ${g.items.map((href) => navByHref[href] ? navLink(navByHref[href], path) : "").join("")}
  `).join("");

  document.body.innerHTML = `
    <nav class="tnav">
      <a href="/crm/" class="tnav__brand" aria-label="National Closet Company">
        <img class="tnav__brand-logo" src="/img/ncc-logo-nc.png" alt="National Closet Company" />
      </a>
      <div class="tnav__search">
        ${iconSearch()}
        <input type="search" id="g-search" placeholder="Search…" autocomplete="off" />
        <span class="tnav__search-kbd">⌘K</span>
        <div class="tnav__results" id="g-results"></div>
      </div>
      <div class="tnav__links">${groupHtml}</div>
      <div class="tnav__spacer"></div>
      <div class="tnav__quickadd">
        <button class="tnav__quickadd-btn" id="quickadd-btn" aria-label="Quick add" title="New (N)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <div class="tnav__quickadd-menu" id="quickadd-menu">
          ${QUICK_ADD.map((q) => `<button class="tnav__quickadd-item" type="button" onclick="SSCrm.${q.action}();document.getElementById('quickadd-menu').classList.remove('is-open')">${q.icon}<span>${esc(q.label)}</span><span class="kbd">${q.kbd}</span></button>`).join("")}
        </div>
      </div>
      <div class="tnav__user">
        <button class="tnav__user-btn" id="user-btn" data-init="${esc(initials(me.user.email))}" aria-label="User menu" title="${esc(me.user.email)}">
          <span>${esc(me.user.display_name || me.user.email.split("@")[0])}</span>
        </button>
        <div class="tnav__user-menu" id="user-menu">
          <div class="tnav__user-info">
            <strong>${esc(me.user.display_name || me.user.email)}</strong>
            <span>${esc(me.user.email)}</span>
          </div>
          <button onclick="SSCrm.logout()">Sign out</button>
        </div>
      </div>
    </nav>
    <main class="app ${wide ? "app--wide" : ""}">
      <header class="page-head">
        <div>
          <h1 id="page-title">${title}</h1>
          ${subtitle ? `<div class="sub">${subtitle}</div>` : ""}
        </div>
        <div class="actions">${actions}</div>
      </header>
      <div id="page"></div>
    </main>
  `;
  wireNav();
  return me.user;
}

function navLink(n, currentPath) {
  const matches = n.match ? n.match.includes(currentPath) : currentPath === n.href || currentPath.startsWith(n.href.replace(".html", ""));
  if (n.expandable === "leads") return leadsNav(n, currentPath, matches);
  if (n.expandable === "jobs")  return jobsNav(n, currentPath, matches);
  return `<a class="tnav__link ${matches ? "is-active" : ""}" href="${n.href}">${n.icon}<span>${esc(n.label)}</span></a>`;
}

// Expandable Leads nav — parent row + a list of status sub-rows with colored
// markers + count badges (populated async from /api/leads counts). Auto-opens
// when the user is on the Leads page so the active filter is visible.
function leadsNav(n, currentPath, matches) {
  const params = new URLSearchParams(location.search);
  const activeStatus = params.get("status") || "";
  const expanded = matches; // open by default whenever we're on the leads section
  const subItems = LEAD_STATUSES_NAV.map((s) => `
    <a class="tnav__sub ${matches && activeStatus === s.key ? "is-active" : ""}"
       href="/crm/leads.html?status=${s.key}"
       data-status="${s.key}">
      <span class="tnav__sub-dot" style="background:${s.color}"></span>
      <span class="tnav__sub-label">${esc(s.label)}</span>
      <span class="tnav__sub-count" data-status-count="${s.key}"></span>
    </a>`).join("");

  return `
    <div class="tnav__group ${expanded ? "is-open" : ""}" data-leads-group>
      <div class="tnav__group-head">
        <a class="tnav__link tnav__link--expand ${matches ? "is-active" : ""}" href="${n.href}">
          ${n.icon}
          <span>${esc(n.label)}</span>
          <span class="tnav__sub-count" data-status-count="_total"></span>
        </a>
        <button type="button" class="tnav__expand-toggle" aria-label="Toggle leads list"
                onclick="this.closest('.tnav__group').classList.toggle('is-open')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="tnav__sublist">${subItems}</div>
    </div>
  `;
}

// Expandable Jobs nav — parallels leadsNav() but for the project lifecycle.
// Sub-rows link to /crm/projects.html?status=<projectStatus>.
function jobsNav(n, currentPath, matches) {
  const params = new URLSearchParams(location.search);
  const activeStatus = params.get("status") || "";
  const expanded = matches;
  const subItems = JOB_STATUSES_NAV.map((s) => `
    <a class="tnav__sub ${matches && activeStatus === s.key ? "is-active" : ""}"
       href="/crm/projects.html?status=${s.key}"
       data-status="${s.key}">
      <span class="tnav__sub-dot" style="background:${s.color}"></span>
      <span class="tnav__sub-label">${esc(s.label)}</span>
      <span class="tnav__sub-count" data-job-count="${s.key}"></span>
    </a>`).join("");

  return `
    <div class="tnav__group ${expanded ? "is-open" : ""}" data-jobs-group>
      <div class="tnav__group-head">
        <a class="tnav__link tnav__link--expand ${matches ? "is-active" : ""}" href="${n.href}">
          ${n.icon}
          <span>${esc(n.label)}</span>
          <span class="tnav__sub-count" data-job-count="_total"></span>
        </a>
        <button type="button" class="tnav__expand-toggle" aria-label="Toggle jobs list"
                onclick="this.closest('.tnav__group').classList.toggle('is-open')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="tnav__sublist">${subItems}</div>
    </div>
  `;
}

function moreMenu(path) {
  const extras = NAV.filter((n) => !PRIMARY_NAV.includes(n.href));
  if (!extras.length) return "";
  const anyActive = extras.some((n) => path === n.href);
  return `
    <div style="position:relative" class="js-more">
      <button class="tnav__link" style="background:transparent;border:0;cursor:pointer;${anyActive ? "color:var(--accent-ink);background:var(--accent-soft);" : ""}" onclick="this.nextElementSibling.classList.toggle('is-open');event.stopPropagation()">
        More
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="tnav__quickadd-menu" style="left:0;right:auto">
        ${extras.map((n) => `<a class="tnav__quickadd-item" href="${n.href}">${n.icon}<span>${esc(n.label)}</span></a>`).join("")}
      </div>
    </div>
  `;
}

async function loadLeadCounts() {
  if (!document.querySelector("[data-status-count]")) return; // no leads nav on this page
  try {
    const { counts } = await fetchJSON("/api/leads?limit=1");
    const c = counts || {};
    let total = 0;
    document.querySelectorAll("[data-status-count]").forEach((el) => {
      const key = el.dataset.statusCount;
      if (key === "_total") return;
      const n = c[key] || 0;
      total += n;
      if (n > 0) { el.textContent = n; el.classList.add("is-visible"); }
    });
    const totalEl = document.querySelector('[data-status-count="_total"]');
    if (totalEl && total > 0) { totalEl.textContent = total; totalEl.classList.add("is-visible"); }
  } catch (e) {
    // Silent — the nav still works, just without counts
  }
}

async function loadJobCounts() {
  if (!document.querySelector("[data-job-count]")) return;
  try {
    const { counts } = await fetchJSON("/api/projects?counts_only=1");
    const c = counts || {};
    let total = 0;
    document.querySelectorAll("[data-job-count]").forEach((el) => {
      const key = el.dataset.jobCount;
      if (key === "_total") return;
      const n = c[key] || 0;
      total += n;
      if (n > 0) { el.textContent = n; el.classList.add("is-visible"); }
    });
    const totalEl = document.querySelector('[data-job-count="_total"]');
    if (totalEl && total > 0) { totalEl.textContent = total; totalEl.classList.add("is-visible"); }
  } catch (e) {}
}

function wireNav() {
  // Populate sub-counts in the background — never blocks render.
  loadLeadCounts();
  loadJobCounts();

  // Quick-add toggle
  const qBtn = document.getElementById("quickadd-btn");
  const qMenu = document.getElementById("quickadd-menu");
  qBtn?.addEventListener("click", (e) => { e.stopPropagation(); qMenu.classList.toggle("is-open"); });

  // User menu toggle
  const uBtn = document.getElementById("user-btn");
  const uMenu = document.getElementById("user-menu");
  uBtn?.addEventListener("click", (e) => { e.stopPropagation(); uMenu.classList.toggle("is-open"); });

  // Close any open dropdown on outside click
  document.addEventListener("click", () => {
    qMenu?.classList.remove("is-open");
    uMenu?.classList.remove("is-open");
    document.querySelectorAll(".js-more .tnav__quickadd-menu").forEach((m) => m.classList.remove("is-open"));
    document.getElementById("g-results")?.classList.remove("is-open");
  });

  // Global search
  const search = document.getElementById("g-search");
  const results = document.getElementById("g-results");
  let debTimer;
  search?.addEventListener("input", () => {
    clearTimeout(debTimer);
    debTimer = setTimeout(async () => {
      const q = search.value.trim();
      if (q.length < 2) { results.classList.remove("is-open"); return; }
      try {
        const { results: data } = await fetchJSON("/api/search?q=" + encodeURIComponent(q));
        renderSearchResults(data);
      } catch (e) { /* swallow */ }
    }, 200);
  });
  search?.addEventListener("focus", () => { if (search.value.trim().length >= 2) results.classList.add("is-open"); });

  // ⌘K / Ctrl+K to focus search
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      search?.focus();
      search?.select();
    }
    // Escape closes menus
    if (e.key === "Escape") {
      qMenu?.classList.remove("is-open");
      uMenu?.classList.remove("is-open");
      results?.classList.remove("is-open");
    }
  });
}

function renderSearchResults(data) {
  const results = document.getElementById("g-results");
  if (!results) return;
  const groups = [];
  if (data.contacts?.length) groups.push({ label: "Contacts", items: data.contacts.map((c) => ({ url: "/crm/contact.html?id=" + c.id, label: c.name, meta: c.email })) });
  if (data.projects?.length) groups.push({ label: "Jobs", items: data.projects.map((p) => ({ url: "/crm/project.html?id=" + p.id, label: p.name, meta: p.contact_name })) });
  if (data.estimates?.length) groups.push({ label: "Estimates", items: data.estimates.map((e) => ({ url: "/crm/estimate.html?id=" + e.id, label: e.number, meta: e.contact_name })) });
  if (data.proposals?.length) groups.push({ label: "Proposals", items: data.proposals.map((p) => ({ url: "/crm/proposal.html?id=" + p.id, label: p.number, meta: p.contact_name })) });
  if (data.contracts?.length) groups.push({ label: "Contracts", items: data.contracts.map((c) => ({ url: "/crm/contract.html?id=" + c.id, label: c.number, meta: c.contact_name })) });
  if (data.leads?.length) groups.push({ label: "Leads", items: data.leads.map((l) => ({ url: "/crm/lead.html?id=" + l.id, label: l.name, meta: l.email })) });

  if (!groups.length) {
    results.innerHTML = `<div class="tnav__results-empty">No results</div>`;
  } else {
    results.innerHTML = groups.map((g) => `
      <div class="tnav__results-group">
        <span class="tnav__results-label">${esc(g.label)}</span>
        ${g.items.map((i) => `<a class="tnav__results-item" href="${i.url}">${esc(i.label)}<span class="meta">· ${esc(i.meta || "")}</span></a>`).join("")}
      </div>
    `).join("");
  }
  results.classList.add("is-open");
}

// ============================================================
// Utilities
// ============================================================
function fmtMoney(cents) { if (cents == null) return "—"; return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function parseMoney(s) { const n = Number(String(s || "").replace(/[^0-9.\-]/g, "")); return Math.round((isNaN(n) ? 0 : n) * 100); }
function fmtMoneyShort(cents) { if (cents == null) return "—"; const v = cents / 100; if (Math.abs(v) >= 10000) return "$" + Math.round(v / 1000) + "k"; return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date((iso + "").replace(" ", "T") + (iso.includes("T") || iso.includes("Z") ? "" : "Z"));
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}
// Absolute calendar date (no relative "Xh ago"). Use for dates that are about
// the day itself — e.g. an install date — not a recency timestamp. Parsed as a
// local date so a "YYYY-MM-DD" value never shifts a day across timezones.
function fmtDay(iso) {
  if (!iso) return "";
  const [y, m, d] = (iso + "").slice(0, 10).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(iso) { if (!iso) return ""; const d = new Date((iso + "").replace(" ", "T")); return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
function fmtTime(iso) { if (!iso) return ""; const [, t] = iso.split("T"); const [h, m] = (t || "00:00").split(":").map((n) => parseInt(n, 10)); const ap = h < 12 ? "am" : "pm"; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`; }
function esc(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const PILL_LABELS = {
  contracted: "Booked", scheduled_install: "Scheduled", installing: "Installing", completed: "Completed",
  scheduled: "Consult Booked", tier_selected: "Option selected", signed_by_customer: "Signed",
  fully_executed: "Executed", processing: "Processing",
};
function pill(s) { const label = PILL_LABELS[s] || (s || "").replace(/_/g, " "); return `<span class="pill" data-s="${esc(s)}">${esc(label)}</span>`; }
function initials(email) { return (email || "?").slice(0, 1).toUpperCase(); }
async function logout() {
  try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch (_) {}
  location.href = "/crm/login.html";
}

// Toast
function toast(msg, kind = "info") {
  let host = document.querySelector(".toast-host");
  if (!host) { host = document.createElement("div"); host.className = "toast-host"; document.body.appendChild(host); }
  const t = document.createElement("div"); t.className = `toast toast--${kind}`; t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => { t.classList.add("toast--out"); setTimeout(() => t.remove(), 320); }, 2800);
}

function confirmDialog(msg) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal"><div class="modal-body"><p style="margin:0">${esc(msg)}</p></div><div class="modal-foot"><button class="btn ghost" data-no>Cancel</button><button class="btn danger" data-yes>Confirm</button></div></div>`;
    document.body.appendChild(bg);
    bg.querySelector("[data-no]").onclick = () => { bg.remove(); resolve(false); };
    bg.querySelector("[data-yes]").onclick = () => { bg.remove(); resolve(true); };
    bg.addEventListener("click", (e) => { if (e.target === bg) { bg.remove(); resolve(false); } });
  });
}

// ============================================================
// Status taxonomies
// ============================================================
const PROJECT_STATUSES = [
  { key: "new",            label: "New" },
  { key: "scheduled",      label: "Consult Booked" },
  { key: "measured",       label: "Measured" },
  { key: "quoted",         label: "Quoted" },
  { key: "proposed",       label: "Proposed" },          // proposal sent OR signed-but-deposit-unpaid (still a lead)
  { key: "contracted",        label: "Booked" },        // contracted = deposit paid, job booked
  { key: "scheduled_install", label: "Scheduled" },     // install date scheduled
  { key: "installing",        label: "Installing" },
  { key: "completed",         label: "Completed" },
  { key: "lost",              label: "Lost" },
];

// ============================================================
// Icons (inline SVG)
// ============================================================
function iconDash() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`; }
function iconKanban() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="3" x2="3" y2="21"/><line x1="9" y1="3" x2="9" y2="15"/><line x1="15" y1="3" x2="15" y2="18"/><line x1="21" y1="3" x2="21" y2="13"/></svg>`; }
function iconLead() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`; }
function iconUsers() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`; }
function iconBriefcase() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`; }
function iconCal() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`; }
function iconDoc() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`; }
function iconBox() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/></svg>`; }
function iconMail() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>`; }
function iconActivity() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`; }
function iconReports() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`; }
function iconTraffic() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`; }
function iconSearch() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`; }
function iconInvoice() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>`; }
function iconExpense() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`; }
function iconTruck() { return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`; }

// Export
// ============================================================
// Quick-Add modal infrastructure
// ============================================================

// Generic modal builder: title + body HTML + array of footer buttons
function openModal({ title, body, buttons = [] }) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="modal-head">${esc(title)}</div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.kind || "ghost"}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div>
      </div>
    `;
    document.body.appendChild(bg);
    const close = (v) => { bg.remove(); resolve(v); };
    buttons.forEach((b, i) => bg.querySelector(`[data-i="${i}"]`).onclick = () => close(b.value !== undefined ? b.value : i));
    bg.addEventListener("click", (e) => { if (e.target === bg) close(null); });
    bg.querySelector(".modal-body input, .modal-body select, .modal-body textarea")?.focus();
  });
}

// Contact-picker modal — type-ahead, returns selected contact or null
async function pickContact({ allowNew = true } = {}) {
  return new Promise(async (resolve) => {
    const { contacts } = await fetchJSON("/api/contacts");
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-head">Pick a contact</div>
        <div class="modal-body">
          <input type="search" id="pc-q" placeholder="Search name, email…" autocomplete="off" autofocus
                 style="width:100%;padding:9px 12px;border:1px solid var(--line-strong);border-radius:var(--r-sm);font-size:13px;margin-bottom:12px"/>
          <div id="pc-list" style="max-height:340px;overflow-y:auto;border:1px solid var(--line-soft);border-radius:var(--r-sm)"></div>
        </div>
        <div class="modal-foot">
          ${allowNew ? `<button class="btn secondary" id="pc-new">+ New contact</button>` : ""}
          <button class="btn ghost" id="pc-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    const list = bg.querySelector("#pc-list");
    function render(filter = "") {
      const f = filter.toLowerCase();
      const matches = contacts.filter((c) => !f || (c.name + " " + c.email + " " + (c.phone || "")).toLowerCase().includes(f)).slice(0, 50);
      if (!matches.length) { list.innerHTML = `<div style="padding:30px;text-align:center;color:var(--ink-muted);font-size:13px">No contacts match.</div>`; return; }
      list.innerHTML = matches.map((c) => `
        <button type="button" data-id="${c.id}" style="display:block;width:100%;text-align:left;padding:10px 14px;background:transparent;border:0;border-bottom:1px solid var(--line-soft);cursor:pointer;font-size:13px">
          <strong style="color:var(--ink)">${esc(c.name)}</strong>
          <div style="color:var(--ink-soft);font-size:12px">${esc(c.email)}${c.phone ? " · " + esc(c.phone) : ""}</div>
        </button>
      `).join("");
      list.querySelectorAll("[data-id]").forEach((b) => b.onclick = () => { const c = contacts.find((x) => x.id === parseInt(b.dataset.id, 10)); bg.remove(); resolve(c); });
    }
    render();
    bg.querySelector("#pc-q").oninput = (e) => render(e.target.value);
    bg.querySelector("#pc-cancel").onclick = () => { bg.remove(); resolve(null); };
    bg.addEventListener("click", (e) => { if (e.target === bg) { bg.remove(); resolve(null); } });
    if (allowNew) {
      bg.querySelector("#pc-new").onclick = async () => {
        bg.remove();
        const c = await quickAddContact({ skipNav: true });
        resolve(c);
      };
    }
  });
}

// Job/project picker — pick from a contact's jobs (creates one if none exist)
async function pickJob(contactId) {
  const { contacts: [contact], projects } = await Promise.all([
    fetchJSON(`/api/contacts?q=`).then(async () => ({ contacts: [(await fetchJSON("/api/contacts/" + contactId)).contact] })),
    fetchJSON(`/api/projects?contact_id=${contactId}`),
  ]).then(([c, p]) => ({ ...c, ...p }));

  if (!projects.length) {
    // Auto-create one
    const name = prompt(`No job yet for ${contact.name}. Name a new job (e.g. 'Whole house', 'Kitchen + Baths'):`, "Whole house");
    if (!name) return null;
    const { id } = await fetchJSON("/api/projects", { method: "POST", body: JSON.stringify({ contact_id: contactId, name }) });
    return { id, name };
  }
  if (projects.length === 1) return projects[0];

  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-head">Pick a job for ${esc(contact.name)}</div>
        <div class="modal-body" style="display:grid;gap:6px;max-height:340px;overflow-y:auto">
          ${projects.map((p) => `<button class="btn ghost" data-pid="${p.id}" style="justify-content:space-between;padding:10px 12px;text-align:left"><strong>${esc(p.name)}</strong><span class="muted" style="font-size:12px">${esc(p.status)}</span></button>`).join("")}
          <button class="btn secondary" data-new="1" style="margin-top:8px">+ New job</button>
        </div>
        <div class="modal-foot"><button class="btn ghost" data-cancel>Cancel</button></div>
      </div>
    `;
    document.body.appendChild(bg);
    bg.querySelectorAll("[data-pid]").forEach((b) => b.onclick = () => { bg.remove(); resolve(projects.find((p) => p.id === parseInt(b.dataset.pid, 10))); });
    bg.querySelector("[data-new]").onclick = async () => {
      bg.remove();
      const name = prompt("New job name:", "");
      if (!name) return resolve(null);
      const { id } = await fetchJSON("/api/projects", { method: "POST", body: JSON.stringify({ contact_id: contactId, name }) });
      resolve({ id, name });
    };
    bg.querySelector("[data-cancel]").onclick = () => { bg.remove(); resolve(null); };
    bg.addEventListener("click", (e) => { if (e.target === bg) { bg.remove(); resolve(null); } });
  });
}

// ---- Quick-add actions ----

async function quickAddContact({ skipNav = false } = {}) {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-head">New contact</div>
      <div class="modal-body">
        <div class="form">
          <label><span>Full name</span><input id="qc-name" autofocus required/></label>
          <label><span>Email</span><input id="qc-email" type="email" required/></label>
          <label><span>Phone (optional)</span><input id="qc-phone" type="tel"/></label>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" data-cancel>Cancel</button>
        <button class="btn primary" data-save>Create &amp; open</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  return new Promise((resolve) => {
    bg.querySelector("[data-cancel]").onclick = () => { bg.remove(); resolve(null); };
    bg.querySelector("[data-save]").onclick = async () => {
      const name = bg.querySelector("#qc-name").value.trim();
      const email = bg.querySelector("#qc-email").value.trim();
      const phone = bg.querySelector("#qc-phone").value.trim();
      if (!name || !email) { toast("Name + email required", "error"); return; }
      try {
        const { id } = await fetchJSON("/api/contacts", { method: "POST", body: JSON.stringify({ name, email, phone: phone || null }) });
        bg.remove();
        if (!skipNav) location.href = "/crm/contact.html?id=" + id;
        resolve({ id, name, email, phone });
      } catch (e) { toast(e.message, "error"); }
    };
    bg.addEventListener("click", (e) => { if (e.target === bg) { bg.remove(); resolve(null); } });
  });
}

async function quickAddLead() {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-head">New lead</div>
      <div class="modal-body">
        <div class="form">
          <label><span>Name</span><input id="ql-name" autofocus required placeholder="Full name"/></label>
          <div class="row">
            <label><span>Phone</span><input id="ql-phone" type="tel"/></label>
            <label><span>Email <span class="muted" style="font-weight:400">(optional)</span></span><input id="ql-email" type="email"/></label>
          </div>
          <label><span>Interested in <span class="muted" style="font-weight:400">(optional)</span></span><input id="ql-interest" placeholder="e.g. Walk-in closet, pantry, garage"/></label>
          <label><span>Location <span class="muted" style="font-weight:400">(optional)</span></span><input id="ql-location" placeholder="City / area"/></label>
          <label><span>Notes <span class="muted" style="font-weight:400">(optional)</span></span><textarea id="ql-message" rows="2" placeholder="What did they ask for?"></textarea></label>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" data-cancel>Cancel</button>
        <button class="btn primary" data-save>Create &amp; open</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  const val = (id) => bg.querySelector("#ql-" + id).value.trim();
  return new Promise((resolve) => {
    const close = () => { bg.remove(); resolve(null); };
    const save = async () => {
      const name = val("name");
      if (!name) { toast("Name is required", "error"); bg.querySelector("#ql-name").focus(); return; }
      const btn = bg.querySelector("[data-save]"); btn.disabled = true; btn.textContent = "Creating…";
      try {
        const { id } = await fetchJSON("/api/leads", { method: "POST", body: JSON.stringify({
          name, phone: val("phone") || null, email: val("email") || null,
          interest: val("interest") || null, location: val("location") || null, message: val("message") || null,
        }) });
        bg.remove();
        location.href = "/crm/lead.html?id=" + id;
        resolve({ id });
      } catch (e) { toast(e.message, "error"); btn.disabled = false; btn.textContent = "Create & open"; }
    };
    bg.querySelector("[data-cancel]").onclick = close;
    bg.querySelector("[data-save]").onclick = save;
    bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
    // Enter in any single-line field submits.
    bg.querySelectorAll('input').forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }));
  });
}

async function quickAddJob() {
  const contact = await pickContact();
  if (!contact) return;
  const name = prompt(`Job name for ${contact.name}?`, "Whole house");
  if (!name) return;
  try {
    const { id } = await fetchJSON("/api/projects", { method: "POST", body: JSON.stringify({ contact_id: contact.id, name }) });
    location.href = "/crm/project.html?id=" + id;
  } catch (e) { toast(e.message, "error"); }
}

async function quickAddAppointment() {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  // Pre-fill with tomorrow 10:00 Central
  const tomorrow = new Date(Date.now() + 86400000);
  const defaultDate = tomorrow.toISOString().slice(0, 10);
  bg.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-head">Book appointment</div>
      <div class="modal-body">
        <div class="form">
          <label><span>Customer name</span><input id="qa-name" autofocus required/></label>
          <div class="row">
            <label><span>Email</span><input id="qa-email" type="email" required/></label>
            <label><span>Phone</span><input id="qa-phone" type="tel"/></label>
          </div>
          <div class="row">
            <label><span>Date</span><input id="qa-date" type="date" value="${defaultDate}" required/></label>
            <label><span>Start time</span><input id="qa-time" type="time" value="10:00" required/></label>
          </div>
          <div class="row">
            <label><span>Duration (min)</span><input id="qa-dur" type="number" value="60" min="15" step="15"/></label>
            <label><span>Type</span>
              <select id="qa-type"><option value="consultation">Consultation</option><option value="measure">Measure</option><option value="install">Install</option><option value="service">Service</option></select>
            </label>
          </div>
          <label><span>Site address (optional)</span><input id="qa-addr"/></label>
          <label><span>Rooms (optional)</span><input id="qa-rooms" placeholder="Living, primary BR, 2 baths"/></label>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn ghost" data-cancel>Cancel</button>
        <button class="btn primary" data-save>Book it</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.querySelector("[data-cancel]").onclick = close;
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelector("[data-save]").onclick = async () => {
    const date = bg.querySelector("#qa-date").value;
    const time = bg.querySelector("#qa-time").value;
    const dur = parseInt(bg.querySelector("#qa-dur").value || "60", 10);
    const [h, m] = time.split(":").map((n) => parseInt(n, 10));
    const totalMin = h * 60 + m + dur;
    const endTime = `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
    const body = {
      name: bg.querySelector("#qa-name").value.trim(),
      email: bg.querySelector("#qa-email").value.trim(),
      phone: bg.querySelector("#qa-phone").value.trim() || null,
      start_at: `${date}T${time}:00`,
      end_at: `${date}T${endTime}:00`,
      duration_min: dur,
      type: bg.querySelector("#qa-type").value,
      site_address: bg.querySelector("#qa-addr").value.trim() || null,
      rooms: bg.querySelector("#qa-rooms").value.trim() || null,
      status: "confirmed",
      source: "admin",
    };
    if (!body.name || !body.email) { toast("Name + email required", "error"); return; }
    try {
      await fetchJSON("/api/appointments", { method: "POST", body: JSON.stringify(body) });
      bg.remove();
      toast("Appointment booked", "success");
      if (location.pathname.includes("/calendar")) location.reload();
      else location.href = "/crm/calendar.html";
    } catch (e) { toast(e.message, "error"); }
  };
}

async function quickAddEstimate() {
  const contact = await pickContact();
  if (!contact) return;
  const job = await pickJob(contact.id);
  if (!job) return;
  try {
    const { id } = await fetchJSON("/api/estimates", { method: "POST", body: JSON.stringify({ project_id: job.id }) });
    location.href = "/crm/estimate.html?id=" + id;
  } catch (e) { toast(e.message, "error"); }
}

async function quickAddProposal() {
  const contact = await pickContact();
  if (!contact) return;
  const job = await pickJob(contact.id);
  if (!job) return;
  try {
    const { id } = await fetchJSON("/api/proposals", { method: "POST", body: JSON.stringify({ project_id: job.id }) });
    location.href = "/crm/proposal.html?id=" + id;
  } catch (e) { toast(e.message, "error"); }
}

async function quickAddContract() {
  const contact = await pickContact();
  if (!contact) return;
  const job = await pickJob(contact.id);
  if (!job) return;
  // Pick contract type
  const type = await new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-head">What kind of contract?</div>
        <div class="modal-body" style="display:grid;gap:8px">
          <button class="btn secondary" data-t="custom_order" style="justify-content:flex-start;padding:12px;text-align:left;flex-direction:column;align-items:flex-start;gap:2px"><strong style="font-size:13px">Custom Order</strong><span style="font-size:12px;color:var(--ink-soft);font-weight:400">We supply &amp; install. Deposit covers materials, shipping &amp; tax.</span></button>
          <button class="btn secondary" data-t="install_only" style="justify-content:flex-start;padding:12px;text-align:left;flex-direction:column;align-items:flex-start;gap:2px"><strong style="font-size:13px">Install Only · BYO Blinds</strong><span style="font-size:12px;color:var(--ink-soft);font-weight:400">Lowes/Home Depot/Costco/Blinds.com. No deposit.</span></button>
          <button class="btn secondary" data-t="repair" style="justify-content:flex-start;padding:12px;text-align:left;flex-direction:column;align-items:flex-start;gap:2px"><strong style="font-size:13px">Repair / Service Call</strong><span style="font-size:12px;color:var(--ink-soft);font-weight:400">Service-call fee + parts.</span></button>
        </div>
        <div class="modal-foot"><button class="btn ghost" data-no>Cancel</button></div>
      </div>
    `;
    document.body.appendChild(bg);
    bg.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => { bg.remove(); resolve(b.dataset.t); });
    bg.querySelector("[data-no]").onclick = () => { bg.remove(); resolve(null); };
    bg.addEventListener("click", (e) => { if (e.target === bg) { bg.remove(); resolve(null); } });
  });
  if (!type) return;
  try {
    const { id } = await fetchJSON("/api/contracts", { method: "POST", body: JSON.stringify({ project_id: job.id, contract_type: type }) });
    location.href = "/crm/contract.html?id=" + id;
  } catch (e) { toast(e.message, "error"); }
}


// ============================================================
// Email integration — Compose modal + Messages timeline
//
// composeEmail({ contact, lead, project, defaultKind, parent })
//   contact / lead / project — entity rows (with .id, .name, .email)
//   defaultKind              — template kind to auto-pick (e.g. "lead_new")
//   parent                   — { id, message_id_header, subject } when replying
//
// renderEmailTimeline(hostEl, { lead_id|contact_id|project_id, onCompose })
//   Mounts a live timeline into hostEl. Calls onCompose when user clicks the
//   Compose button (caller wires that to the modal with the right context).
// ============================================================

// Light client-side variable substitution so the live preview shows the
// admin what the customer will see. Server re-renders authoritatively on send.
const TPL_TOKEN_RE = /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;
function clientRender(tpl, vars) {
  if (!tpl) return "";
  return String(tpl).replace(TPL_TOKEN_RE, (_m, key) => {
    const v = vars?.[key];
    if (v == null || v === "") return `{{${key}}}`;
    return String(v);
  });
}

// Build the same {{vars}} dict the server would, from already-loaded entity rows
function clientBuildVars({ contact, lead, project }) {
  const name = (contact?.name) || (lead?.name) || "";
  const first_name = name.trim().split(/\s+/)[0].replace(/[^A-Za-z'\-]/g, "");
  const street = contact?.address_street || lead?.address_street || "";
  const city   = contact?.address_city   || lead?.address_city   || "";
  const state  = contact?.address_state  || lead?.address_state  || "";
  const zip    = contact?.address_zip    || lead?.address_zip    || "";
  const address = [street, [city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(", ");
  return {
    name, first_name,
    email: contact?.email || lead?.email || "",
    phone: contact?.phone || lead?.phone || "",
    street, city, state, zip, address,
    interest: lead?.interest || project?.name || "",
    quoted_amount: lead?.quoted_amount_cents ? fmtMoney(lead.quoted_amount_cents) : "",
    proposal_link: "", // populated server-side
    contract_link: "",
    appointment_date: "",
    appointment_time: "",
  };
}

async function composeEmail({ contact, lead, project, defaultKind, parent } = {}) {
  const peer = contact || lead || {};
  if (!peer.email) {
    toast("Add an email to this record first", "error");
    return null;
  }
  // Pull the active template list (filtered to a kind if defaultKind given;
  // otherwise show everything so the user can pick).
  const { templates } = await fetchJSON("/api/email-templates" + (defaultKind ? `?kind=${defaultKind}` : ""));
  // If no template auto-picked, also load all so the dropdown isn't empty
  const allTemplates = defaultKind
    ? (await fetchJSON("/api/email-templates").catch(() => ({ templates: [] }))).templates
    : templates;

  const initialTpl = templates.find((t) => t.is_default) || templates[0] || allTemplates[0] || null;
  const vars = clientBuildVars({ contact, lead, project });

  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="modal" style="max-width:760px;width:96vw">
        <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span>${parent ? "Reply" : "New email"} — ${esc(peer.name || peer.email)}</span>
          <select id="cm-tpl" style="font-size:13px;padding:6px 10px;border:1px solid var(--line);border-radius:var(--r-sm);max-width:280px">
            <option value="">— blank email —</option>
            ${allTemplates.map((t) => `<option value="${t.id}" ${initialTpl && initialTpl.id === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
          </select>
        </div>
        <div class="modal-body">
          <div class="form">
            <label><span>To</span><input id="cm-to" value="${esc(peer.email)}" required/></label>
            <details><summary style="cursor:pointer;font-size:12px;color:var(--ink-soft);margin-bottom:8px">Cc / Bcc</summary>
              <label><span>Cc</span><input id="cm-cc" placeholder="comma-separated"/></label>
              <label><span>Bcc</span><input id="cm-bcc" placeholder="comma-separated"/></label>
            </details>
            <label><span>Subject</span><input id="cm-subject" required/></label>
            <label><span>Message</span><textarea id="cm-body" rows="14" style="font-family:inherit;line-height:1.5"></textarea></label>
            <label style="margin-bottom:4px"><span>Attachments <span class="muted" style="font-weight:400">· max ~15 MB total</span></span>
              <input id="cm-files" type="file" multiple style="font-size:13px"/></label>
            <div id="cm-filelist" style="display:flex;flex-direction:column;gap:4px;margin:0 0 8px"></div>
            <p class="muted" style="font-size:11px;margin:0">Variables shown as <code>{{first_name}}</code> stay literal in the preview, get filled in server-side on send. Unresolved variables stay literal so you can spot missing data before sending.</p>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn ghost" data-cancel>Cancel</button>
          <button class="btn primary" data-send>Send →</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);

    const tplSel = bg.querySelector("#cm-tpl");
    const subjI  = bg.querySelector("#cm-subject");
    const bodyI  = bg.querySelector("#cm-body");

    // Attachments are read to base64 and sent inline in the JSON payload — they
    // go straight to the email provider, so no R2/upload round-trip. Resend caps
    // a message at ~40MB, but base64 inflates ~33% and we keep other JSON too,
    // so we guard the raw total at 15MB to stay comfortably under.
    const fileIn = bg.querySelector("#cm-files");
    const fileListEl = bg.querySelector("#cm-filelist");
    const MAX_TOTAL = 15 * 1024 * 1024;
    let chosen = [];  // [{ file }]
    function fmtSize(n) { return n < 1024 * 1024 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
    function renderFiles() {
      const total = chosen.reduce((s, c) => s + c.file.size, 0);
      const over = total > MAX_TOTAL;
      fileListEl.innerHTML = chosen.map((c, i) =>
        `<div style="display:flex;align-items:center;gap:8px;font-size:12px;background:var(--bg-soft);padding:5px 9px;border-radius:var(--r-sm)">
           <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📎 ${esc(c.file.name)}</span>
           <span class="muted">${fmtSize(c.file.size)}</span>
           <button type="button" data-rm="${i}" style="border:0;background:none;color:var(--ink-soft);cursor:pointer;font-size:15px;line-height:1">×</button>
         </div>`).join("")
        + (chosen.length ? `<div class="muted" style="font-size:11px;margin-top:2px;${over ? "color:#B91C1C;font-weight:600" : ""}">Total: ${fmtSize(total)}${over ? " — over the 15 MB limit, remove some files" : ""}</div>` : "");
      fileListEl.querySelectorAll("[data-rm]").forEach((b) =>
        b.onclick = () => { chosen.splice(parseInt(b.dataset.rm, 10), 1); renderFiles(); });
    }
    fileIn.addEventListener("change", () => {
      for (const f of fileIn.files) chosen.push({ file: f });
      fileIn.value = "";  // allow re-picking the same file after removing it
      renderFiles();
    });
    function readB64(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);  // strip data: prefix
        r.onerror = () => rej(new Error("read failed"));
        r.readAsDataURL(file);
      });
    }
    function loadTemplate(tplId) {
      const t = allTemplates.find((x) => String(x.id) === String(tplId));
      if (!t) return;
      subjI.value = clientRender(t.subject, vars);
      bodyI.value = clientRender(t.body_text || "", vars);
    }
    if (initialTpl) loadTemplate(initialTpl.id);
    tplSel.addEventListener("change", () => loadTemplate(tplSel.value));

    // Reply mode prefills subject "Re: ..." and parent_message_id
    if (parent) {
      const s = parent.subject || "";
      subjI.value = s.replace(/^(re:\s*)+/i, "").trim();
      subjI.value = "Re: " + subjI.value;
    }

    function close(result) { bg.remove(); resolve(result); }
    bg.querySelector("[data-cancel]").onclick = () => close(null);
    bg.addEventListener("click", (e) => { if (e.target === bg) close(null); });

    bg.querySelector("[data-send]").onclick = async () => {
      const btn = bg.querySelector("[data-send]");
      const total = chosen.reduce((s, c) => s + c.file.size, 0);
      if (total > MAX_TOTAL) { toast("Attachments exceed 15 MB — remove some files.", "error"); return; }
      btn.disabled = true; btn.textContent = "Sending…";
      let attachments = [];
      try {
        attachments = await Promise.all(chosen.map(async (c) => ({
          filename: c.file.name,
          content: await readB64(c.file),
          content_type: c.file.type || "application/octet-stream",
        })));
      } catch (e) {
        toast("Could not read an attachment — try again.", "error");
        btn.disabled = false; btn.textContent = "Send →"; return;
      }
      const payload = {
        attachments: attachments.length ? attachments : undefined,
        contact_id: contact?.id || null,
        lead_id:    lead?.id    || null,
        project_id: project?.id || null,
        template_id: tplSel.value ? parseInt(tplSel.value, 10) : null,
        to:      bg.querySelector("#cm-to").value.trim(),
        cc:      bg.querySelector("#cm-cc").value.trim() || null,
        bcc:     bg.querySelector("#cm-bcc").value.trim() || null,
        subject: subjI.value.trim(),
        body_text: bodyI.value,
        parent_message_id: parent?.id || null,
      };
      try {
        const res = await fetchJSON("/api/email-messages", { method: "POST", body: JSON.stringify(payload) });
        toast(res.ok ? "Sent" : ("Send failed: " + (res.error || "unknown")), res.ok ? "success" : "error");
        close(res);
      } catch (e) {
        toast(e.message || "Send failed", "error");
        btn.disabled = false; btn.textContent = "Send →";
      }
    };
  });
}

async function renderEmailTimeline(hostEl, { lead_id, contact_id, project_id, onCompose } = {}) {
  if (!hostEl) return;
  const params = new URLSearchParams();
  if (lead_id != null) params.set("lead_id", lead_id);
  if (contact_id != null) params.set("contact_id", contact_id);
  if (project_id != null) params.set("project_id", project_id);
  if (![...params.keys()].length) return;

  hostEl.innerHTML = `<p class="muted" style="font-size:13px;padding:8px 0">Loading messages…</p>`;
  let messages = [];
  try {
    const r = await fetchJSON("/api/email-messages?" + params.toString());
    messages = r.messages || [];
  } catch (e) {
    hostEl.innerHTML = `<p class="muted" style="font-size:13px;padding:8px 0">Couldn't load messages: ${esc(e.message)}</p>`;
    return;
  }

  const composeBtn = onCompose
    ? `<button class="btn primary sm" id="email-compose-btn">+ Compose</button>`
    : "";

  if (!messages.length) {
    hostEl.innerHTML = `
      <div style="text-align:center;padding:24px 12px">
        <p class="muted" style="font-size:13px;margin:0 0 12px">No emails yet — start the conversation.</p>
        ${composeBtn}
      </div>`;
  } else {
    hostEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <span class="muted" style="font-size:12px">${messages.length} message${messages.length === 1 ? "" : "s"} · newest first</span>
        ${composeBtn}
      </div>
      <ul class="email-thread">
        ${messages.map((m) => renderMessageRow(m)).join("")}
      </ul>`;
  }

  const cb = hostEl.querySelector("#email-compose-btn");
  if (cb && onCompose) cb.addEventListener("click", () => onCompose());

  // Wire expand-toggles on each row
  hostEl.querySelectorAll(".email-row__head").forEach((h) => {
    h.addEventListener("click", () => h.closest(".email-row").classList.toggle("is-open"));
  });
}

function renderMessageRow(m) {
  const isOut = m.direction === "out";
  const dt = m.sent_at || m.received_at || m.created_at;
  const previewBody = m.body_text ? m.body_text.slice(0, 120).replace(/\s+/g, " ") + (m.body_text.length > 120 ? "…" : "") : "";
  const statusPill = m.status === "failed"
    ? `<span class="pill" data-s="lost" style="font-size:10px">failed</span>`
    : "";
  return `
    <li class="email-row email-row--${isOut ? "out" : "in"}">
      <button class="email-row__head" type="button">
        <span class="email-row__dir">${isOut ? "↗" : "↙"}</span>
        <div class="email-row__meta">
          <div class="email-row__subject">${esc(m.subject || "(no subject)")}</div>
          <div class="email-row__sub">${esc(previewBody)}</div>
        </div>
        <div class="email-row__right">
          <span class="email-row__date">${fmtDate(dt)}</span>
          ${statusPill}
        </div>
      </button>
      <div class="email-row__body">
        <div class="email-row__hdr">
          <strong>${isOut ? "To" : "From"}:</strong> ${esc((isOut ? safeJSON(m.to_addrs)?.join(", ") : (m.from_name ? `${m.from_name} <${m.from_addr}>` : m.from_addr)) || "")}<br/>
          <strong>Subject:</strong> ${esc(m.subject || "")}<br/>
          <strong>Date:</strong> ${fmtDateTime(dt)}
          ${m.template_kind ? `<br/><strong>Template:</strong> ${esc(m.template_kind)}` : ""}
          ${m.error_message ? `<br/><strong style="color:var(--danger,#dc2626)">Error:</strong> <code>${esc(m.error_message)}</code>` : ""}
        </div>
        <pre class="email-row__pre">${esc(m.body_text || stripHtmlClient(m.body_html) || "(no body)")}</pre>
        ${(() => {
          const att = safeJSON(m.attachments_meta);
          if (!Array.isArray(att) || !att.length) return "";
          const kb = (n) => n < 1024 * 1024 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB";
          return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${att.map((a) =>
            `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;background:var(--bg-soft);border:1px solid var(--line);padding:3px 9px;border-radius:100px">📎 ${esc(a.filename || "file")}<span class="muted">${a.bytes ? kb(a.bytes) : ""}</span></span>`).join("")}</div>`;
        })()}
      </div>
    </li>`;
}
function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function stripHtmlClient(s) { return s ? String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : ""; }

// Record an in-person / manual payment against an invoice (Cash, Check, etc.).
// Opens a modal, posts mark_paid (full or partial), resolves to the API result
// (or null if cancelled). Shared by the lead and job pages.
// doc = { id, number?, amount_cents, amount_paid_cents }. opts:
//   endpoint  — POST target (default /api/invoices/<id>); pass /api/expenses/<id> for bills
//   title     — modal heading
//   receipt   — show the "email a receipt" checkbox (default true; false for bills)
//   dateLabel — label for the date field
function recordPayment(doc, opts = {}) {
  const endpoint = opts.endpoint || `/api/invoices/${doc.id}`;
  const showReceipt = opts.receipt !== false;
  const title = opts.title || ("Record payment · " + (doc.number || "Invoice"));
  const dateLabel = opts.dateLabel || "Date received";
  const remaining = Math.max(0, (doc.amount_cents || 0) - (doc.amount_paid_cents || 0));
  const today = new Date().toISOString().slice(0, 10);

  // One-tap amounts so an off-schedule payment doesn't need mental arithmetic.
  // opts.jobBalanceCents (when the caller knows the whole-job figure) adds a
  // "Full job balance" chip — the common case of a customer settling everything
  // at once, which would otherwise mean adding up the remaining milestones.
  const quickAmounts = [];
  if (remaining > 0) {
    quickAmounts.push({ cents: remaining, label: "This invoice · " + fmtMoney(remaining), title: "Remaining balance on this invoice" });
    const half = Math.round(remaining / 2);
    if (half > 0 && half !== remaining) quickAmounts.push({ cents: half, label: "Half · " + fmtMoney(half), title: "Half of this invoice's balance" });
  }
  const jobBal = opts.jobBalanceCents;
  if (Number.isFinite(jobBal) && jobBal > 0 && jobBal !== remaining) {
    quickAmounts.push({ cents: jobBal, label: "Full job balance · " + fmtMoney(jobBal), title: "Everything still owed on the whole job" });
  }
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="modal" style="max-width:460px">
        <div class="modal-head">${esc(title)}</div>
        <div class="modal-body">
          <div class="form">
            <label><span>Amount</span><input id="rp-amt" type="text" value="${fmtMoney(remaining)}" inputmode="decimal"/></label>
            <div id="rp-quick" style="display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 2px">
              ${quickAmounts.map((q) => `<button type="button" class="btn ghost sm" data-amt="${q.cents}"
                 style="font-size:12px;padding:4px 10px" title="${esc(q.title || "")}">${esc(q.label)}</button>`).join("")}
            </div>
            <div class="row">
              <label><span>Method</span><select id="rp-method"><option>Check</option><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Other</option></select></label>
              <label><span>Reference <span class="muted" style="font-weight:400">(check #, etc.)</span></span><input id="rp-ref" placeholder="optional"/></label>
            </div>
            <label><span>${esc(dateLabel)}</span><input id="rp-date" type="date" value="${today}"/></label>
            ${showReceipt ? `<label style="flex-direction:row;align-items:center;gap:8px;margin-top:2px"><input id="rp-receipt" type="checkbox" checked style="width:16px;height:16px"/> <span>Email the customer a receipt</span></label>` : ""}
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn ghost" data-cancel>Cancel</button>
          <button class="btn primary" data-save>Record payment</button>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const close = (v) => { bg.remove(); resolve(v); };
    bg.querySelector("[data-cancel]").onclick = () => close(null);
    bg.addEventListener("click", (e) => { if (e.target === bg) close(null); });

    // Quick-amount chips fill the field; the admin can still type any figure.
    const amtI = bg.querySelector("#rp-amt");
    const noteEl = document.createElement("p");
    noteEl.className = "muted";
    noteEl.style.cssText = "font-size:11px;margin:2px 0 0";
    amtI.parentElement.appendChild(noteEl);
    function checkAmt() {
      const v = parseMoney(amtI.value);
      noteEl.textContent = v > remaining
        ? `Over this invoice's ${fmtMoney(remaining)} balance — the extra is applied to the job's other open invoices.`
        : "";
      noteEl.style.color = v > remaining ? "#B45309" : "";
    }
    bg.querySelectorAll("#rp-quick [data-amt]").forEach((b) => {
      b.onclick = () => { amtI.value = fmtMoney(parseInt(b.dataset.amt, 10)); checkAmt(); amtI.focus(); };
    });
    amtI.addEventListener("input", checkAmt);
    bg.querySelector("[data-save]").onclick = async () => {
      const btn = bg.querySelector("[data-save]");
      const amt = parseMoney(bg.querySelector("#rp-amt").value);
      if (!amt || amt <= 0) { toast("Enter a valid amount", "error"); return; }
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const r = await fetchJSON(endpoint, { method: "POST", body: JSON.stringify({
          action: "mark_paid", amount_cents: amt,
          method: bg.querySelector("#rp-method").value,
          reference: bg.querySelector("#rp-ref").value.trim(),
          paid_at: bg.querySelector("#rp-date").value,
          send_receipt: showReceipt ? bg.querySelector("#rp-receipt").checked : false,
        })});
        const extra = (r.applied || []).length
          ? ` · also applied to ${r.applied.length} more invoice${r.applied.length === 1 ? "" : "s"}` : "";
        const over = r.unapplied_cents > 0 ? ` · ${fmtMoney(r.unapplied_cents)} over the job total` : "";
        toast((r.paid ? "Paid in full" : "Payment recorded") + extra + over, over ? "error" : "success");
        close(r);
      } catch (e) { toast(e.message || "Could not record payment", "error"); btn.disabled = false; btn.textContent = "Record payment"; }
    };
  });
}

window.SSCrm = {
  fetchJSON, mount, fmtMoney, fmtMoneyShort, parseMoney, fmtDate, fmtDay, fmtDateTime, fmtTime, esc, pill, logout, toast, confirmDialog,
  pickContact, pickJob, openModal, recordPayment,
  quickAddLead, quickAddContact, quickAddJob, quickAddAppointment, quickAddEstimate, quickAddProposal, quickAddContract,
  composeEmail, renderEmailTimeline,
  PROJECT_STATUSES,
};
