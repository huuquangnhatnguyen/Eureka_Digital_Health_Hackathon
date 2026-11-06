// The only place that knows where patient data lives. Swap this file for a Cosmos DB client later.
import fs from "node:fs";
import path from "node:path";
import type { PatientDoc, PatientListItem, TrackerDef } from "./types";

// Next and vitest both run with cwd = web/, so the repo's data/ is one level up.
const DATA_DIR = path.join(process.cwd(), "..", "data");
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));

let patients: PatientDoc[] | undefined;
let tracker: TrackerDef | undefined;
const all = () => (patients ??= read<PatientDoc[]>("synthetic_db.json"));

export function listPatients(): PatientListItem[] {
  return all().map((p, i) => ({ index: i + 1, shortId: p._id.slice(0, 6), zone: p.asthmaTreatmentPlan.status }));
}

/** 1-based index; anything that isn't a whole number in range gives null. */
export function getPatient(index: number): PatientDoc | null {
  return Number.isInteger(index) && index >= 1 && index <= all().length ? all()[index - 1] : null;
}

export function getTracker(): TrackerDef {
  return (tracker ??= read<TrackerDef>("synthetic_tracker_definition.json"));
}
