import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { getPatient } from "./store";
import { GET, PATCH } from "@/app/api/patients/[id]/route";

// File store: a scratch file, so tests never touch data/overview_layouts.json. The store reads env lazily.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "layouts-"));
process.env.OVERVIEW_LAYOUTS_FILE = path.join(dir, "overview_layouts.json");
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const patch = (id: string, body: unknown) => PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }) as never, ctx(id));
const cardsOf = async (id: string) => (await (await GET(new Request("http://x") as never, ctx(id))).json()).patient.overviewCards;

test("file store: a saved layout comes back on that patient only", async () => {
  expect(await cardsOf("3")).toBeUndefined();
  expect((await patch("3", { overviewCards: ["device", "pef"] })).status).toBe(200);
  expect(await cardsOf("3")).toEqual(["device", "pef"]);
  expect(await cardsOf("4")).toBeUndefined();
  expect(JSON.parse(fs.readFileSync(process.env.OVERVIEW_LAYOUTS_FILE!, "utf8"))[getPatient(3)!._id]).toEqual(["device", "pef"]);
});

test("PATCH accepts only unique, known card ids, for patients that exist", async () => {
  expect((await patch("5", { overviewCards: [] })).status).toBe(200); // removing every card is allowed
  for (const bad of [null, {}, { overviewCards: "doses" }, { overviewRanges: { spo2: { lo: 90, hi: 80 } } }, { overviewCards: ["doses"], overviewRanges: { bogus: { lo: 1, hi: 2 } } }, { overviewCards: ["bogus"] }, { overviewCards: ["doses", "doses"] }, { overviewCards: [1] }])
    expect((await patch("5", bad)).status).toBe(400);
  expect((await patch("99", { overviewCards: ["doses"] })).status).toBe(404);
  expect(await cardsOf("5")).toEqual([]);
});

test("Redis store: HSET on save, HGET on load, over Upstash's REST API", async () => {
  vi.stubEnv("KV_REST_API_URL", "https://redis.test");
  vi.stubEnv("KV_REST_API_TOKEN", "t0ken");
  const hash = new Map<string, string>(), calls: string[][] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe("https://redis.test");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
    const cmd = JSON.parse(String(init.body)) as string[];
    calls.push(cmd);
    if (cmd[0] === "HSET") hash.set(cmd[2], cmd[3]);
    return Response.json({ result: cmd[0] === "HGET" ? hash.get(cmd[2]) ?? null : 1 });
  }));
  expect(await cardsOf("6")).toBeUndefined();
  expect((await patch("6", { overviewCards: ["doses", "device"] })).status).toBe(200);
  expect(await cardsOf("6")).toEqual(["doses", "device"]);
  const id = getPatient(6)!._id;
  expect(calls).toEqual([["HGET", "overview-cards", id], ["HGET", "overview-ranges", id], ["HSET", "overview-cards", id, '["doses","device"]'], ["HGET", "overview-cards", id], ["HGET", "overview-ranges", id]]);
});

test("Redis down: saving answers 500, loading still serves the patient with default cards", async () => {
  vi.stubEnv("KV_REST_API_URL", "https://redis.test");
  vi.stubEnv("KV_REST_API_TOKEN", "t0ken");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "WRONGPASS" }, { status: 401 })));
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect((await patch("7", { overviewCards: ["doses"] })).status).toBe(500);
  const res = await GET(new Request("http://x") as never, ctx("7"));
  expect(res.status).toBe(200);
  expect((await res.json()).patient.overviewCards).toBeUndefined();
});

test("ranges are saved per patient next to the layout, and sending one leaves the other alone", async () => {
  const get = async (id: string) => (await (await GET(new Request("http://x") as never, ctx(id))).json()).patient;
  expect((await patch("8", { overviewCards: ["device"] })).status).toBe(200);
  expect((await patch("8", { overviewRanges: { fev1Percent: { lo: 75, hi: null } } })).status).toBe(200);
  expect(await get("8")).toMatchObject({ overviewCards: ["device"], overviewRanges: { fev1Percent: { lo: 75, hi: null } } });
  expect((await get("9")).overviewRanges).toBeUndefined();
  expect(fs.existsSync(path.join(dir, "overview_ranges.json"))).toBe(true);
  expect((await patch("8", { overviewRanges: {} })).status).toBe(200); // back to the defaults
  expect((await get("8")).overviewRanges).toEqual({});
});
