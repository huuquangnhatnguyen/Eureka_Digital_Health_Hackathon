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

/* ---------------- saved overview settings, per patient _id ----------------
   "cards": the card ids in display order; "ranges": normal ranges the clinician changed (see lib/clinician/ranges.js).
   Kept apart from synthetic_*.json, which generate_synthetic_db.py rewrites. With Upstash Redis configured
   (Vercel Marketplace → Upstash for Redis sets KV_REST_API_URL / KV_REST_API_TOKEN) each lives in one Redis hash,
   which is what works on Vercel; without it, in a JSON file next to data/overview_layouts.json, for local runs. */
export interface Settings { cards: string[]; ranges: Record<string, { lo: number | null; hi: number | null }> }
const HASH: Record<keyof Settings, string> = { cards: "overview-cards", ranges: "overview-ranges" };
const redisEnv = () => {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL, token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
};
/** One command over Upstash's REST API (POST a JSON array, get { result } or { error }). */
async function redis(cmd: string[]) {
  const { url, token } = redisEnv()!;
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd), cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Redis ${cmd[0]}: ${body.error ?? res.status}`);
  return body.result;
}

const layoutsFile = () => process.env.OVERVIEW_LAYOUTS_FILE ?? path.join(DATA_DIR, "overview_layouts.json");
const fileOf = (k: keyof Settings) => (k === "cards" ? layoutsFile() : path.join(path.dirname(layoutsFile()), "overview_ranges.json"));
const cache: { [K in keyof Settings]?: Record<string, Settings[K]> } = {};
const fileSettings = <K extends keyof Settings>(k: K): Record<string, Settings[K]> =>
  ((cache[k] as Record<string, Settings[K]> | undefined) ??= fs.existsSync(fileOf(k)) ? JSON.parse(fs.readFileSync(fileOf(k), "utf8")) : {});

/** One saved setting for a patient, or undefined when none was saved. */
export async function getSetting<K extends keyof Settings>(k: K, patientId: string): Promise<Settings[K] | undefined> {
  if (!redisEnv()) return fileSettings(k)[patientId];
  const v = await redis(["HGET", HASH[k], patientId]);
  return v == null ? undefined : JSON.parse(v);
}

/** Saves one setting for a patient; false when there is no such patient. Throws if the store can't be written. */
export async function saveSetting<K extends keyof Settings>(k: K, index: number, value: Settings[K]): Promise<boolean> {
  const p = getPatient(index);
  if (!p) return false;
  if (redisEnv()) {
    await redis(["HSET", HASH[k], p._id, JSON.stringify(value)]);
    return true;
  }
  const next = { ...fileSettings(k), [p._id]: value }, file = fileOf(k);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(`${file}.tmp`, file); // the whole file or nothing, never a half-written one
  (cache as Record<string, unknown>)[k] = next;
  return true;
}
