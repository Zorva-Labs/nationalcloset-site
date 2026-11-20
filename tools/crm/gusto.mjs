#!/usr/bin/env node
// Gusto ↔ the CRM (Michael, 2026-11-20). Gusto's API is open to its partners only,
// so the CRM can't call it; this Mac reads Gusto through the Gusto connector in a
// Claude session (the daily scheduled task "ncc-gusto-sync") and this tool writes
// what it read into the live D1. It never moves money: a contractor payment is
// only ever prepared as a Gusto draft, and a person submits it in Gusto.
//
//   node tools/crm/gusto.mjs status
//       what is owed, what is waiting in Gusto, when the last sync ran
//   node tools/crm/gusto.mjs owed [--json]
//       crew pay entered on jobs and not yet in Gusto, by contractor — what the
//       sync puts in the Gusto draft (contractor uuid, amount, the bills it covers)
//   node tools/crm/gusto.mjs mark-prepared <id,id,…>
//       those bills are in a Gusto draft now ("Ready to submit in Gusto")
//   node tools/crm/gusto.mjs unprepare <id,id,…>
//       the draft was discarded in Gusto: back to owed
//   node tools/crm/gusto.mjs ingest <file.json>
//       write Gusto's side into the CRM. The file is the connector's answers as
//       they came: { "contractors": get_contractors, "payments": get_contractor_payments,
//       "payrolls": list_payrolls (include=totals), "tasks": get_tasks }, any of them
//       optional. A Funded contractor payment closes the crew pay bills it paid
//       (same contractor, same amount — one bill, or the prepared ones together);
//       one with no crew pay behind it (Michael's monthly, say) becomes a paid bill
//       under "Contractor pay". A submitted W-2 payroll becomes a paid "Payroll"
//       bill for what Gusto withdrew. Every one of them lands in Cash flow.
//
// Company: National Closet Company, Gusto uuid af5d38c7-02ba-463f-9e5e-4bd114577d43
// (never 17d3d78a…, the duplicate). Reads and writes the live D1 over the
// Cloudflare API with CLOUDFLARE_API_TOKEN from ~/.env.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const ACCOUNT_ID = "90656e3c5d6b57a43d0b2bb60c53e5b0";
const DB_ID = "f5787ce4-29f9-43be-bf0e-cb486f1ec8e9";
export const GUSTO_COMPANY = "af5d38c7-02ba-463f-9e5e-4bd114577d43";

const env = Object.fromEntries(
  readFileSync(`${homedir()}/.env`, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return i < 0 ? [l, ""] : [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  })
);
const argv = process.argv.slice(2);
const cmd = argv[0];
const has = (n) => argv.includes(`--${n}`);
const die = (m) => { console.error(m); process.exit(1); };
const ids = (v) => String(v || "").split(/[,\s]+/).map((s) => parseInt(s, 10)).filter((n) => n > 0);
const cents = (v) => Math.round(Number(v || 0) * 100);
const $ = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function q(sql, params = []) {
  if (!env.CLOUDFLARE_API_TOKEN) die("CLOUDFLARE_API_TOKEN is not in ~/.env");
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) die(`D1: ${JSON.stringify(j.errors)}`);
  return j.result[0].results;
}

async function owedRows() {
  return q(`SELECT e.id, e.amount_cents - e.amount_paid_cents AS due_cents, e.category, e.bill_date, e.notes,
                   e.project_id, p.name AS project, t.name AS person, t.gusto_contractor_uuid
              FROM expenses e
              LEFT JOIN projects p ON p.id = e.project_id
              LEFT JOIN team_members t ON t.id = e.team_member_id
             WHERE e.source = 'crew_pay' AND e.gusto_status = 'owed' AND e.status = 'unpaid'
             ORDER BY e.id`);
}

async function owed() {
  const rows = await owedRows();
  const by = new Map(), unlinked = [];
  for (const r of rows) {
    if (!r.gusto_contractor_uuid) { unlinked.push(r); continue; }
    const g = by.get(r.gusto_contractor_uuid) || { contractor_uuid: r.gusto_contractor_uuid, name: r.person, total_cents: 0, expense_ids: [], lines: [] };
    g.total_cents += r.due_cents; g.expense_ids.push(r.id);
    g.lines.push({ id: r.id, project: r.project, kind: r.category, amount_cents: r.due_cents, note: r.notes });
    by.set(r.gusto_contractor_uuid, g);
  }
  const out = { company_uuid: GUSTO_COMPANY, contractors: [...by.values()], not_in_gusto: unlinked };
  if (has("json")) { console.log(JSON.stringify(out, null, 2)); return; }
  if (!rows.length) { console.log("Nobody is owed crew pay."); return; }
  for (const g of out.contractors) {
    console.log(`${g.name}  ${$(g.total_cents)}  (contractor ${g.contractor_uuid})`);
    for (const l of g.lines) console.log(`   #${l.id}  ${l.kind} — ${l.project}  ${$(l.amount_cents)}${l.note ? "  · " + l.note : ""}`);
  }
  for (const r of unlinked) console.log(`NOT IN GUSTO: #${r.id} ${r.person} ${r.category} — ${r.project} ${$(r.due_cents)} (pay outside Gusto, then mark paid on Expenses)`);
}

