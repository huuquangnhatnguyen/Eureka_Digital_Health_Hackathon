// View helpers shared by the clinician tabs.
import { fmtDay } from "@/lib/clinician/model";
import { inDepartment, type Department } from "@/lib/clinician/departments";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the ported model is untyped
export type Any = any;

/** The patient's trackers that belong to the department (highlighted in the header). */
export const focusOf = (model: Any, d: Department): Any[] => model.trackers.filter((t: Any) => inDepartment(d, t.name));

/** A date, with the year added when it isn't the year of `visit`. */
export const fmtD = (k: string, visit: string, o: { dow?: boolean; year?: boolean } = {}) =>
  fmtDay(k, { ...o, year: o.year || k.slice(0, 4) !== visit.slice(0, 4) });

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}
