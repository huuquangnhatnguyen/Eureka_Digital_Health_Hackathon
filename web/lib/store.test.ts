import { expect, test } from "vitest";
import { getPatient, getTracker, listPatients } from "./store";

test("lists 20 patients, 5 per condition", () => {
  const l = listPatients();
  expect(l).toHaveLength(20);
  expect(l.slice(0, 5).map((p) => p.zone)).toEqual(["Green", "Yellow", "Green", "Yellow", "Green"]);
  expect(l.slice(5).every((p) => p.zone === null)).toBe(true);
  expect([...new Set(l.map((p) => p.condition))]).toEqual([
    "Asthma Tracker (synthetic)", "Cystic Fibrosis Tracker (synthetic)", "Type 1 Diabetes Tracker (synthetic)",
    "Congenital Heart Disease Tracker (synthetic)",
  ]);
  expect(l[0]).toMatchObject({ index: 1, shortId: "10114c" });
});

test("getPatient out of range", () => {
  expect(getPatient(0)).toBeNull();
  expect(getPatient(21)).toBeNull();
  expect(getPatient(NaN)).toBeNull();
  expect(getPatient(1.5)).toBeNull();
  expect(getPatient(2)?._id).toBe("0ab40715755cccbfecec5ff4");
});

test("tracker has the four question types", () => {
  expect(getTracker().questions.map((q) => q.type).sort()).toEqual(["checkbox", "device", "faceScale", "yesNo"]);
});

test("each patient gets its own tracker, with asthma's question types", () => {
  const names = [1, 6, 11, 16].map((i) => getTracker(getPatient(i)!).name);
  expect(names).toEqual(listPatients().filter((_, i) => i % 5 === 0).map((p) => p.condition));
  for (const i of [6, 11, 16]) {
    expect(getTracker(getPatient(i)!).questions.map((q) => q.type).sort()).toEqual(["checkbox", "device", "faceScale", "yesNo"]);
    expect(getPatient(i)!.medicalDevices).toHaveLength(1);
  }
});
