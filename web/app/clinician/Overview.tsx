"use client";

import { useMemo, useState } from "react";
import { buildReview } from "@/lib/clinician/review";
import type { Any } from "./view";
import ReviewOverview from "./Review";

/** Card overview for every condition. Mount with key={deptId}: added cards are per department.
    (The latest design dropped the data-coverage and action-plan lines that used to follow the cards.) */
export default function Overview({ model, raw, A, focus, deptId }: { model: Any; raw: Any; A: Any; focus: Any[]; deptId: string }) {
  const storeKey = `shcv-overview-cards-${deptId}`;
  const [selected, setSelected] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storeKey) ?? "[]"); } catch { return []; } // unreadable or blocked storage: start empty
  });
  const review = useMemo(() => buildReview(model, raw, A, focus, selected), [model, raw, A, focus, selected]);
  const save = (next: string[]) => {
    setSelected(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* storage unavailable: choice lasts until reload */ }
  };
  return review ? <ReviewOverview review={review} selected={selected} onChange={save} /> : <section className="sec"><p className="empty">No trackers to summarize.</p></section>;
}
