import { expect, test } from "vitest";
import { classify, RANGES, unusualTest } from "./ranges";

test("classify reads both ends of a range and one-sided ranges", () => {
  expect([65, 70, 180, 181].map((v) => classify(RANGES.glucose, v))).toEqual(["low", null, null, "high"]);
  expect([79, 80, 130].map((v) => classify(RANGES.fev1Percent, v))).toEqual(["low", null, null]);
  expect(classify(undefined, 5)).toBeNull();
});

test("unusual flags values far from the patient's own, and needs enough data", () => {
  const usual = [96, 97, 97, 98, 96, 97, 98, 97, 96, 97], odd = unusualTest(usual);
  expect(odd(97)).toBe(false);
  expect(odd(90)).toBe(true);
  expect(unusualTest([96, 97, 90])(50)).toBe(false); // too few readings
  expect(unusualTest(Array(10).fill(97))(50)).toBe(false); // no spread
});
