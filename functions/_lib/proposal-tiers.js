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
    {
      key: "good", contract_type: "custom_order",
      title: tpl?.tier_good_title || "The Essentials · Design & Install",
      description: tpl?.tier_good_desc || "Walls as-is. Before we install, you handle the prep — remove the old shelving, patch the walls, and paint. We then design, build, and professionally install your new custom closet system.",
    },
    {
      key: "better", contract_type: "wallprep",
      title: tpl?.tier_better_title || "The Full Service · Turnkey Install + Wall Refresh",
      description: tpl?.tier_better_desc || "Turnkey — we do it all. National Closet Company removes your old shelving, patches and repairs the walls, and paints, then designs, builds, and installs your new custom closet system. Nothing for you to do.",
    },
  ];
}

// The contract type to default the proposal to (used as a fallback when a tier
// has no explicit contract_type — e.g. legacy rows).
export function defaultContractTypeForKind(kind) {
  return { custom: "custom_order", install_only: "install_only", repair: "repair" }[kind] || "custom_order";
}
