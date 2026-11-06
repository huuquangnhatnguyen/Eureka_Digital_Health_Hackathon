import { expect, test } from "vitest";
import { getPatient, listPatients } from "@/lib/store";
import { careAsOf, careCSV, careFilter, careRecentDays, careRows, careStatus } from "./care";

const cohort = listPatients().map((p) => ({ index: p.index, raw: getPatient(p.index)!, condition: p.condition }));
const asOf = careAsOf(cohort);
const rows = (days = 28, reviewed = {}) => careRows(cohort, days, asOf, reviewed);
const F = { search: "", status: "all", active7: false, sort: "priority" };

test("as-of is the newest day in any record", () => {
  expect(asOf).toBe("2026-11-08");
});

test("status thresholds", () => {
  expect([careStatus(90, 1, 20), careStatus(60, 1, 20), careStatus(10, 1, 20)]).toEqual(["green", "orange", "red"]);
  expect([careStatus(null, 1, 20), careStatus(90, 0.4, 20), careStatus(90, 1, 6)]).toEqual(["unknown", "unknown", "unknown"]);
});

test("one row per patient; doses never exceed what was due; device reading follows the device", () => {
  const r = rows();
  expect(r).toHaveLength(20);
  for (const x of r) {
    expect(x.taken).toBeLessThanOrEqual(x.due);
    expect(x.bits).toHaveLength(7);
  }
  expect(r[0].reading).toMatch(/^FEV1 \d+% predicted$/);
  expect(r[10].reading).toMatch(/^\d+ mg\/dL$/);
  expect(r[15].reading).toMatch(/^SpO2 \d+%$/);
});

test("the struggling patients (2, 4, 7, 12, 17) sort first by review priority", () => {
  const order = careFilter(rows(), F, () => true).map((x: { index: number }) => x.index);
  expect(order.slice(0, 5).sort((a: number, b: number) => a - b)).toEqual([2, 4, 7, 12, 17]);
});

test("filters: department, search, status; reviewed rows drop below unreviewed of the same status", () => {
  expect(careFilter(rows(), F, (x: { plan: string }) => /asthma/i.test(x.plan))).toHaveLength(5);
  expect(careFilter(rows(), { ...F, search: "patient 1", sort: "name" }, () => true).map((x: { index: number }) => x.index)).toEqual([1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const red = careFilter(rows(), { ...F, status: "red" }, () => true);
  expect(red.every((x: { status: string }) => x.status === "red")).toBe(true);
  if (red.length > 1) {
    const reviewedFirst = careFilter(rows(28, { [red[0].id]: asOf }), { ...F, status: "red" }, () => true);
    expect(reviewedFirst.at(-1).id).toBe(red[0].id);
  }
});

test("recent days and CSV", () => {
  expect(careRecentDays(cohort[0].raw, asOf)).toHaveLength(7);
  const csv = careCSV(rows(7).slice(0, 2), 7, asOf).split("\r\n");
  expect(csv).toHaveLength(3);
  expect(csv[1].startsWith('"Patient 1","API · 10114c (synthetic)"')).toBe(true);
});
