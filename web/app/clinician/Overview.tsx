"use client";

import { useMemo, useState } from "react";
import { buildReview, coverage } from "@/lib/clinician/review";
import { fmtD, type Any } from "./view";
import ReviewOverview from "./Review";

/** Card overview for every condition, then data coverage and the action plan. Mount with key={deptId}: added cards are per department. */
export default function Overview({ model, raw, A, focus, deptId }: { model: Any; raw: Any; A: Any; focus: Any[]; deptId: string }) {
  const storeKey = `shcv-overview-cards-${deptId}`;
  const [selected, setSelected] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) ?? "[]"); } catch { return []; } // unreadable or blocked storage: start empty
  });
  const review = useMemo(() => buildReview(model, raw, A, focus, selected), [model, raw, A, focus, selected]);
  const C = useMemo(() => coverage(model, raw, A), [model, raw, A]);
  const plan = model.doc.asthmaTreatmentPlan;
  const save = (next: string[]) => {
    setSelected(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* storage unavailable: choice lasts until reload */ }
  };

  return (
    <>
      {review ? <ReviewOverview review={review} selected={selected} onChange={save} /> : <section className="sec"><p className="empty">No trackers to summarize.</p></section>}
      <p className="review-coverage">
        <strong>Data coverage</strong> · Check-ins {C.checkins}/{C.n} days · Medication logs {C.medicationDays}/{C.n} days · Questions answered {C.answered}/{C.totalQuestions} · {C.deviceLabel} {C.device}
      </p>
      {plan && (
        <div className="db-plan">
          <strong>Action plan</strong>
          <span>Status: {plan.status || "—"}</span>
          <span>Expires: {plan.expiration ? fmtD(plan.expiration, model.visit, { year: true }) : "—"}</span>
          <span>Retest: {plan.retestTime ? fmtD(plan.retestTime.slice(0, 10), model.visit, { year: true }) : "—"}</span>
        </div>
      )}
    </>
  );
}
