// GET /api/search?q=...  — global search across leads, contacts, projects, docs
import { requireAuth, json } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) return json({ results: {} });
  const like = `%${q}%`;
  const D = context.env.DB;
  const LIMIT = 5;

  const [contacts, projects, estimates, proposals, contracts, leads] = await Promise.all([
    D.prepare(`SELECT id, name, email, phone FROM contacts WHERE name LIKE ?1 OR email LIKE ?1 OR phone LIKE ?1 ORDER BY updated_at DESC LIMIT ${LIMIT}`).bind(like).all(),
    D.prepare(`SELECT p.id, p.name, c.name AS contact_name FROM projects p JOIN contacts c ON c.id = p.contact_id WHERE p.name LIKE ?1 OR c.name LIKE ?1 ORDER BY p.updated_at DESC LIMIT ${LIMIT}`).bind(like).all(),
    D.prepare(`SELECT e.id, e.number, c.name AS contact_name FROM estimates e JOIN projects p ON p.id=e.project_id JOIN contacts c ON c.id=p.contact_id WHERE e.number LIKE ?1 OR c.name LIKE ?1 ORDER BY e.created_at DESC LIMIT ${LIMIT}`).bind(like).all(),
    D.prepare(`SELECT pr.id, pr.number, c.name AS contact_name FROM proposals pr JOIN projects p ON p.id=pr.project_id JOIN contacts c ON c.id=p.contact_id WHERE pr.number LIKE ?1 OR c.name LIKE ?1 ORDER BY pr.created_at DESC LIMIT ${LIMIT}`).bind(like).all(),
    D.prepare(`SELECT k.id, k.number, c.name AS contact_name FROM contracts k JOIN projects p ON p.id=k.project_id JOIN contacts c ON c.id=p.contact_id WHERE k.number LIKE ?1 OR c.name LIKE ?1 ORDER BY k.created_at DESC LIMIT ${LIMIT}`).bind(like).all(),
    D.prepare(`SELECT id, name, email FROM leads WHERE archived_at IS NULL AND (name LIKE ?1 OR email LIKE ?1 OR phone LIKE ?1) ORDER BY created_at DESC LIMIT ${LIMIT}`).bind(like).all(),
  ]);

  return json({
    results: {
      contacts: contacts.results || [],
      projects: projects.results || [],
      estimates: estimates.results || [],
      proposals: proposals.results || [],
      contracts: contracts.results || [],
      leads: leads.results || [],
    },
  });
}
