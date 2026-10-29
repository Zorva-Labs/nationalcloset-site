// The companies that share this CRM (migration 0081). National Closet Company
// is the default; Nashville Luxury Closets & Cabinets is its d/b/a, whose site
// (nashvilleluxuryclosets.com) sends its leads to /api/intake/lead. Terry
// McCarthy, 2026-10-29: one CRM, each lead, sale and job marked NCC or NLC.
export const BRAND_NAMES = {
  NCC: "National Closet Company",
  NLC: "Nashville Luxury Closets & Cabinets",
};
export const BRANDS = new Set(Object.keys(BRAND_NAMES));
