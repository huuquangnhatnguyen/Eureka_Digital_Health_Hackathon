import { expect, test } from "vitest";
import { getPatient, getTracker, listPatients } from "@/lib/store";
import { toViewDoc, toViewTracker } from "./adapt";
import { analyze, buildModel } from "./model";

const build = (i: number) => {
  const p = getPatient(i)!;
  return buildModel(toViewDoc(p, i), [toViewTracker(getTracker(p))]);
};

test("every API patient builds and analyzes over all ranges", () => {
  for (const { index } of listPatients()) {
    const model = build(index);
    expect(model.trackers).toHaveLength(1);
    expect(model.trackers[0].missing).toBeUndefined();
    for (const range of ["28", "91", "all"]) {
      const A = analyze(model, range);
      expect(A.r.n).toBeGreaterThan(0);
      for (const s of model.sessions) expect(Number.isFinite(s.best.fev1)).toBe(true);
    }
  }
});

test("asthma patient: spirometry sessions, GINA, real question text", () => {
  const model = build(1);
  expect(model.sessions.length).toBeGreaterThan(0);
  expect(model.trackers[0].category).toBe("respiratory");
  expect(analyze(model, "all").trackers[0].gina.answerable).toBeGreaterThan(0);
  expect(model.trackers[0].questions.map((q: { role?: string }) => q.role)).toEqual(["spirometry", "feeling", "symptoms", "missed"]);
});

test("diabetes and heart patients: no spirometry, answers still parsed", () => {
  for (const i of [7, 10]) {
    const model = build(i);
    expect(model.sessions).toHaveLength(0);
    expect(model.trackers[0].category).toBe("other");
    expect(model.entries.some((e: { blank: boolean }) => !e.blank)).toBe(true);
  }
});

test("adapter leaves the API record untouched", () => {
  const p = getPatient(1)!;
  const before = JSON.stringify(p);
  toViewDoc(p, 1);
  expect(JSON.stringify(p)).toBe(before);
});
