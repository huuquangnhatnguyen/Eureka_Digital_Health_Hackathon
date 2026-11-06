import { expect, test } from "vitest";
import { listPatients } from "@/lib/store";
import { DEPARTMENTS, conditionName, departmentsWithPatients, groupPatients } from "./departments";

const byId = (id: string) => DEPARTMENTS.find((d) => d.id === id)!;

test("dropdown only offers departments that have mock patients", () => {
  expect(departmentsWithPatients(listPatients()).map((d) => d.id)).toEqual(["pcp", "pulm", "endo", "cardio"]);
});

test("department filters and groups patients by condition", () => {
  const pulm = groupPatients(byId("pulm"), listPatients());
  expect(pulm.map(([k, ps]) => [k, ps.map((p) => p.index)])).toEqual([["Asthma", [1, 2, 3]], ["Cystic Fibrosis", [4, 5, 6]]]);
  expect(groupPatients(byId("pcp"), listPatients()).flatMap(([, ps]) => ps)).toHaveLength(12);
  expect(groupPatients(byId("onc"), listPatients())).toEqual([]);
});

test("conditionName strips the tracker suffix", () => {
  expect(conditionName("Type 1 Diabetes Tracker (synthetic)")).toBe("Type 1 Diabetes");
  expect(conditionName("")).toBe("Other");
});
