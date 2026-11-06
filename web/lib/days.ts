// One patient document → per-day facts. Port of buildDays in dashboard/logic.js, extended per the spec.
import type { Blow, PatientDoc, TrackerDef } from "./types";

export type BestKey = "fev1" | "fev1PercentPredicted" | "fev1FvcPercent" | "pef" | "pefPercentPredicted";
const BEST_KEYS: BestKey[] = ["fev1", "fev1PercentPredicted", "fev1FvcPercent", "pef", "pefPercentPredicted"];
const PM_FROM = "14:00"; // dose time < 14:00 counts as the morning dose
type Feel = "Great" | "Okay" | "Bad";

export interface Day {
  day: string;
  logged: boolean;
  am: string[];
  pm: string[];
  ctrlCount: number;
  rescue: string[];
  feel: Feel | null;
  symptoms: string[] | null; // null = unanswered, [] = "None of these"
  school: boolean | null;
  flip: boolean;
  blank: number;
  blows: Blow[];
  okBlows: number;
  best: Record<BestKey, number> | null;
  coach: string[];
}

export interface Built {
  days: Record<string, Day>;
  first: string;
  end: string;
  perDay: number;
  ctrlName: string;
  personalBest: { fev1: number; pef: number };
  baseline: { fev1: number; pef: number } | null;
  plan: PatientDoc["asthmaTreatmentPlan"];
}

export const emptyDay = (day: string): Day => ({
  day, logged: false, am: [], pm: [], ctrlCount: 0, rescue: [], feel: null, symptoms: null, school: null,
  flip: false, blank: 0, blows: [], okBlows: 0, best: null, coach: [],
});

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** n days ending at endDay, oldest first; days with no data are emptyDay. */
export function dayRange(b: Built, endDay: string, n: number): Day[] {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(endDay, i - n + 1);
    return b.days[day] ?? emptyDay(day);
  });
}

function parseSymptoms(value: string): string[] | null {
  try {
    const list: unknown = JSON.parse(value);
    if (!Array.isArray(list)) return null;
    return list.map((x) => String(x).trim()).filter((x) => x && !/^none of these/i.test(x));
  } catch {
    return null; // malformed answer: treat as unanswered
  }
}

const bestOf = (blows: Blow[], k: "fev1" | "pef") => Math.max(0, ...blows.map((b) => b.fvcPlusResults[k]));

export function buildDays(doc: PatientDoc, tracker: TrackerDef): Built {
  const qid = (type: string) => tracker.questions.find((q) => q.type === type)?.id;
  const [Q_FEEL, Q_SYMP, Q_SCHOOL] = [qid("faceScale"), qid("checkbox"), qid("yesNo")];
  const active = doc.medications.filter((m) => !m.archived);
  const ctrl = active.filter((m) => !m.dosage.asNeeded);
  const ctrlIds = new Set(ctrl.map((m) => m.id));
  const rescueIds = new Set(active.filter((m) => m.dosage.asNeeded).map((m) => m.id));

  const days: Record<string, Day> = {};
  const get = (day: string) => (days[day] ??= emptyDay(day));

  for (const log of doc.dailyLogs) {
    const d = get(log.day);
    d.logged = true;
    for (const m of log.medicationAdministrations ?? []) {
      if (ctrlIds.has(m.id)) (m.time < PM_FROM ? d.am : d.pm).push(m.time);
      else if (rescueIds.has(m.id)) d.rescue.push(m.time);
    }
    d.ctrlCount = d.am.length + d.pm.length;
    const feels = new Set<string>();
    const subs = [...(log.trackerResponses ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    for (const s of subs) {
      if (!s.responses.length) { d.blank++; continue; }
      for (const r of s.responses) { // later submissions overwrite earlier ones
        if (r.questionId === Q_FEEL) { d.feel = r.value as Feel; feels.add(r.value); }
        else if (r.questionId === Q_SYMP) { const sy = parseSymptoms(r.value); if (sy) d.symptoms = sy; }
        else if (r.questionId === Q_SCHOOL) d.school = r.value === "true";
      }
    }
    d.flip = feels.size > 1;
  }

  const device = doc.medicalDevices[0];
  for (const b of device?.baselineReadings ?? []) if (b.date) get(b.date.slice(0, 10)).blows.push(b);

  for (const d of Object.values(days)) {
    const ok = d.blows.filter((b) => b.accepted);
    d.okBlows = ok.length;
    d.best = ok.length
      ? (Object.fromEntries(BEST_KEYS.map((k) => [k, Math.max(...ok.map((b) => b.fvcPlusResults[k]))])) as Record<BestKey, number>)
      : null;
    d.coach = d.blows.flatMap((b) => b.qualityReport?.qualityIndications?.map((q) => q.message) ?? []);
  }

  const accepted = (device?.baselineReadings ?? []).filter((b) => b.accepted);
  const baseBlows = accepted.filter((b) => b.date.slice(0, 10) === device?.baselineReadingDate);
  const sorted = Object.keys(days).sort();
  return {
    days,
    first: sorted[0],
    end: sorted.at(-1)!,
    perDay: ctrl[0]?.dosage.timing.frequency ?? 1,
    ctrlName: ctrl.map((m) => m.name).join(", ") || "controller",
    personalBest: { fev1: bestOf(accepted, "fev1"), pef: bestOf(accepted, "pef") },
    baseline: baseBlows.length ? { fev1: bestOf(baseBlows, "fev1"), pef: bestOf(baseBlows, "pef") } : null,
    plan: doc.asthmaTreatmentPlan,
  };
}
