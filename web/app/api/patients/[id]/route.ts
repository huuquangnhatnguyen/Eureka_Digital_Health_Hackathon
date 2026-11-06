import type { NextRequest } from "next/server";
import { getPatient, getTracker } from "@/lib/store";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/patients/[id]">) {
  const { id } = await ctx.params;
  const patient = getPatient(Number(id));
  if (!patient) return Response.json({ error: "Patient not found" }, { status: 404 });
  return Response.json({ patient, tracker: getTracker(patient) });
}
