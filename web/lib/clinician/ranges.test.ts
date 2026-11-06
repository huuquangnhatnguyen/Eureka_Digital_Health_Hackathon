import { expect, test } from "vitest";
import { classify, RANGES, rangeFor, validRanges } from "./ranges";

test("classify reads both ends of a range and one-sided ranges", () => {
  expect([65, 70, 180, 181].map((v) => classify(RANGES.glucose, v))).toEqual(["low", null, null, "high"]);
  expect([79, 80, 130].map((v) => classify(RANGES.fev1Percent, v))).toEqual(["low", null, null]);
  expect(classify({ lo: null, hi: 100 }, 120)).toBe("high");
  expect(classify(undefined, 5)).toBeNull();
});

test("a saved range replaces the default for that field only", () => {
  const saved = { spo2: { lo: 75, hi: 85 } };
  expect(rangeFor("spo2", saved)).toEqual({ lo: 75, hi: 85 });
  expect(rangeFor("pulse", saved)).toEqual(RANGES.pulse);
  expect(rangeFor("fev1Volume", saved)).toBeUndefined(); // volumes have no default range
});

test("validRanges accepts known fields with lo below hi, and nothing else", () => {
  expect(validRanges({})).toBe(true);
  expect(validRanges({ spo2: { lo: 75, hi: null }, glucose: { lo: 80, hi: 160 } })).toBe(true);
  for (const bad of [null, [], { bogus: { lo: 1, hi: 2 } }, { spo2: { lo: null, hi: null } }, { spo2: { lo: 90, hi: 80 } },
    { spo2: { lo: "75", hi: null } }, { spo2: { lo: 75 } }, { spo2: { lo: 75, hi: null, extra: 1 } }, { spo2: null }])
    expect(validRanges(bad)).toBe(false);
});
