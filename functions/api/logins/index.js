// /api/logins — the CRM's sign-ins and their roles (admin only: not listed in
// _lib/roles.js, so requireAuth refuses every other role). Used by the Team page.
//
// GET                                              — every login
// POST { action: "create", email, display_name, role } — new login, password made up and returned once
// POST { action: "set_role", id, role }
// POST { action: "reset_password", id }            — new password returned once; signs them out
// POST { action: "remove", id }                    — deletes the login and its sessions
//
// There is always at least one admin, and nobody changes or removes their own login here.
import { requireAuth, json, hashPassword, generateSalt } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";
import { normalizeRole } from "../../_lib/roles.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const rows = (await context.env.DB.prepare(
    `SELECT id, email, display_name, role, last_login_at, created_at FROM admin_users ORDER BY id`
  ).all()).results || [];
  return json({ logins: rows, me: auth.id });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const db = context.env.DB;
  const body = await context.request.json().catch(() => ({}));
  const log = (entityId, action, details) => recordActivity(db, {
    entityType: "login", entityId, action, actorKind: "admin", actorId: auth.id, actorName: auth.email, details,
  }).catch(() => {});

  if (body.action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    const role = normalizeRole(body.role);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "That email doesn't look right" }, 400);
    if (!role) return json({ error: "Pick a role" }, 400);
    if (await db.prepare(`SELECT id FROM admin_users WHERE LOWER(email)=?1`).bind(email).first()) {
      return json({ error: "That email already has a login" }, 409);
    }
    const password = generatePassword();
    const salt = generateSalt();
    const r = await db.prepare(
      `INSERT INTO admin_users (email, password_hash, password_salt, display_name, role) VALUES (?1,?2,?3,?4,?5) RETURNING id`
    ).bind(email, await hashPassword(password, salt), salt, String(body.display_name || "").trim() || email.split("@")[0], role).first();
    await log(r.id, "created", { email, role });
    return json({ ok: true, id: r.id, email, password }, 201);
  }

  const id = parseInt(body.id, 10);
  const target = id ? await db.prepare(`SELECT id, email, role FROM admin_users WHERE id=?1`).bind(id).first() : null;
  if (!target) return json({ error: "No such login" }, 404);
  if (target.id === auth.id && body.action !== "reset_password") {
    return json({ error: "You can't change or remove your own login. Ask another admin." }, 400);
  }
  const otherAdmins = async () => (await db.prepare(
    `SELECT COUNT(*) AS n FROM admin_users WHERE role='admin' AND id<>?1`
  ).bind(target.id).first()).n;

  if (body.action === "set_role") {
    const role = normalizeRole(body.role);
    if (!role) return json({ error: "Pick a role" }, 400);
    if (target.role === "admin" && role !== "admin" && !(await otherAdmins())) {
      return json({ error: "That is the only admin. Make someone else an admin first." }, 400);
    }
    await db.prepare(`UPDATE admin_users SET role=?1 WHERE id=?2`).bind(role, target.id).run();
    await log(target.id, "role-changed", { email: target.email, from: target.role, to: role });
    return json({ ok: true });
  }

  if (body.action === "reset_password") {
    const password = generatePassword();
    const salt = generateSalt();
    await db.batch([
      db.prepare(`UPDATE admin_users SET password_hash=?1, password_salt=?2 WHERE id=?3`).bind(await hashPassword(password, salt), salt, target.id),
      db.prepare(`DELETE FROM sessions WHERE user_id=?1`).bind(target.id),
    ]);
    await log(target.id, "password-reset", { email: target.email });
    return json({ ok: true, email: target.email, password });
  }

  if (body.action === "remove") {
    if (target.role === "admin" && !(await otherAdmins())) {
      return json({ error: "That is the only admin. Make someone else an admin first." }, 400);
    }
    // D1 never fires ON DELETE CASCADE, so the sessions go by hand.
    await db.batch([
      db.prepare(`DELETE FROM sessions WHERE user_id=?1`).bind(target.id),
      db.prepare(`DELETE FROM admin_users WHERE id=?1`).bind(target.id),
    ]);
    await log(target.id, "removed", { email: target.email, role: target.role });
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
}

// 14 characters with the look-alikes left out, as crm/setup-admin.mjs makes them.
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 14; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
