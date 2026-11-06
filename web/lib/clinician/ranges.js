// Normal ranges for the overview charts, keyed by baselineFields id (review.js). Published reference values for a
// demo, not cut-offs a clinician has set for this patient.
import { median } from "./model";

export const RANGES = {
  fev1Percent: { lo: 80, source: "NAEPP asthma guideline: FEV1 of 80% predicted or more is normal." },
  fvc: { lo: 80, source: "ATS/ERS: FVC of 80% predicted or more is normal." },
  pefPercent: { lo: 80, source: "Peak flow of 80% predicted or more, as in the green zone." },
  ratio: { lo: 80, source: "NAEPP (ages 5–11): an FEV1/FVC ratio below 80% suggests obstruction." },
  glucose: { lo: 70, hi: 180, source: "ADA: 70–180 mg/dL is the usual target range for type 1 diabetes." },
  // shortcut: one range for all heart patients; children with cyanotic heart disease live lower (often 75–85%), add a per-patient target when one is in the data
  spo2: { lo: 95, source: "Resting SpO2 of 95% or more is typical; some heart conditions have a lower target." },
  pulse: { lo: 70, hi: 120, source: "Typical resting pulse for ages 6–12 is 70–120 bpm." },
};

/** "low" | "high" | null for one value against a range. */
export const classify = (range, v) => (range?.lo != null && v < range.lo ? "low" : range?.hi != null && v > range.hi ? "high" : null);

/** Test for values far from this patient's usual readings: modified z-score above 3.5 (Iglewicz & Hoaglin),
    which a few extreme readings can't drag along the way a mean and SD can. Needs 8+ values with some spread. */
export function unusualTest(values) {
  if (values.length < 8) return () => false;
  const m = median(values), mad = median(values.map(v => Math.abs(v - m)));
  return mad ? v => Math.abs(0.6745 * (v - m) / mad) > 3.5 : () => false;
}
