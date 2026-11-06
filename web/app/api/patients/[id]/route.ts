import type { NextRequest } from "next/server";
import { getOverviewCards, getPatient, getTracker, saveOverviewCards } from "@/lib/store";
import { CARD_IDS } from "@/lib/clinician/review";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/patients/[id]">) {
  const { id } = await ctx.params;
  const patient = getPatient(Number(id));
  if (!patient) return Response.json({ error: "Patient not found" }, { status: 404 });
  const overviewCards = await getOverviewCards(patient._id).catch((e) => {
    console.error("Reading overview cards failed:", e); // the patient still loads, with the default cards
    return undefined;
  });
  return Response.json({ patient: overviewCards ? { ...patient, overviewCards } : patient, tracker: getTracker(patient) });
}

/** Body { overviewCards: string[] }: the patient's overview cards in display order. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/patients/[id]">) {
  const { id } = await ctx.params;
  const cards = (await req.json().catch(() => null))?.overviewCards;
  if (!Array.isArray(cards) || !cards.every((c) => CARD_IDS.has(c)) || new Set(cards).size !== cards.length)
    return Response.json({ error: "overviewCards must be a list of unique, known card ids" }, { status: 400 });
  try {
    if (!(await saveOverviewCards(Number(id), cards))) return Response.json({ error: "Patient not found" }, { status: 404 });
  } catch (e) {
    console.error("Saving overview cards failed:", e);
    return Response.json({ error: "Couldn't save the overview cards" }, { status: 500 });
  }
  return Response.json({ overviewCards: cards });
}
