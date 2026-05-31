// Shared admin JS — auth check, fetch helpers, formatting.
// Lead pipeline only: booked + installed are job statuses now (see Jobs).
const STATUS_LABELS = {
  new: "New",
  replied: "Replied",
  consult: "Consult",
  proposal: "Proposal",
  lost: "Lost",
};
const STATUS_ORDER = ["new", "replied", "consult", "proposal", "lost"];

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    ...opts,
    headers: { "Content-Type": "application/json", "Accept": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    if (!location.pathname.endsWith("/login.html")) {
      location.href = "/crm/login.html?next=" + encodeURIComponent(location.pathname + location.search);
    }
    throw new Error("Unauthorized");
  }
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error((body && body.error) || ("HTTP " + res.status));
  return body;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + "Z");
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pill(status) {
  return `<span class="pill" data-status="${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span>`;
}

async function logout() {
  try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch (_) {}
  location.href = "/crm/login.html";
}

// Render the shared sidebar nav and load user + status counts
async function renderSidebar({ activeStatus = null } = {}) {
  const me = await fetchJSON("/api/auth/me");
  document.querySelectorAll("[data-user-email]").forEach((el) => { el.textContent = me.user.email; });

  // Use the leads endpoint to grab counts; cheap query
  let counts = {};
  try {
    const { counts: c } = await fetchJSON("/api/leads?limit=1");
    counts = c || {};
  } catch (_) {}

  const section = document.querySelector(".js-status-nav");
  if (section) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const allActive = activeStatus === null ? " is-active" : "";
    let html = `<a class="admin__nav-link${allActive}" href="/crm/">All <span class="admin__nav-count">${total}</span></a>`;
    for (const s of STATUS_ORDER) {
      const n = counts[s] || 0;
      const isActive = activeStatus === s ? " is-active" : "";
      html += `<a class="admin__nav-link${isActive}" href="/crm/?status=${s}">${STATUS_LABELS[s]} <span class="admin__nav-count">${n}</span></a>`;
    }
    section.innerHTML = html;
  }
}

// --------------------------------------------------------------
// Section nav — the lifecycle modules. Built dynamically so any page can
// drop a `<div class="js-section-nav"></div>` into its sidebar to get it.
// --------------------------------------------------------------
const SECTIONS = [
  { href: "/crm/",            label: "Leads" },
  { href: "/crm/calendar.html", label: "Calendar" },
  { href: "/crm/contacts.html", label: "Contacts" },
  { href: "/crm/projects.html", label: "Projects" },
  { href: "/crm/estimates.html", label: "Estimates" },
  { href: "/crm/proposals.html", label: "Proposals" },
  { href: "/crm/contracts.html", label: "Contracts" },
  { href: "/crm/products.html", label: "Products" },
  { href: "/crm/availability.html", label: "Availability" },
];

function renderSectionNav(activeHref) {
  const el = document.querySelector(".js-section-nav");
  if (!el) return;
  const path = activeHref || location.pathname;
  el.innerHTML = SECTIONS.map((s) => {
    const isActive = s.href === path || (s.href !== "/crm/" && path.startsWith(s.href.replace(".html", "")));
    return `<a class="admin__nav-link${isActive ? " is-active" : ""}" href="${s.href}">${s.label}</a>`;
  }).join("");
}

// --------------------------------------------------------------
// Inject a complete sidebar into any admin page that has just
// <body><script>SSAdmin.mount({ title: '…' })</script></body>
// --------------------------------------------------------------
async function mount({ title = "", subtitle = "", actions = "" } = {}) {
  const me = await fetchJSON("/api/auth/me").catch(() => null);
  if (!me) return; // fetchJSON already redirected to login
  document.title = `${title} · National Closet Company CRM`;
  const root = document.getElementById("app") || document.body;
  root.innerHTML = `
    <div class="admin">
      <aside class="admin__nav">
        <a href="/crm/" class="admin__brand">
          <span class="admin__brand-monogram" aria-hidden="true">S<span>S</span></span>
          <span class="admin__brand-text"><strong>National Closet Company</strong><span>CRM</span></span>
        </a>
        <div class="admin__nav-section">
          <span class="admin__nav-label">Workspace</span>
          <div class="js-section-nav"></div>
        </div>
        <div class="admin__nav-user">
          <span>${esc(me.user.email)}</span>
          <button onclick="SSAdmin.logout()">Sign out</button>
        </div>
      </aside>
      <main class="admin__main">
        <header class="admin__header">
          <div>
            <h1 id="page-title">${title}</h1>
            ${subtitle ? `<p class="admin__sub">${subtitle}</p>` : ""}
          </div>
          <div class="admin__actions">${actions}</div>
        </header>
        <div id="page"></div>
      </main>
    </div>
  `;
  renderSectionNav();
  return me.user;
}

// --------------------------------------------------------------
// Money helpers (cents <-> dollars)
// --------------------------------------------------------------
function fmtMoney(cents) {
  if (cents == null) return "—";
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseMoney(str) {
  if (!str) return 0;
  const n = Number(String(str).replace(/[^0-9.\-]/g, ""));
  return Math.round((isNaN(n) ? 0 : n) * 100);
}

// --------------------------------------------------------------
// Toast notifications
// --------------------------------------------------------------
function toast(msg, kind = "info") {
  let host = document.querySelector(".toast-host");
  if (!host) { host = document.createElement("div"); host.className = "toast-host"; document.body.appendChild(host); }
  const t = document.createElement("div");
  t.className = `toast toast--${kind}`;
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => { t.classList.add("toast--out"); setTimeout(() => t.remove(), 320); }, 3000);
}

// --------------------------------------------------------------
// Simple confirm/prompt modals (avoid window.confirm — ugly UX)
// --------------------------------------------------------------
function confirmDialog(msg) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <p>${esc(msg)}</p>
        <div class="modal__buttons">
          <button class="btn-secondary" data-no>Cancel</button>
          <button class="btn-primary" data-yes>Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-no]").onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector("[data-yes]").onclick = () => { overlay.remove(); resolve(true); };
  });
}

window.SSAdmin = {
  fetchJSON, fmtDate, fmtDateTime, fmtMoney, parseMoney,
  esc, pill, logout, renderSidebar, renderSectionNav, mount, toast, confirmDialog,
  STATUS_LABELS, STATUS_ORDER, SECTIONS,
};
