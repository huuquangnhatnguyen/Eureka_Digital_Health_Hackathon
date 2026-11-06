import { listPatients } from "@/lib/store";

export async function GET() {
  return Response.json(listPatients());
}
