// Single source of truth for what a new proposal holds: ONE option, the
// contract it attaches when the customer accepts, and the intro wording.
//
// Since 2026-11-18 (Michael: "remove the second option on proposals, we no
// longer offer wall repair and painting. set everything as one proposal") every
// proposal is one option. The old Option 2 (wall repair + paint, the `wallprep`
// contract) is never created again; proposals and contracts made before then
// keep their two options and their wallprep contracts, and the code that reads
// them (the customer's page, option-change.js, painter.js) stays for them.
//
// Kinds:
//  - custom (default; "single" is the old name for it): design, build and
//    install, walls as-is → custom_order contract
//  - install_only: customer-supplied product → install_only contract
//  - repair: repair / service → repair contract

const CLOSET = {
  key: "good", contract_type: "custom_order",
  title: "Custom Closet — Design, Build & Professional Install",
  description: "We design, build and professionally install your new custom system. Before install day the space should be empty: you take out the existing shelving and handle any patching or painting you want done, because we do not repair or paint walls.",
};

const OTHER = {
  install_only: {
    key: "good", contract_type: "install_only",
    title: "Professional Install — Customer-Supplied System",
    description: "We professionally install the closet, cabinet or storage system you supply.",
  },
  repair: {
    key: "good", contract_type: "repair",
    title: "Repair / Service",
    description: "The repair or service work described below.",
  },
};

const INTROS = {
  custom: "Thank you for the opportunity to design your project. Below is your proposal to design, build and professionally install your new custom system. We're glad to answer any questions.",
  install_only: "Thank you for the opportunity to install your new system. Below is your proposal for the professional installation of the products you supply.",
  repair: "Thank you for reaching out. Below is your proposal for the repair or service work we discussed.",
};

function normalize(kind) {
  return OTHER[kind] ? kind : "custom";
}

// A template's titles and intro apply only to the kind it was written for, so
// the closet template never renames an install-only or repair proposal.
function tplFits(kind, tpl) {
  if (!tpl) return false;
  const k = normalize(kind);
  return k === "custom" ? (!tpl.subkind || ["custom", "single"].includes(tpl.subkind)) : tpl.subkind === k;
}

export function proposalTiersForKind(kind, tpl) {
  const k = normalize(kind);
  const base = k === "custom" ? CLOSET : OTHER[k];
  const fits = tplFits(k, tpl);
  return [{
    ...base,
    title: (fits && tpl.tier_good_title) || base.title,
    description: (fits && tpl.tier_good_desc) || base.description,
  }];
}

// Intro paragraph shown at the top of the customer proposal.
export function introForKind(kind, tpl) {
  const k = normalize(kind);
  return (tplFits(k, tpl) && tpl.intro) || INTROS[k];
}

// The contract type the proposal defaults to (a fallback when a tier has no
// explicit contract_type — e.g. legacy rows).
export function defaultContractTypeForKind(kind) {
  const k = normalize(kind);
  return k === "custom" ? "custom_order" : OTHER[k].contract_type;
}
