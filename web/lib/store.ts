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

/* ---------------- overview layouts (patient _id → card ids) ----------------
   Kept apart from synthetic_*.json, which generate_synthetic_db.py rewrites. With Upstash Redis configured
   (Vercel Marketplace → Upstash for Redis sets KV_REST_API_URL / KV_REST_API_TOKEN) they live in one Redis hash,
   which is what works on Vercel; without it, in data/overview_layouts.json, for local runs. */
const HASH = "overview-cards";
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
let layouts: Record<string, string[]> | undefined;
const fileLayouts = () => (layouts ??= fs.existsSync(layoutsFile()) ? JSON.parse(fs.readFileSync(layoutsFile(), "utf8")) : {});

/** A patient's saved overview cards, or undefined when none were saved. */
export async function getOverviewCards(patientId: string): Promise<string[] | undefined> {
  if (!redisEnv()) return fileLayouts()[patientId];
  const v = await redis(["HGET", HASH, patientId]);
  return v == null ? undefined : JSON.parse(v);
}

/** Saves a patient's overview cards; false when there is no such patient. Throws if the store can't be written. */
export async function saveOverviewCards(index: number, cards: string[]): Promise<boolean> {
  const p = getPatient(index);
  if (!p) return false;
  if (redisEnv()) {
    await redis(["HSET", HASH, p._id, JSON.stringify(cards)]);
    return true;
  }
  const next = { ...fileLayouts(), [p._id]: cards }, file = layoutsFile();
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(`${file}.tmp`, file); // the whole file or nothing, never a half-written one
  layouts = next;
  return true;
}
