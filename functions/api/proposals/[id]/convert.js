// POST /api/proposals/[id]/convert — admin shortcut: turn a proposal into a draft contract
import { requireAuth, json } from "../../../_lib/auth.js";
import { createContractFromProposalTier } from "../../../_lib/lifecycle.js";

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const proposalId = parseInt(context.params.id, 10);
  const proposal = await context.env.DB.prepare(`SELECT * FROM proposals WHERE id = ?1`).bind(proposalId).first();
  if (!proposal) return json({ error: "Proposal not found" }, 404);
  try {
    const result = await createContractFromProposalTier(context.env.DB, proposal, { kind: "admin", id: auth.id, name: auth.email });
    return json({ id: result.contract_id, number: result.contract_number, view_token: result.view_token });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
