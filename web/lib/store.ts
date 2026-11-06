// The only place that knows where patient data lives. Swap this file for a Cosmos DB client later.
import fs from "node:fs";
import path from "node:path";
import type { PatientDoc, PatientListItem, TrackerDef } from "./types";

// Next and vitest both run with cwd = web/, so the repo's data/ is one level up.
const DATA_DIR = path.join(process.cwd(), "..", "data");
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));

// One file pair per disease (asthma keeps the original names); patients are numbered in this order.
const FILES = [["synthetic_db.json", "synthetic_tracker_definition.json"]].concat(
  ["cf", "t1d", "heart"].map((k) => [`synthetic_${k}_db.json`, `synthetic_${k}_tracker_definition.json`]),
);

let patients: PatientDoc[] | undefined;
let trackers: TrackerDef[] | undefined;
const all = () => (patients ??= FILES.flatMap(([db]) => read<PatientDoc[]>(db)));

export function listPatients(): PatientListItem[] {
  return all().map((p, i) => ({
    index: i + 1,
    shortId: p._id.slice(0, 6),
    condition: p.medications[0]?.relatedCondition ?? "",
    zone: p.asthmaTreatmentPlan?.status ?? null, // only asthma patients have an action-plan zone
  }));
}

/** 1-based index; anything that isn't a whole number in range gives null. */
export function getPatient(index: number): PatientDoc | null {
  return Number.isInteger(index) && index >= 1 && index <= all().length ? all()[index - 1] : null;
}

/** The tracker a patient submits to; with no patient, the asthma tracker. */
export function getTracker(patient?: PatientDoc): TrackerDef {
  const list = (trackers ??= FILES.map(([, tracker]) => read<TrackerDef>(tracker)));
  const id = patient?.dailyLogs.flatMap((l) => l.trackerResponses ?? [])[0]?.trackerId;
  return list.find((t) => t.id === id) ?? list[0];
}
