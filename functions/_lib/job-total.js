// What a job is worth when it carries more than one deal: a second proposal
// accepted and signed on a job that was already booked (Don Bruce, 2026-09-01:
// the shoe tower, then the laundry room, on one project). Until 2026-10-03 every
// total read the single newest contract, so the job showed the laundry alone.
//
// The rule, in one place for every list, report and invoice:
// - each signed contract counts once; a revision of the same proposal signed
//   again counts only its newest (two signed contracts from one proposal are
//   the same work, not two jobs);
// - with nothing signed, the most authoritative contract (executed > signed >
//   sent > newest), as before;
// - the accepted tiers follow the same rule: the proposals with a signed
//   contract are summed, otherwise the newest accepted proposal alone.
//
// `pid` is the SQL expression for the project id: "p.id" inside a jobs query,
// "?1" for a single project.

const SIGNED = `('signed_by_customer','fully_executed')`;

export function contractTotalSql(pid = "p.id") {
  return `COALESCE(
    (SELECT SUM(k.total_cents) FROM contracts k
      WHERE k.project_id=${pid} AND k.status IN ${SIGNED}
        AND NOT EXISTS (SELECT 1 FROM contracts k2 WHERE k2.project_id=k.project_id AND k2.proposal_id=k.proposal_id
                          AND k2.status IN ${SIGNED} AND k2.id>k.id)),
    (SELECT k.total_cents FROM contracts k WHERE k.project_id=${pid}
      ORDER BY CASE k.status WHEN 'fully_executed' THEN 0 WHEN 'signed_by_customer' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END,
               datetime(k.created_at) DESC LIMIT 1))`;
}

// The selected tier's column (subtotal_cents = gross, total_cents = net) over
// the job's accepted proposals; selected_total_cents when col is "selected".
export function acceptedTierSql(col, pid = "p.id") {
  const val = col === "selected" ? "pr.selected_total_cents" : `t.${col}`;
  const join = col === "selected" ? "" : "JOIN proposal_tiers t ON t.proposal_id=pr.id AND t.tier=pr.selected_tier";
  return `COALESCE(
    (SELECT SUM(${val}) FROM proposals pr ${join}
      WHERE pr.project_id=${pid} AND pr.status='accepted'
        AND EXISTS (SELECT 1 FROM contracts k WHERE k.proposal_id=pr.id AND k.status IN ${SIGNED})),
    (SELECT ${val} FROM proposals pr ${join}
      WHERE pr.project_id=${pid} AND pr.status='accepted' ORDER BY datetime(pr.created_at) DESC LIMIT 1))`;
}
