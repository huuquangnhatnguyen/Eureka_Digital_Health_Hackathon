import { expect, test } from "vitest";
import { getPatient, getTracker, listPatients } from "@/lib/store";
import { toViewDoc, toViewTracker } from "./adapt";
import { analyze, buildModel } from "./model";
import { devicesData } from "./devices";

const devices = (i: number, range = "all") => {
  const raw = getPatient(i)!, model = buildModel(toViewDoc(raw, i), [toViewTracker(getTracker(raw))]);
  return devicesData(raw, analyze(model, range));
};

test("one section per device, layout by device kind", () => {
  const kinds = [1, 6, 11, 16].map((i) => devices(i).devices[0].cards.map((c: { label: string }) => c.label));
  expect(kinds).toEqual([
    ["FEV1", "FVC", "FEV1 / FVC"], ["FEV1", "FVC", "FEV1 / FVC"],
    ["Latest glucose", "Median", "In target range"], ["SpO2", "Pulse", "Perfusion index"],
  ]);
});

test("every reading becomes one row, newest first; every row has a cell per column", () => {
  for (const { index } of listPatients())
    for (const range of ["28", "all"]) {
      const d = devices(index, range).devices[0];
      expect(d.rows).toHaveLength(d.n);
      if (d.n > 1) expect(d.rows[0].key >= d.rows.at(-1).key).toBe(true);
      for (const r of d.rows) expect(r.cells).toHaveLength(d.columns.length);
    }
});

test("strip errors are flagged for review with their message", () => {
  const bad = devices(11).devices[0].rows.filter((r: { ok: boolean }) => !r.ok);
  expect(bad.length).toBeGreaterThan(0);
  expect(bad[0].messages).toBe("Strip error: Use a new test strip");
  expect(bad[0].cells[0].main).toBe("—");
});

test("questionnaire device answers use the columns of that device", () => {
  expect(devices(1).questionnaire.columns).toEqual(["Date / time (UTC)", "FEV1 (L)", "FVC (L)", "Peak flow (L/s)", "Accepted"]);
  expect(devices(11).questionnaire.columns).toEqual(["Date / time (UTC)", "Glucose (mg/dL)", "Accepted"]);
  expect(devices(16).questionnaire.rows.length).toBeGreaterThan(0);
});
