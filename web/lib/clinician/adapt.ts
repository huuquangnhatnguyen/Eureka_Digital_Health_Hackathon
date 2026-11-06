// API shape ({ patient, tracker } from /api/patients/[id]) -> the doc and tracker library buildModel() expects.
// Replaces the HTML's databaseDefinition()/adaptDatabasePatient(), using the real tracker definition instead of guessing.
import type { PatientDoc, TrackerDef } from "@/lib/types";
import { localISO } from "./model";

/** Our question types -> the view's, plus the `role` its clinical summaries key on. */
export function toViewTracker(t: TrackerDef) {
  return {
    id: t.id,
    name: t.name,
    // GINA asthma-control logic only makes sense for asthma; other conditions get the face-scale day status.
    category: /asthma/i.test(t.name) ? "respiratory" : "other",
    questions: t.questions.map((q) => {
      switch (q.type) {
        case "faceScale":
          return { id: q.id, type: "face", role: "feeling", short: "Feeling", text: q.text, options: q.options };
        case "checkbox":
          return {
            id: q.id, type: "checkbox", role: "symptoms", short: "Symptoms", text: q.text, options: q.options,
            none: q.options?.find((o) => /^none of/i.test(o.trim()))?.trim() ?? "None of these",
          };
        case "yesNo":
          return { id: q.id, type: "yesno", role: /miss/i.test(q.text) ? "missed" : undefined, short: /miss/i.test(q.text) ? "Missed school" : q.text, text: q.text };
        case "device":
          // Only spirometry feeds the lung pipeline; glucose / oximetry answers are read from the raw record (Devices tab).
          return /spiromet/i.test(q.text)
            ? { id: q.id, type: "device", role: "spirometry", device: "spirometer", short: "Spirometry", text: q.text }
            : { id: q.id, type: "device", short: q.text, text: q.text };
      }
    }),
  };
}

/** index = the API's 1-based patient number. Never mutates `raw`. */
export function toViewDoc(raw: PatientDoc, index: number) {
  const days = raw.dailyLogs.map((l) => l.day).sort();
  const trackerIds = [...new Set(raw.dailyLogs.flatMap((l) => (l.trackerResponses ?? []).map((t) => t.trackerId)))];
  const name = `Patient ${index}`;
  return {
    ...raw,
    id: raw._id,
    profile: { displayName: name, firstName: name, age: null, sex: null },
    trackers: trackerIds,
    enrolled: days[0],
    dataThrough: days.at(-1),
    visitDate: days.at(-1),
    databaseSource: true,
    dailyLogs: raw.dailyLogs.map((l) => ({
      ...l,
      trackerResponses: (l.trackerResponses ?? []).map((tr) => ({
        ...tr,
        submittedAt: tr.date,
        responses: tr.responses.map((r) => ({ ...r, value: spiroAnswer(r.value) })),
      })),
      medicationAdministrations: (l.medicationAdministrations ?? []).map((d) => {
        const [h, m] = d.time.split(":").map(Number);
        return { ...d, medicationId: d.id, administeredAt: localISO(l.day, h, m) };
      }),
    })),
    medications: raw.medications.map((m) => ({ ...m, relatedCondition: trackerIds[0] ?? null })),
    // Spirometry readings only, renamed to the view's predicted-value keys.
    medicalDevices: raw.medicalDevices
      .map((d) => ({
        ...d,
        baselineReadings: d.baselineReadings.flatMap((r) =>
          "fvcPlusResults" in r
            ? [{ ...r, fvcPlusResults: { ...r.fvcPlusResults, fev1Pred: r.fvcPlusResults.fev1Predicted, fvcPred: r.fvcPlusResults.fvcPredicted, pefPred: r.fvcPlusResults.pefPredicted } }]
            : [],
        ),
      }))
      .filter((d) => d.baselineReadings.length),
    asthmaTreatmentPlan: raw.asthmaTreatmentPlan && { ...raw.asthmaTreatmentPlan, expiration: raw.asthmaTreatmentPlan.expiration?.slice(0, 10) ?? null },
  };
}

/** Tracker spirometry answers are {"fev1":..}; the view reads {pred, blows:[{FEV1,..}]}. Other values pass through. */
function spiroAnswer(value: string) {
  try {
    const v = JSON.parse(value);
    if (v && typeof v === "object" && !Array.isArray(v) && "fev1" in v)
      return JSON.stringify({ pred: {}, blows: [{ FEV1: v.fev1, FVC: v.fvc, PEF: v.pef, accepted: v.accepted }] });
  } catch {
    // not JSON: plain answer
  }
  return value;
}
