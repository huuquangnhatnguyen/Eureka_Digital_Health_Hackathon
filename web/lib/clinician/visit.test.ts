import { expect, test } from "vitest";
import { getPatient, getTracker, listPatients } from "@/lib/store";
import { toViewDoc, toViewTracker } from "./adapt";
import { analyze, buildModel } from "./model";
import { buildCSV, calendarDays } from "./visit";

const setup = (i: number, range = "28") => {
  const raw = getPatient(i)!, model = buildModel(toViewDoc(raw, i), [toViewTracker(getTracker(raw))]);
  return { model, A: analyze(model, range) };
};

test("calendar: Monday-first full weeks, blanks outside the range", () => {
  const g = calendarDays({ start: "2026-11-04", end: "2026-11-08" }); // Wed .. Sun
  expect(g).toEqual([null, null, "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  expect(calendarDays({ start: "2026-10-12", end: "2026-11-08" }).length % 7).toBe(0);
});

test("CSV: one row per day, same column count on every row", () => {
  for (const { index } of listPatients()) {
    const { model, A } = setup(index);
    const lines = buildCSV(model, A).trimEnd().split("\n");
    expect(lines).toHaveLength(A.r.n + 1);
    // quoted cells may hold commas, so count columns with a quote-aware split
    const cols = (l: string) => { let n = 1, q = false; for (const c of l) { if (c === '"') q = !q; else if (c === "," && !q) n++; } return n; };
    for (const l of lines) expect(cols(l)).toBe(cols(lines[0]));
  }
  expect(buildCSV(setup(1).model, setup(1).A).split("\n")[0]).toContain("FEV1 (L)");
  expect(buildCSV(setup(7).model, setup(7).A).split("\n")[0]).not.toContain("FEV1 (L)");
});
