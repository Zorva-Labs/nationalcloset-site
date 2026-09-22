// Shared rules for every generated look image on nationalclosetco.com.
// Michael's brief, 2026-09-22: nicer walk-ins, cabinets, built-ins and pantries;
// no islands, no windows, no flat slab fronts, no glass doors or shelving, no carpet.
export const RULES = [
  'Every cabinet door and drawer front is a framed panel with a visible stile-and-rail shadow line — shaker, raised panel, beaded inset or fluted.',
  'No flat slab fronts, no plain flush fronts and no handleless fronts anywhere.',
  'Substantial metal pulls, bar handles, cup pulls and knobs on every door and drawer.',
  'Bare hardwood or tile floor with no rug and no carpet anywhere.',
  'Solid finished walls — no window, no glass door, no daylight opening, no exterior view and no skylight.',
  'No kitchen island and no freestanding island cabinet.',
  'No glass cabinet doors, no glass fronts and no glass shelves; every shelf is solid wood.',
  'No people, no text, no lettering, no labels with words and no signage.',
].join(' ');

export const SHOT = [
  'Professional architectural interior photography for a cabinet maker’s portfolio.',
  '35mm lens, eye level, one-point perspective, crisp focus front to back, natural color, no fisheye.',
  'Warm recessed ceiling lighting with integrated LED lighting under the shelves.',
  'Photorealistic, high detail, clean and uncluttered.',
].join(' ');

export const prompt = (subject) => `${subject} ${RULES} ${SHOT}`;
