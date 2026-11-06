// Default normal ranges for the overview charts, keyed by baselineFields id (review.js). Published reference values
// for a demo, not cut-offs set for a patient; a clinician can save their own per patient (overviewRanges).
export const RANGES = {
  fev1Percent: { lo: 80, hi: null }, // NAEPP asthma guideline (EPR-3)
  fvc: { lo: 80, hi: null }, // ATS/ERS interpretation
  pefPercent: { lo: 80, hi: null }, // green zone of an asthma action plan
  ratio: { lo: 80, hi: null }, // NAEPP, ages 5–11
  glucose: { lo: 70, hi: 180 }, // ADA / International Consensus on Time in Range
  // shortcut: one default for all heart patients; children with cyanotic heart disease run lower (often 75–85%), so set theirs per patient
  spo2: { lo: 95, hi: null },
  pulse: { lo: 70, hi: 120 }, // resting, ages 6–12
};

/** "low" | "high" | null for one value against a range. */
export const classify = (range, v) => (range?.lo != null && v < range.lo ? "low" : range?.hi != null && v > range.hi ? "high" : null);

/** The range a card uses: the patient's saved one, else the default. */
export const rangeFor = (id, saved) => saved?.[id] ?? RANGES[id];

/** A saved ranges object is valid when every key has a default and each entry is { lo, hi }, numbers or null,
    with at least one set and lo below hi. */
export const validRanges = (v) =>
  !!v && typeof v === "object" && !Array.isArray(v) &&
  Object.entries(v).every(([k, r]) => k in RANGES && !!r && typeof r === "object" &&
    Object.keys(r).length === 2 && ["lo", "hi"].every((e) => r[e] === null || Number.isFinite(r[e])) &&
    (r.lo != null || r.hi != null) && (r.lo == null || r.hi == null || r.lo < r.hi));
