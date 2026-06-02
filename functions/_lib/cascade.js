// Manual cascade deletes.
//
// Cloudflare D1 (SQLite) does NOT enforce foreign keys by default, so the
// `ON DELETE CASCADE` / `ON DELETE SET NULL` clauses in our schema never fire.
// Deleting a parent row therefore leaves child rows behind as orphans — e.g.
// deleting a project used to leave its contracts in place, which kept counting
// toward the dashboard's pipeline value. These helpers delete the whole subtree
// by hand so nothing is ever orphaned.
//
// Keep this as the single source of truth for cascade order; every delete
// endpoint (leads, projects, contracts) routes through it.

async function run(DB, sql, ...binds) {
  return DB.prepare(sql).bind(...binds).run();
}
async function ids(DB, sql, ...binds) {
  const r = await DB.prepare(sql).bind(...binds).all();
  return (r.results || []).map((x) => x.id);
}

// Delete a single invoice + its line items.
export async function deleteInvoiceDeep(DB, invoiceId) {
  await run(DB, `DELETE FROM invoice_lines WHERE invoice_id=?1`, invoiceId);
  await run(DB, `DELETE FROM invoices WHERE id=?1`, invoiceId);
}

// Delete a single contract: its line items, any invoices generated from it
// (deposit/balance), and activity.
export async function deleteContractDeep(DB, contractId) {
  for (const iid of await ids(DB, `SELECT id FROM invoices WHERE contract_id=?1`, contractId)) {
    await deleteInvoiceDeep(DB, iid);
  }
  await run(DB, `DELETE FROM contract_lines WHERE contract_id=?1`, contractId);
  await run(DB, `DELETE FROM activity_log WHERE entity_type='contract' AND entity_id=?1`, contractId);
  await run(DB, `DELETE FROM contracts WHERE id=?1`, contractId);
}

// Delete a proposal and everything it generated — its tiers/lines/comments,
// AND the contracts + invoices created from it — but LEAVE the parent project
// and lead intact (deleting a proposal just unwinds that quote, not the job).
export async function deleteProposalDeep(DB, proposalId) {
  // Contracts generated from this proposal (each takes its own invoices + lines)
  for (const cid of await ids(DB, `SELECT id FROM contracts WHERE proposal_id=?1`, proposalId)) {
    await deleteContractDeep(DB, cid);
  }
  // Invoices tied directly to the proposal (not via a contract)
  for (const iid of await ids(DB, `SELECT id FROM invoices WHERE proposal_id=?1`, proposalId)) {
    await deleteInvoiceDeep(DB, iid);
  }
  // The proposal's own subtree
  for (const tid of await ids(DB, `SELECT id FROM proposal_tiers WHERE proposal_id=?1`, proposalId)) {
    await run(DB, `DELETE FROM proposal_tier_lines WHERE tier_id=?1`, tid);
  }
  await run(DB, `DELETE FROM proposal_tiers WHERE proposal_id=?1`, proposalId);
  await run(DB, `DELETE FROM proposal_comments WHERE proposal_id=?1`, proposalId);
  await run(DB, `DELETE FROM activity_log WHERE entity_type='proposal' AND entity_id=?1`, proposalId);
  await run(DB, `DELETE FROM proposals WHERE id=?1`, proposalId);
}

