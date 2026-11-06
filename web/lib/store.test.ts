import { expect, test } from "vitest";
import { getPatient, getTracker, listPatients } from "./store";

test("lists 3 patients", () => {
  const l = listPatients();
  expect(l).toHaveLength(3);
  expect(l.map((p) => p.zone)).toEqual(["Green", "Yellow", "Green"]);
  expect(l[0]).toMatchObject({ index: 1, shortId: "10114c" });
});

test("getPatient out of range", () => {
  expect(getPatient(0)).toBeNull();
  expect(getPatient(4)).toBeNull();
  expect(getPatient(NaN)).toBeNull();
  expect(getPatient(1.5)).toBeNull();
  expect(getPatient(2)?._id).toBe("0ab40715755cccbfecec5ff4");
});

test("tracker has the four question types", () => {
  expect(getTracker().questions.map((q) => q.type).sort()).toEqual(["checkbox", "device", "faceScale", "yesNo"]);
});
