import { expect, test } from "vitest";
import { getPatient, getTracker, listPatients } from "@/lib/store";
import { toViewDoc, toViewTracker } from "./adapt";
import { analyze, buildModel } from "./model";
import { dbValue, medsData, noDataText, vitalsData } from "./tabs";

const vitals = (i: number, range = "all") => {
  const raw = getPatient(i)!, model = buildModel(toViewDoc(raw, i), [toViewTracker(getTracker(raw))]);
  return vitalsData(raw, analyze(model, range));
};

test("vitals for every patient: feeling counts match feeling answers, newest answers first", () => {
  for (const { index } of listPatients()) {
    const V = vitals(index);
    expect(V.feeling.map(([k]: [string]) => k)).toEqual(["Great", "Okay", "Bad"]);
    const feelingRows = V.entries.filter((e: { label: string }) => e.label === "Feeling").length;
    expect(V.feeling.reduce((n: number, [, c]: [string, number]) => n + c, 0)).toBe(feelingRows);
    expect(V.entries[0].date >= V.entries.at(-1).date).toBe(true);
    expect(V.entries.some((e: { label: string }) => e.label === "Spirometry")).toBe(false); // device answers are left out
  }
});

test("range limits activity and badges", () => {
  const V = vitals(1, "28");
  expect(V.activity.length).toBeLessThanOrEqual(28);
  expect(V.activity[0][0] > V.activity.at(-1)[0]).toBe(true);
  for (const [d] of V.badges) expect(d >= V.activity.at(-1)[0]).toBe(true);
});

test("dbValue", () => {
  expect([dbValue(null), dbValue(true), dbValue(1.23456), dbValue("x")]).toEqual(["—", "Yes", (1.235).toLocaleString(), "x"]);
});


test("medications: plan lists every medicine; dose rows match the log counts", () => {
  for (const { index } of listPatients()) {
    const raw = getPatient(index)!, model = buildModel(toViewDoc(raw, index), [toViewTracker(getTracker(raw))]);
    const M = medsData(raw, analyze(model, "28"));
    expect(M.plan.map((p: { type: string }) => p.type).sort()).toEqual(["As needed", "Daily"]);
    expect(M.doses.length).toBe(M.trend.reduce((n: number, p: { value: number }) => n + p.value, 0));
    expect(M.status.length).toBe(M.trend.length);
    expect(M.trend[0].date < M.trend.at(-1)!.date).toBe(true); // oldest first for the chart
  }
});

test("noDataText", () => {
  const f = (k: string) => k.slice(5);
  expect(noDataText([], f)).toBe("");
  expect(noDataText(["2026-10-01", "2026-10-02", "2026-10-05"], f)).toBe("No data 10-01 – 10-02 and 10-05");
  expect(noDataText(["2026-10-01", "2026-10-03", "2026-10-05"], f)).toBe("No data on 3 days");
});
