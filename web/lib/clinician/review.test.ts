import { expect, test } from "vitest";
import { getPatient, getTracker, listPatients } from "@/lib/store";
import { toViewDoc, toViewTracker } from "./adapt";
import { analyze, buildModel } from "./model";
import { buildReview, DEFAULT_CARDS, reviewBins } from "./review";

const setup = (i: number, range = "all") => {
  const raw = getPatient(i)!, model = buildModel(toViewDoc(raw, i), [toViewTracker(getTracker(raw))]);
  return { raw, model, A: analyze(model, range) };
};
const review = (i: number, selected: string[] = DEFAULT_CARDS, range = "all") => {
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
  expect(titles(6)).toEqual(["Days with symptoms", "Scheduled doses logged", "Lung function · FEV1"]);
  expect(titles(11)).toEqual(["Days with symptoms", "Scheduled doses logged", "Blood glucose"]);
  expect(titles(16)).toEqual(["Days with symptoms", "Scheduled doses logged", "Oxygen saturation · SpO2"]);
});

test("device cards read the matching raw readings", () => {
  expect(review(2).cards[2].source.code).toBe("medicalDevices[].baselineReadings[].fvcPlusResults.fev1PercentPredicted");
  const glucose = review(12).cards[2];
  expect(glucose.value).toMatch(/^\d+ mg\/dL$/);
  expect(glucose.source.code).toBe("medicalDevices[].baselineReadings[].glucoseResults.glucose");
  expect(glucose.lists[0].items.map(([k]: [string]) => k)).toEqual(["Below 70 mg/dL", "70–180 mg/dL", "Above 180 mg/dL"]);
  expect(review(17).cards[2].value).toMatch(/^\d+ %$/);
});

test("picker only offers this device's fields", () => {
  expect(pickerIds(1)).toContain("pef");
  expect(pickerIds(11)).toEqual([...DEFAULT_CARDS, "symptoms", "feeling", "rescue", "quality", "coverage", "glucose", "accepted"]);
  expect(pickerIds(16)).toEqual([...DEFAULT_CARDS, "symptoms", "feeling", "rescue", "quality", "coverage", "spo2", "pulse", "perfusionIndex", "accepted"]);
});

test("a saved list shared across patients skips cards that don't apply", () => {
  const saved = [...DEFAULT_CARDS, "pef", "pulse", "quality", "bogus"];
  expect(review(1, saved).cards.slice(3).map((c: { id: string }) => c.id)).toEqual(["pef", "quality"]);
  expect(review(16, saved).cards.slice(3).map((c: { id: string; title: string }) => [c.id, c.title])).toEqual([["pulse", "Pulse rate"], ["quality", "Reading quality"]]);
});

test("every applicable optional card builds for every patient and range", () => {
  for (const { index } of listPatients())
    for (const range of ["28", "all"]) {
      const ids = pickerIds(index);
      const cards = review(index, ids, range).cards;
      expect(cards.length).toBe(ids.length - 1); // the device card's own field is listed but not added twice
      for (const c of cards) expect(c.title).toBeTruthy();
    }
});

test("defaults are ordinary cards: any order, removable, and the device alias isn't doubled", () => {
  const ids = (sel: string[], i = 1) => review(i, sel).cards.map((c: { id: string }) => c.id);
  expect(ids(["device", "pef", "symptomDays"])).toEqual(["device", "pef", "symptomDays"]);
  expect(ids([])).toEqual([]);
  expect(ids(["device", "fev1Percent"])).toEqual(["device"]); // patient 1's device card is FEV1 % predicted
  expect(ids(["fev1Percent"])).toEqual(["fev1Percent"]); // without the device card it can be added on its own
  expect(review(1, ["device"]).picker.fixed).toBe("fev1Percent");
  expect(review(1, ["doses"]).picker.fixed).toBeNull();
});

test("bins: daily up to 14 days, weekly up to 91, else ~12 buckets", () => {
  const r = (n: number) => ({ start: "2026-01-01", end: new Date(Date.UTC(2026, 0, n)).toISOString().slice(0, 10), n });
  expect(reviewBins(r(14)).size).toBe(1);
  expect(reviewBins(r(91)).size).toBe(7);
  expect(reviewBins(r(120)).list.length).toBeLessThanOrEqual(12);
});

test("device cards with a normal range flag readings outside it", () => {
  const fev1 = review(2).cards[2]; // poor adherence, drifts into the yellow zone
  expect(fev1.plot.range).toEqual({ lo: 80, hi: null });
  expect(fev1.foot).toBeUndefined();
  expect(fev1.lists[0].items[0][0]).toBe("Below 80%");
  expect(fev1.lists[0].items[0][1]).toBeGreaterThan(0);
  expect(fev1.plot.points.some((p: { flag: string }) => p.flag.includes("below 80%"))).toBe(true);
  expect(review(1).cards[2].plot.points.every((p: { status: string | null }) => !p.status)).toBe(true); // well controlled
});

test("a saved range replaces the default on the chart, the counts and the average", () => {
  const { raw, model, A } = setup(17);
  const card = buildReview(model, raw, A, model.trackers, DEFAULT_CARDS, { spo2: { lo: 97, hi: null } }).cards[2];
  expect(card.plot.range).toEqual({ lo: 97, hi: null });
  expect(card.range).toMatchObject({ key: "spo2", custom: true, text: "97% or above" });
  expect(card.lists[0].items.map(([k]: [string]) => k)).toEqual(["Below 97%", "97% or above"]);
  expect(card.average.value).toMatch(/^\d+ %$/);
  expect(card.average.sub).toMatch(/% in range$/);
  expect(review(17).cards[2].range.custom).toBe(false);
});
