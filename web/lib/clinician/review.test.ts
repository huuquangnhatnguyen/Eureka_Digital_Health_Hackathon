import { expect, test } from "vitest";
import { getPatient, getTracker, listPatients } from "@/lib/store";
import { toViewDoc, toViewTracker } from "./adapt";
import { analyze, buildModel } from "./model";
import { buildReview, coverage, reviewBins } from "./review";

const setup = (i: number, range = "all") => {
  const raw = getPatient(i)!, model = buildModel(toViewDoc(raw, i), [toViewTracker(getTracker(raw))]);
  return { raw, model, A: analyze(model, range) };
};
const review = (i: number, selected: string[] = [], range = "all") => {
  const { raw, model, A } = setup(i, range);
  return buildReview(model, raw, A, model.trackers, selected);
};
const titles = (i: number) => review(i).cards.map((c: { title: string }) => c.title);
type Choice = [string, string, string];
const pickerIds = (i: number) => {
  const p = review(i).picker;
  return [...p.summary, ...p.groups.flatMap(([, l]: [string, Choice[]]) => l)].map(([id]: Choice) => id);
};

test("every condition gets the same three cards; the device card follows the device", () => {
  expect(titles(1)).toEqual(["Days with symptoms", "Controller doses logged", "Lung function · FEV1"]);
  expect(titles(4)).toEqual(["Days with symptoms", "Scheduled doses logged", "Lung function · FEV1"]);
  expect(titles(7)).toEqual(["Days with symptoms", "Scheduled doses logged", "Blood glucose"]);
  expect(titles(10)).toEqual(["Days with symptoms", "Scheduled doses logged", "Oxygen saturation · SpO2"]);
});

test("device cards read the matching raw readings", () => {
  expect(review(2).cards[2].source.code).toBe("medicalDevices[].baselineReadings[].fvcPlusResults.fev1PercentPredicted");
  const glucose = review(8).cards[2];
  expect(glucose.value).toMatch(/^\d+ mg\/dL$/);
  expect(glucose.source.code).toBe("medicalDevices[].baselineReadings[].glucoseResults.glucose");
  expect(glucose.lists[0].items.map(([k]: [string]) => k)).toEqual(["Below 70 mg/dL", "70–180 mg/dL", "Above 180 mg/dL"]);
  expect(review(11).cards[2].value).toMatch(/^\d+ %$/);
});

test("picker only offers this device's fields", () => {
  expect(pickerIds(1)).toContain("pef");
  expect(pickerIds(7)).toEqual(["symptoms", "feeling", "rescue", "quality", "coverage", "glucose", "accepted"]);
  expect(pickerIds(10)).toEqual(["symptoms", "feeling", "rescue", "quality", "coverage", "spo2", "pulse", "perfusionIndex", "accepted"]);
});

test("a saved list shared across patients skips cards that don't apply", () => {
  const saved = ["pef", "pulse", "quality", "bogus"];
  expect(review(1, saved).cards.slice(3).map((c: { id: string }) => c.id)).toEqual(["pef", "quality"]);
  expect(review(10, saved).cards.slice(3).map((c: { id: string; title: string }) => [c.id, c.title])).toEqual([["pulse", "Pulse rate"], ["quality", "Reading quality"]]);
});

test("every applicable optional card builds for every patient and range", () => {
  for (const { index } of listPatients())
    for (const range of ["28", "all"]) {
      const ids = pickerIds(index);
      const cards = review(index, ids, range).cards;
      expect(cards.length).toBe(3 + ids.length - 1); // the fixed device card is listed but not added twice
      for (const c of cards) expect(c.title).toBeTruthy();
    }
});

test("coverage counts spirometry sessions or device readings", () => {
  const c = (i: number) => { const { raw, model, A } = setup(i, "28"); return coverage(model, raw, A); };
  expect(c(2)).toMatchObject({ n: 28, deviceLabel: "Device sessions" });
  expect(c(8).deviceLabel).toBe("Device readings");
  expect(c(8).device).toBeGreaterThan(28); // several glucose readings a day
});

test("bins: daily up to 14 days, weekly up to 91, else ~12 buckets", () => {
  const r = (n: number) => ({ start: "2026-01-01", end: new Date(Date.UTC(2026, 0, n)).toISOString().slice(0, 10), n });
  expect(reviewBins(r(14)).size).toBe(1);
  expect(reviewBins(r(91)).size).toBe(7);
  expect(reviewBins(r(120)).list.length).toBeLessThanOrEqual(12);
});
