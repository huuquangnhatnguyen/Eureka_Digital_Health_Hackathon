// Departments filter patients by condition. Add or edit departments in departments.json;
// `conditions` are lower-case keywords matched against the tracker/condition name ("*" = every patient).
import DEPARTMENTS from "./departments.json";
import type { PatientListItem } from "@/lib/types";

export type Department = (typeof DEPARTMENTS)[number];
export { DEPARTMENTS };

export const inDepartment = (d: Department, condition: string) =>
  d.conditions.some((c) => c === "*" || condition.toLowerCase().includes(c));

/** Only departments with at least one patient, in the JSON's order. */
export const departmentsWithPatients = (patients: PatientListItem[]) =>
  DEPARTMENTS.filter((d) => patients.some((p) => inDepartment(d, p.condition)));

/** "Asthma Tracker (synthetic)" -> "Asthma". */
export const conditionName = (condition: string) => condition.replace(/\s*tracker\b.*$/i, "") || "Other";

/** A department's patients grouped by condition, groups in first-seen order. */
export function groupPatients(d: Department, patients: PatientListItem[]) {
  const groups = new Map<string, PatientListItem[]>();
  for (const p of patients.filter((p) => inDepartment(d, p.condition))) {
    const k = conditionName(p.condition);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups];
}
