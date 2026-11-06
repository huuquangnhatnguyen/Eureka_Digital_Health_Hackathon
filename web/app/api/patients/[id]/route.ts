import type { NextRequest } from "next/server";
import { getPatient, getSetting, getTracker, saveSetting, type Settings } from "@/lib/store";
import { CARD_IDS } from "@/lib/clinician/review";
import { validRanges } from "@/lib/clinician/ranges";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/patients/[id]">) {
  const { id } = await ctx.params;
  const patient = getPatient(Number(id));
  if (!patient) return Response.json({ error: "Patient not found" }, { status: 404 });
  const read = <K extends keyof Settings>(k: K) => getSetting(k, patient._id).catch((e) => {
    console.error(`Reading saved ${k} failed:`, e); // the patient still loads, with the defaults
    return undefined;
  });
  const [overviewCards, overviewRanges] = await Promise.all([read("cards"), read("ranges")]);
  return Response.json({ patient: { ...patient, ...(overviewCards && { overviewCards }), ...(overviewRanges && { overviewRanges }) }, tracker: getTracker(patient) });
}

const validCards = (cards: unknown) => Array.isArray(cards) && cards.every((c) => CARD_IDS.has(c)) && new Set(cards).size === cards.length;

/** Body { overviewCards?: string[], overviewRanges?: { [field]: { lo, hi } } }: the patient's overview cards in
    display order and the normal ranges changed from the defaults. Each field sent replaces the saved one. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/patients/[id]">) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null), { overviewCards: cards, overviewRanges: ranges } = body ?? {};
  if (cards === undefined && ranges === undefined) return Response.json({ error: "Send overviewCards or overviewRanges" }, { status: 400 });
  if (cards !== undefined && !validCards(cards))
    return Response.json({ error: "overviewCards must be a list of unique, known card ids" }, { status: 400 });
  if (ranges !== undefined && !validRanges(ranges))
    return Response.json({ error: "overviewRanges must map known fields to { lo, hi }: numbers or null, at least one set, lo below hi" }, { status: 400 });
  try {
    for (const [k, v] of [["cards", cards], ["ranges", ranges]] as const)
      if (v !== undefined && !(await saveSetting(k, Number(id), v as never))) return Response.json({ error: "Patient not found" }, { status: 404 });
  } catch (e) {
    console.error("Saving overview settings failed:", e);
    return Response.json({ error: "Couldn't save the overview settings" }, { status: 500 });
  }
  return Response.json({ ...(cards !== undefined && { overviewCards: cards }), ...(ranges !== undefined && { overviewRanges: ranges }) });
}