async function setState(list, from, to) {
  if (!list.length) die("Give the bill ids, e.g. 12,13");
  const rows = await q(`SELECT id, gusto_status FROM expenses WHERE source = 'crew_pay' AND id IN (${list.join(",")})`);
  for (const r of rows) {
    if (r.gusto_status !== from) { console.log(`#${r.id} is ${r.gusto_status}, left as it is`); continue; }
    await q(`UPDATE expenses SET gusto_status = ?1, prepared_at = ${to === "prepared" ? "datetime('now')" : "NULL"}, updated_at = datetime('now') WHERE id = ?2`, [to, r.id]);
    console.log(`#${r.id} → ${to}`);
  }
  const missing = list.filter((i) => !rows.some((r) => r.id === i));
  if (missing.length) console.log(`not crew pay: ${missing.join(", ")}`);
}

// One payment closes bill(s): the payment + the bill's balance go to Cash flow.
async function closeBill(exp, amount, paidOn, ref) {
  const paidAt = `${paidOn} 12:00:00`;
  await q(`INSERT INTO expense_payments (expense_id, amount_cents, method, note, paid_at) VALUES (?1, ?2, 'Gusto direct deposit', ?3, ?4)`,
    [exp.id, amount, `Gusto payment ${ref}`, paidAt]);
  await q(`UPDATE expenses SET amount_paid_cents = amount_paid_cents + ?1, status = 'paid', gusto_status = 'paid', gusto_ref = ?2,
             paid_at = ?3, method = 'Gusto direct deposit', updated_at = datetime('now') WHERE id = ?4`, [amount, ref, paidAt, exp.id]);
}

async function paidBill({ vendor, description, category, amount, day, ref, memberId }) {
  const paidAt = `${day} 12:00:00`;
  const [row] = await q(
    `INSERT INTO expenses (vendor, description, category, amount_cents, amount_paid_cents, status, bill_date, due_date, paid_at, method,
                           created_by, team_member_id, source, gusto_status, gusto_ref)
     VALUES (?1, ?2, ?3, ?4, ?4, 'paid', ?5, ?5, ?6, 'Gusto direct deposit', 'gusto-sync', ?7, 'gusto', 'paid', ?8) RETURNING id`,
    [vendor, description, category, amount, day, paidAt, memberId || null, ref]);
  await q(`INSERT INTO expense_payments (expense_id, amount_cents, method, note, paid_at) VALUES (?1, ?2, 'Gusto direct deposit', ?3, ?4)`,
    [row.id, amount, `Gusto ${ref}`, paidAt]);
  return row.id;
}

// The crew pay bills a funded payment paid: one bill of that amount, else the
// prepared ones together, else the oldest open ones that add up to it.
function matchBills(open, amount) {
  const one = open.find((b) => b.prepared && b.due === amount) || open.find((b) => b.due === amount);
  if (one) return [one];
  const prepared = open.filter((b) => b.prepared);
  if (prepared.length && prepared.reduce((a, b) => a + b.due, 0) === amount) return prepared;
  let sum = 0; const run = [];
  for (const b of open) { run.push(b); sum += b.due; if (sum === amount) return run; if (sum > amount) break; }
  return null;
}

