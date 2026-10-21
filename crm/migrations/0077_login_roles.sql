-- 2026-10-21 — roles on the CRM logins (Michael): admin, sales, installer.
--
-- Until now every login could see and do everything. `_lib/roles.js` holds
-- what each role may call; `requireAuth` enforces it. A new login is sales
-- unless it is given another role (Team page, or setup-admin.mjs --role).
-- An installer's jobs come from the roster: the team_members row with the
-- login's email, and that member's `assignments`.
--
-- The two logins that exist today stay admins: hello@nationalclosetco.com
-- (Anthony Potts, the business's admin account) and Terry McCarthy, the owner.
--
-- Apply (before deploying the code that reads the column):
--   set -a; . ~/.env; set +a; unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL
--   npx wrangler d1 execute nationalcloset-crm --remote --file=crm/migrations/0077_login_roles.sql

ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'sales';  -- admin | sales | installer

UPDATE admin_users SET role = 'admin'
 WHERE LOWER(email) IN ('hello@nationalclosetco.com', 'tmccarthy33@yahoo.com');
