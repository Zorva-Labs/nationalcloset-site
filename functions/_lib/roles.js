// CRM roles (Michael, 2026-10-21). Every login in `admin_users` has one:
//
//   admin     — everything. hello@nationalclosetco.com and the owner's login.
//   sales     — leads, clients, jobs, the calendar and scheduling, proposals,
//               contracts and invoices. No expenses/bills, vendors, reports,
//               traffic, inbox, team or template editing, lead import.
//   installer — only the jobs they are assigned to (team_members ↔ the login
//               by email, `assignments` for the job), read-only, no money; the
//               calendar shows only those jobs' installs and visits.
//
// The one gate is `requireAuth` (_lib/auth.js), which every CRM endpoint
// already calls: it asks `canCall()` before the endpoint runs, so a route
// added later is admin-only until it is listed here. The installer's
// per-job scoping is in the endpoints that serve them (`/api/crew/*`,
// `/api/appointments`, `/api/attachments/:id`) through the helpers below.
// The CRM pages hide what a role can't open (crm-app.js), but the server is
// what enforces it.

export const ROLES = ["admin", "sales", "installer"];
export const ROLE_LABEL = { admin: "Admin", sales: "Sales", installer: "Installer" };

export function normalizeRole(r) {
  const s = String(r || "").toLowerCase().trim();
  return ROLES.includes(s) ? s : null;
}

// Path rules: [prefix, methods] — methods "*" for every method, else a list.
// A prefix matches itself and anything under it ("/api/leads" covers
// "/api/leads/12/notes"). `DENY` wins over `ALLOW`.
const RULES = {
  sales: {
    ALLOW: [
      ["/api/leads", "*"],
      ["/api/contacts", "*"],
      ["/api/projects", "*"],
      ["/api/appointments", "*"],
      ["/api/calendar-feed-url", "*"],
      ["/api/proposals", "*"],
      ["/api/contracts", "*"],
      ["/api/invoices", "*"],
      ["/api/estimates", "*"],
      ["/api/attachments", "*"],
      ["/api/email-messages", "*"],   // a lead's and a job's Messages tab
      ["/api/dashboard", ["GET"]],
      ["/api/search", ["GET"]],
      ["/api/activity", ["GET"]],     // the job's and the lead's history
      ["/api/crew", ["GET"]],         // the install worksheet
      ["/api/team", ["GET"]],         // the assignee pickers
      ["/api/vendors", ["GET"]],      // the job's vendor picker
      ["/api/email-templates", ["GET"]],
      ["/api/document-templates", ["GET"]],
    ],
    DENY: [
      ["/api/leads/import", "*"],
    ],
  },
  installer: {
    ALLOW: [
      ["/api/crew", ["GET"]],
      ["/api/appointments", ["GET"]],
      ["/api/attachments", ["GET"]],
    ],
    DENY: [],
  },
};

function matches(rule, method, path) {
  const [prefix, methods] = rule;
  const hit = path === prefix || path.startsWith(prefix + "/");
  return hit && (methods === "*" || methods.includes(method));
}

// May this role call this endpoint at all? (Scoping to a job is the endpoint's.)
export function canCall(role, method, pathname) {
  if (role === "admin") return true;
  const r = RULES[role];
  if (!r) return false;
  const m = String(method || "GET").toUpperCase();
  const p = String(pathname || "").replace(/\/+$/, "");
  if (r.DENY.some((rule) => matches(rule, m, p))) return false;
  return r.ALLOW.some((rule) => matches(rule, m, p));
}

export const isInstaller = (user) => !!user && user.role === "installer";

// The jobs an installer is on: every project their team member is assigned to.
// A login with no team member (no roster row with its email) has none.
export async function assignedProjectIds(db, user) {
  if (!user || !user.teamMemberId) return [];
  const rows = (await db.prepare(
    `SELECT entity_id FROM assignments WHERE entity_type='project' AND team_member_id=?1`
  ).bind(user.teamMemberId).all().catch(() => ({ results: [] }))).results || [];
  return rows.map((r) => r.entity_id);
}

export async function canSeeProject(db, user, projectId) {
  if (!isInstaller(user)) return true;
  return (await assignedProjectIds(db, user)).includes(Number(projectId));
}

// An installer sees a visit when they are on it, or it belongs to one of their jobs.
export async function canSeeAppointment(db, user, appt) {
  if (!isInstaller(user)) return true;
  if (!appt) return false;
  if (appt.project_id && (await assignedProjectIds(db, user)).includes(Number(appt.project_id))) return true;
  const on = await db.prepare(
    `SELECT 1 FROM assignments WHERE entity_type='appointment' AND entity_id=?1 AND team_member_id=?2`
  ).bind(appt.id, user.teamMemberId || 0).first().catch(() => null);
  return !!on;
}