async function ingest(file) {
  if (!file) die("ingest <file.json>");
  const data = JSON.parse(readFileSync(file, "utf8"));
  const log = [];
  const team = await q(`SELECT id, name, gusto_contractor_uuid FROM team_members WHERE gusto_contractor_uuid IS NOT NULL`);
  const memberOf = (uuid) => team.find((t) => t.gusto_contractor_uuid === uuid) || null;

  // Contractors
  const contractors = Array.isArray(data.contractors) ? data.contractors : (data.contractors?.contractors || []);
  for (const c of contractors) {
    if (c.company_uuid && c.company_uuid !== GUSTO_COMPANY) continue;
    const name = c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.uuid;
    await q(`INSERT INTO gusto_contractors (uuid, name, kind, department, email, start_date, is_active, onboarded, onboarding_status, payment_method, team_member_id, synced_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11, datetime('now'))
             ON CONFLICT(uuid) DO UPDATE SET name=excluded.name, kind=excluded.kind, department=excluded.department, email=excluded.email,
               start_date=excluded.start_date, is_active=excluded.is_active, onboarded=excluded.onboarded, onboarding_status=excluded.onboarding_status,
               payment_method=excluded.payment_method, team_member_id=excluded.team_member_id, synced_at=excluded.synced_at`,
      [c.uuid, name, c.type || null, c.department_title || null, c.email || null, c.start_date || null, c.is_active ? 1 : 0,
       c.onboarded ? 1 : 0, c.onboarding_status || null, c.payment_method || null, memberOf(c.uuid)?.id || null]);
  }
  if (contractors.length) log.push(`${contractors.length} contractors`);

  // Contractor payments
  const payments = (data.payments?.contractor_payments || []).flatMap((g) => g.payments || []);
  const names = Object.fromEntries((await q(`SELECT uuid, name FROM gusto_contractors`)).map((r) => [r.uuid, r.name]));
  let closed = 0, added = 0;
  for (const p of payments) {
    const total = cents(p.wage_total ?? p.wage) + cents(p.bonus) + cents(p.reimbursement);
    await q(`INSERT INTO gusto_payments (uuid, contractor_uuid, pay_date, status, wage_cents, bonus_cents, reimbursement_cents, total_cents, payment_method, synced_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9, datetime('now'))
             ON CONFLICT(uuid) DO UPDATE SET pay_date=excluded.pay_date, status=excluded.status, wage_cents=excluded.wage_cents, bonus_cents=excluded.bonus_cents,
               reimbursement_cents=excluded.reimbursement_cents, total_cents=excluded.total_cents, payment_method=excluded.payment_method, synced_at=excluded.synced_at`,
      [p.uuid, p.contractor_uuid, p.date, p.status || null, cents(p.wage), cents(p.bonus), cents(p.reimbursement), total, p.payment_method || null]);
    if (p.status !== "Funded" || total <= 0) continue;
    const [done] = await q(`SELECT g.expense_id, (SELECT id FROM expenses WHERE gusto_ref = ?1 OR gusto_ref LIKE ?1 || '#%' LIMIT 1) AS ref_id FROM gusto_payments g WHERE g.uuid = ?1`, [p.uuid]);
    if (done?.expense_id || done?.ref_id) continue;
    const member = memberOf(p.contractor_uuid);
    let firstId = null;
    if (member) {
      const open = (await q(`SELECT id, amount_cents - amount_paid_cents AS due, gusto_status FROM expenses
                              WHERE source = 'crew_pay' AND status = 'unpaid' AND team_member_id = ?1 AND gusto_status IN ('prepared','owed')
                              ORDER BY prepared_at IS NULL, id`, [member.id])).map((b) => ({ ...b, prepared: b.gusto_status === "prepared" }));
      const hit = matchBills(open, total);
      if (hit) {
        for (let i = 0; i < hit.length; i++) await closeBill(hit[i], hit[i].due, p.date, hit.length > 1 ? `${p.uuid}#${i + 1}` : p.uuid);
        firstId = hit[0].id; closed += hit.length;
      }
    }
    if (!firstId) {
      firstId = await paidBill({ vendor: names[p.contractor_uuid] || member?.name || "Contractor", description: "Gusto contractor payment",
        category: "Contractor pay", amount: total, day: p.date, ref: p.uuid, memberId: member?.id });
      added++;
    }
    await q(`UPDATE gusto_payments SET expense_id = ?1 WHERE uuid = ?2`, [firstId, p.uuid]);
  }
  if (payments.length) log.push(`${payments.length} contractor payments (${closed} crew pay closed, ${added} new paid bills)`);

  // YTD per contractor (the 1099 figure)
  if (payments.length || contractors.length) {
    await q(`UPDATE gusto_contractors SET ytd_paid_cents = COALESCE((SELECT SUM(total_cents) FROM gusto_payments g
               WHERE g.contractor_uuid = gusto_contractors.uuid AND g.status = 'Funded' AND substr(g.pay_date,1,4) = strftime('%Y','now')), 0)`);
  }

  // W-2 payrolls
  const payrolls = data.payrolls?.payrolls || (Array.isArray(data.payrolls) ? data.payrolls : []);
  let prAdded = 0;
  for (const p of payrolls) {
    if (p.company_uuid && p.company_uuid !== GUSTO_COMPANY) continue;
    const t = p.totals || {};
    const uuid = p.payroll_uuid || p.uuid;
    await q(`INSERT INTO gusto_payrolls (uuid, period_start, period_end, check_date, processed, processed_date, off_cycle, gross_cents, net_cents, employer_tax_cents, company_debit_cents, synced_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11, datetime('now'))
             ON CONFLICT(uuid) DO UPDATE SET period_start=excluded.period_start, period_end=excluded.period_end, check_date=excluded.check_date,
               processed=excluded.processed, processed_date=excluded.processed_date, off_cycle=excluded.off_cycle, gross_cents=excluded.gross_cents,
               net_cents=excluded.net_cents, employer_tax_cents=excluded.employer_tax_cents, company_debit_cents=excluded.company_debit_cents, synced_at=excluded.synced_at`,
      [uuid, p.pay_period?.start_date || null, p.pay_period?.end_date || null, p.check_date || null, p.processed ? 1 : 0, p.processed_date || null,
       p.off_cycle ? 1 : 0, cents(t.gross_pay), cents(t.net_pay), cents(t.employer_taxes), cents(t.company_debit)]);
    if (!p.processed || !cents(t.company_debit)) continue;
    const [have] = await q(`SELECT expense_id FROM gusto_payrolls WHERE uuid = ?1`, [uuid]);
    const [ref] = await q(`SELECT id FROM expenses WHERE gusto_ref = ?1`, [uuid]);
    if (have?.expense_id || ref) continue;
    const eid = await paidBill({ vendor: "Gusto payroll", description: `W-2 payroll ${p.pay_period?.start_date} to ${p.pay_period?.end_date} (wages and taxes withdrawn)`,
      category: "Payroll", amount: cents(t.company_debit), day: p.check_date, ref: uuid });
    await q(`UPDATE gusto_payrolls SET expense_id = ?1 WHERE uuid = ?2`, [eid, uuid]);
    prAdded++;
  }
  if (payrolls.length) log.push(`${payrolls.length} payrolls (${prAdded} new paid bills)`);

  // To-dos: replaced wholesale
  const tasks = data.tasks?.tasks || (Array.isArray(data.tasks) ? data.tasks : null);
  if (tasks) {
    await q(`DELETE FROM gusto_tasks`);
    for (const t of tasks) {
      await q(`INSERT INTO gusto_tasks (id, category, title, message, priority, due_at, deep_link) VALUES (?1,?2,?3,?4,?5,?6,?7)`,
        [t.id, t.category || null, String(t.title || "").replace(/\s+/g, " ").trim(), t.message || null, t.priority || null, t.due_at || null, t.deep_link || null]);
    }
    log.push(`${tasks.length} to-dos`);
  }

  const summary = log.join("; ") || "nothing in the file";
  await q(`INSERT INTO gusto_sync (summary) VALUES (?1)`, [summary]);
  console.log("Ingested: " + summary);
  await status();
}