// Delete a project and EVERYTHING under it: contracts(+lines), estimates(+lines),
// proposals(+tiers,+tier_lines,+comments), invoices(+lines), windows, documents,
// communications, plus the project's activity. Email + appointment links are
// nulled (so real inbound emails are kept) unless `purge` is set, in which case
// they're deleted too.
export async function deleteProjectCascade(DB, projectId, opts = {}) {
  const purge = !!opts.purge;

  // Contracts → lines
  for (const cid of await ids(DB, `SELECT id FROM contracts WHERE project_id=?1`, projectId)) {
    await run(DB, `DELETE FROM contract_lines WHERE contract_id=?1`, cid);
    await run(DB, `DELETE FROM activity_log WHERE entity_type='contract' AND entity_id=?1`, cid);
  }
  await run(DB, `DELETE FROM contracts WHERE project_id=?1`, projectId);

  // Estimates → lines
  for (const eid of await ids(DB, `SELECT id FROM estimates WHERE project_id=?1`, projectId)) {
    await run(DB, `DELETE FROM estimate_lines WHERE estimate_id=?1`, eid);
    await run(DB, `DELETE FROM activity_log WHERE entity_type='estimate' AND entity_id=?1`, eid);
  }
  await run(DB, `DELETE FROM estimates WHERE project_id=?1`, projectId);

  // Proposals → tiers → tier_lines, + comments
  for (const pid of await ids(DB, `SELECT id FROM proposals WHERE project_id=?1`, projectId)) {
    for (const tid of await ids(DB, `SELECT id FROM proposal_tiers WHERE proposal_id=?1`, pid)) {
      await run(DB, `DELETE FROM proposal_tier_lines WHERE tier_id=?1`, tid);
    }
    await run(DB, `DELETE FROM proposal_tiers WHERE proposal_id=?1`, pid);
    await run(DB, `DELETE FROM proposal_comments WHERE proposal_id=?1`, pid);
    await run(DB, `DELETE FROM activity_log WHERE entity_type='proposal' AND entity_id=?1`, pid);
  }
  await run(DB, `DELETE FROM proposals WHERE project_id=?1`, projectId);

  // Invoices → lines
  for (const iid of await ids(DB, `SELECT id FROM invoices WHERE project_id=?1`, projectId)) {
    await run(DB, `DELETE FROM invoice_lines WHERE invoice_id=?1`, iid);
  }
  await run(DB, `DELETE FROM invoices WHERE project_id=?1`, projectId);

  // Other project-scoped children
  await run(DB, `DELETE FROM windows WHERE project_id=?1`, projectId);
  await run(DB, `DELETE FROM documents WHERE project_id=?1`, projectId);
  await run(DB, `DELETE FROM communications WHERE project_id=?1`, projectId);

  // Appointments + emails: keep the records but unlink, unless purging.
  if (purge) {
    await run(DB, `DELETE FROM appointments WHERE project_id=?1`, projectId);
    await run(DB, `DELETE FROM email_messages WHERE project_id=?1`, projectId);
  } else {
    await run(DB, `UPDATE appointments SET project_id=NULL WHERE project_id=?1`, projectId);
    await run(DB, `UPDATE email_messages SET project_id=NULL WHERE project_id=?1`, projectId);
  }

  await run(DB, `DELETE FROM activity_log WHERE entity_type='project' AND entity_id=?1`, projectId);
  await run(DB, `DELETE FROM projects WHERE id=?1`, projectId);
}

// Delete a lead and all of its projects (each via the full project cascade),
// its notes, and its activity. Email/appointment links are nulled unless purge.
export async function deleteLeadCascade(DB, leadId, opts = {}) {
  const purge = !!opts.purge;
  for (const pid of await ids(DB, `SELECT id FROM projects WHERE lead_id=?1`, leadId)) {
    await deleteProjectCascade(DB, pid, { purge });
  }
  await run(DB, `DELETE FROM lead_notes WHERE lead_id=?1`, leadId);
  if (purge) {
    await run(DB, `DELETE FROM appointments WHERE lead_id=?1`, leadId);
    await run(DB, `DELETE FROM email_messages WHERE lead_id=?1`, leadId);
  } else {
    await run(DB, `UPDATE appointments SET lead_id=NULL WHERE lead_id=?1`, leadId);
    await run(DB, `UPDATE email_messages SET lead_id=NULL WHERE lead_id=?1`, leadId);
  }
  await run(DB, `DELETE FROM activity_log WHERE entity_type='lead' AND entity_id=?1`, leadId);
  await run(DB, `DELETE FROM leads WHERE id=?1`, leadId);
}
