import { expect, test } from "vitest";
import { addDays, buildDays, dayRange, emptyDay } from "./days";
import { getPatient, getTracker } from "./store";
import type { DailyLog, PatientDoc } from "./types";

const tracker = getTracker();
const qid = (type: string) => tracker.questions.find((q) => q.type === type)!.id;
const built = (i: number) => buildDays(getPatient(i)!, tracker);
const withLogs = (dailyLogs: DailyLog[]): PatientDoc => ({ ...getPatient(1)!, dailyLogs });
const sub = (time: string, responses: { questionId: string; value: string }[]) => ({
  trackerId: tracker.id, date: `2026-01-01T${time}:00.000Z`, responses,
});

test("P1 basics", () => {
  const b = built(1);
  expect(b.end).toBe("2026-11-08");
  expect(b.perDay).toBe(2);
  expect(b.baseline).not.toBeNull();
  expect(b.personalBest.fev1).toBeGreaterThan(0);
});

test("every blow lands on a day", () => {
  for (const i of [1, 2, 3]) {
    const b = built(i);
    const total = Object.values(b.days).reduce((t, d) => t + d.blows.length, 0);
    expect(total).toBe(getPatient(i)!.medicalDevices[0].baselineReadings.length);
  }
});

test("AM/PM split", () => {
  const d = built(1).days["2026-08-16"];
  expect(d.am).toEqual(["09:59"]);
  expect(d.pm).toEqual(["19:48"]);
  expect(d.ctrlCount).toBe(2);
});

test("dayRange fills gaps", () => {
  const r = dayRange(built(2), "2026-11-08", 90);
  expect(r).toHaveLength(90);
  expect(r[0].day).toBe("2026-08-11");
  expect(r.at(-1)!.day).toBe("2026-11-08");
  expect(r.filter((d) => !d.logged)).toHaveLength(26);
});

test("addDays crosses month ends", () => {
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
});

test("symptom parsing edge cases", () => {
  const S = qid("checkbox");
  const log = (day: string, value: string): DailyLog => ({
    day, allMedicationsAdministered: false, trackerResponses: [sub("08:00", [{ questionId: S, value }])],
  });
  const b = buildDays(withLogs([
    log("2026-01-01", '["None of these "]'),
    log("2026-01-02", "not json"),
    log("2026-01-03", '["Coughing","Wheezing"]'),
  ]), tracker);
  expect(b.days["2026-01-01"].symptoms).toEqual([]);
  expect(b.days["2026-01-02"].symptoms).toBeNull();
  expect(b.days["2026-01-03"].symptoms).toEqual(["Coughing", "Wheezing"]);
});

test("latest non-blank answer wins", () => {
  const F = qid("faceScale");
  const b = buildDays(withLogs([{
    day: "2026-01-01", allMedicationsAdministered: false,
    // deliberately out of order: sorting by date must decide, not array order
    trackerResponses: [
      sub("08:05", []),
      sub("08:03", [{ questionId: F, value: "Great" }]),
      sub("08:00", [{ questionId: F, value: "Bad" }]),
    ],
  }]), tracker);
  const d = b.days["2026-01-01"];
  expect(d.feel).toBe("Great");
  expect(d.flip).toBe(true);
  expect(d.blank).toBe(1);
});

test("missed school and rescue", () => {
  const Y = qid("yesNo");
  const p = getPatient(1)!;
  const rescue = p.medications.find((m) => m.dosage.asNeeded)!;
  const b = buildDays(withLogs([{
    day: "2026-01-01", allMedicationsAdministered: false,
    trackerResponses: [sub("08:00", [{ questionId: Y, value: "true" }])],
    medicationAdministrations: [{ id: rescue.id, time: "16:40", name: rescue.name, value: 2 }],
  }]), tracker);
  expect(b.days["2026-01-01"].school).toBe(true);
  expect(b.days["2026-01-01"].rescue).toEqual(["16:40"]);
  expect(b.days["2026-01-01"].ctrlCount).toBe(0);
});

test("emptyDay is unlogged with no readings", () => {
  expect(emptyDay("2026-01-01")).toMatchObject({ logged: false, best: null, feel: null, symptoms: null, school: null });
});

test("cystic fibrosis: spirometry works like asthma, no zone", () => {
  const p = getPatient(4)!;
  const b = buildDays(p, getTracker(p));
  expect(b.plan).toBeNull();
  expect(b.baseline).not.toBeNull();
  expect(Object.values(b.days).some((d) => d.best && d.feel && d.symptoms)).toBe(true);
});

test("glucose meter and pulse oximeter readings land on days, but not as blows", () => {
  for (const i of [7, 10]) {
    const p = getPatient(i)!;
    const b = buildDays(p, getTracker(p));
    const days = Object.values(b.days);
    expect(days.reduce((t, d) => t + d.readings.length, 0)).toBe(p.medicalDevices[0].baselineReadings.length);
    expect(days.every((d) => d.blows.length === 0 && d.best === null)).toBe(true);
    expect(b.personalBest).toEqual({ fev1: 0, pef: 0 });
  }
});