async function status() {
  const [s] = await q(`SELECT
      COALESCE(SUM(CASE WHEN gusto_status='owed' THEN amount_cents - amount_paid_cents END),0) AS owed,
      COALESCE(SUM(CASE WHEN gusto_status='prepared' THEN amount_cents - amount_paid_cents END),0) AS prepared,
      SUM(gusto_status='owed') AS n_owed, SUM(gusto_status='prepared') AS n_prepared
    FROM expenses WHERE source = 'crew_pay' AND status = 'unpaid'`);
  const [last] = await q(`SELECT ran_at, summary FROM gusto_sync ORDER BY id DESC LIMIT 1`);
  const high = await q(`SELECT title, due_at FROM gusto_tasks WHERE priority = 'high' OR (due_at IS NOT NULL AND due_at <= date('now','+14 days')) ORDER BY due_at`);
  console.log(`Crew pay owed (not in Gusto): ${$(s.owed)} on ${s.n_owed || 0} bill(s)`);
  console.log(`Ready to submit in Gusto:     ${$(s.prepared)} on ${s.n_prepared || 0} bill(s)`);
  for (const t of high) console.log(`Gusto to-do: ${t.title}${t.due_at ? " — due " + t.due_at : ""}`);
  console.log(`Last sync: ${last ? last.ran_at + " UTC — " + last.summary : "never"}`);
}

const run = { status, owed, ingest: () => ingest(argv[1]),
  "mark-prepared": () => setState(ids(argv[1]), "owed", "prepared"),
  unprepare: () => setState(ids(argv[1]), "prepared", "owed") }[cmd];
if (!run) die("usage: gusto.mjs status | owed [--json] | mark-prepared <ids> | unprepare <ids> | ingest <file.json>");
await run();
