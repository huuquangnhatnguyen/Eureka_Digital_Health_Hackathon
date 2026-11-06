"use client";

import { useMemo, useRef, useState } from "react";
import { buildReview, DEFAULT_CARDS } from "@/lib/clinician/review";
import type { PatientDoc } from "@/lib/types";
import type { Any } from "./view";
import ReviewOverview from "./Review";

type Ranges = NonNullable<PatientDoc["overviewRanges"]>;

// Last saved settings per patient this session: the fetched record is older once the clinician edits, and the
// tab remounts on every visit to Overview.
const latest = new Map<string, string[]>(), latestRanges = new Map<string, Ranges>();

/** Card overview for every condition. Mount with key={index}: the card list (order included) and any changed normal
    ranges are saved per patient through PATCH /api/patients/[index]. */
export default function Overview({ model, raw, A, focus, index }: { model: Any; raw: Any; A: Any; focus: Any[]; index: number }) {
  const [selected, setSelected] = useState<string[]>(() => latest.get(raw._id) ?? raw.overviewCards ?? DEFAULT_CARDS);
  const [ranges, setRanges] = useState<Ranges>(() => latestRanges.get(raw._id) ?? raw.overviewRanges ?? {});
  const [saveFailed, setSaveFailed] = useState(false);
  const saving = useRef(Promise.resolve()); // one request at a time, so an older value never lands after a newer one
  const review = useMemo(() => buildReview(model, raw, A, focus, selected, ranges), [model, raw, A, focus, selected, ranges]);
  const send = (body: object) => {
    saving.current = saving.current
      .then(() => fetch(`/api/patients/${index}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
      .then((r) => setSaveFailed(!r.ok), () => setSaveFailed(true));
  };
  const save = (next: string[]) => { setSelected(next); latest.set(raw._id, next); send({ overviewCards: next }); };
  /** range null = back to the default for that field. */
  const saveRange = (key: string, range: Ranges[string] | null) => {
    const next = { ...ranges };
    if (range) next[key] = range;
    else delete next[key];
    setRanges(next);
    latestRanges.set(raw._id, next);
    send({ overviewRanges: next });
  };
  if (!review) return <section className="sec"><p className="empty">No trackers to summarize.</p></section>;
  return (
    <>
      {saveFailed && <div className="notice notice-warn" role="alert"><p><b>Couldn&apos;t save this change.</b> It stays on this screen until you reload; your next change will try again.</p></div>}
      <ReviewOverview review={review} selected={selected} onChange={save} onRange={saveRange} />
    </>
  );
}
