// Single source of truth for how each proposal "kind" maps to its option(s)
// and the contract that should attach when the customer accepts that option.
//
//  - custom:        two options — walls as-is (custom_order) / wall repair + paint (wallprep)
//  - install_only:  one option  — BYO install (install_only contract)
//  - repair:        one option  — repair / service (repair contract)
//
// Each tier carries its OWN contract_type, so the matching contract is created
// automatically based on which option the customer picks.

export function proposalTiersForKind(kind, tpl) {
  if (kind === "install_only") {
    return [{ key: "good", title: tpl?.tier_good_title || "Professional Installation — Your Closets, Expertly Installed", contract_type: "install_only" }];
  }
  if (kind === "repair") {
    return [{ key: "good", title: tpl?.tier_good_title || "Closet Repair & Service", contract_type: "repair" }];
  }
  // custom (default)
  return [
    { key: "good",   title: tpl?.tier_good_title   || "Option 1 · Design & Install (walls as-is)",                 contract_type: "custom_order" },
    { key: "better", title: tpl?.tier_better_title || "Option 2 · Design & Install + Wall Repair & Fresh Paint",   contract_type: "wallprep" },
  ];
}

// The contract type to default the proposal to (used as a fallback when a tier
// has no explicit contract_type — e.g. legacy rows).
export function defaultContractTypeForKind(kind) {
  return { custom: "custom_order", install_only: "install_only", repair: "repair" }[kind] || "custom_order";
}
