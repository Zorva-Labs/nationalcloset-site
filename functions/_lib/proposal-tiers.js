// Single source of truth for how each proposal "kind" maps to its option(s),
// the contract that attaches when the customer accepts, and the intro wording.
//
//  - custom (default): two options — Option 1 walls as-is (custom_order) /
//                      Option 2 turnkey wall repair + paint (wallprep)
//  - single:           one option  — straightforward design + install for jobs
//                      that DON'T need walls repaired or old shelving removed
//                      (custom_order contract)
//
// Each tier carries its OWN contract_type, so the matching contract is created
// automatically based on which option the customer picks.

export function proposalTiersForKind(kind, tpl) {
  if (kind === "single") {
    return [
      {
        key: "good", contract_type: "custom_order",
        title: tpl?.tier_good_title || "Custom Closet — Design, Build & Professional Install",
        description: tpl?.tier_good_desc || "We design, build, and professionally install your new custom closet system. No wall repair or removal of old shelving is needed — your space is install-ready, so we go straight to a clean, beautiful installation.",
      },
    ];
  }
  // custom (default) — two options
  return [
    {
      key: "good", contract_type: "custom_order",
      title: tpl?.tier_good_title || "Option 1",
      description: tpl?.tier_good_desc || "Walls as-is. Before we install, you handle the prep — remove the old shelving, patch the walls, and paint. We then design, build, and professionally install your new custom closet system.",
    },
    {
      key: "better", contract_type: "wallprep",
      title: tpl?.tier_better_title || "Option 2",
      description: tpl?.tier_better_desc || "Turnkey — we do it all. National Closet Company removes your old shelving, patches and repairs the walls, and paints, then designs, builds, and installs your new custom closet system. Nothing for you to do.",
    },
  ];
}

// Intro paragraph shown at the top of the customer proposal — changes with the
// proposal type so the wording matches the number of options.
export function introForKind(kind) {
  if (kind === "single") {
    return "Thank you for the opportunity to design your custom closets. Your space is ready for a straightforward installation — no wall repair or removal of old shelving needed. Below is your proposal to design, build, and professionally install your new custom closet system.";
  }
  // Short, warm lead-in only — the two options are laid out as their own labeled
  // cards right below (both in the email and on the web proposal), so the intro no
  // longer needs to describe them in prose.
  return "Thank you for the opportunity to design your project. You've got two ways to move forward below — pick whichever fits. We're glad to answer any questions.";
}

// The contract type to default the proposal to (used as a fallback when a tier
// has no explicit contract_type — e.g. legacy rows).
export function defaultContractTypeForKind(kind) {
  return { custom: "custom_order", single: "custom_order" }[kind] || "custom_order";
}
