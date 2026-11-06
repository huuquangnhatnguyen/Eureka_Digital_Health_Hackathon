import { useMemo } from "react";
import { MONTHS, analyze, clamp, fmtRange, plural } from "@/lib/clinician/model";
import { calendarDays } from "@/lib/clinician/visit";
import { fmtD, type Any } from "./view";

const pct = (v: number) => `${Math.round(v)}%`;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WORD: Record<string, string> = { good: "Good day", mixed: "So-so day", hard: "Hard day", logged: "Checked in", none: "No data" };
const path = { check: "M3.5 8.4l3 3 6-6.8", minus: "M4 8h8" };
const Icon = ({ st }: { st: string }) =>
  st === "good" || st === "mixed" ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d={st === "good" ? path.check : path.minus} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
    : st === "hard" ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l6.4 11.2H1.6z" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" /><path d="M8 6.4v3.3" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /><circle cx="8" cy="11.5" r="1" fill="currentColor" /></svg>
      : st === "logged" ? <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.6" fill="currentColor" /></svg> : null;

/** Visit mode: the patient-facing summary of the last weeks (at most 3 months), ported from the original renderVisit(). */
export default function Visit({ model, A, focus, onExit }: { model: Any; A: Any; focus: Any[]; onExit: () => void }) {
  const long = A.r.n > 91;
  const VA = useMemo(() => (long ? analyze(model, "91") : A), [long, model, A]);
  const vr = VA.r, v = model.visit, d = (k: string, dow = false) => fmtD(k, v, { dow });
  const first = model.doc.profile.firstName;
  const weeks = vr.n === 28 ? "4 weeks" : vr.n % 7 === 0 ? `${vr.n / 7} weeks` : `${vr.n} days`;
  const tr = VA.trackers.filter((T: Any) => focus.includes(T.t)), inFocus = (X: Any) => focus.some((t: Any) => t.id === X.L.trackerId);
  const dayNum = (k: string) => <span className="vc-n">{+k.slice(8)}{k.slice(8) === "01" ? " " + MONTHS[+k.slice(5, 7) - 1] : ""}</span>;
  const grid = calendarDays(vr);
  const S = VA.spiro, L = S?.latest, B = L && S.baseline && S.baseline.quality !== "poor" && S.baseline !== L ? S.baseline : null;
  const bar = (label: string, x: number) => (
    <div className="v-bar"><span className="v-bl">{label}</span><span className="v-bt"><i style={{ width: `${(clamp(x, 0, 120) / 120) * 100}%` }} /><em style={{ left: `${(80 / 120) * 100}%` }} /></span><b>{pct(x)}</b></div>
  );
  return (
    <section className="visit" aria-label="Visit view for the patient">
      <header className="v-head">
        <div>
          <p className="v-eye">Visit · {d(v, true)}</p>
          <h1>{first ? `${first}, here are your last ${weeks}` : `Your last ${weeks}`}</h1>
          <p className="v-range">{fmtRange(vr.start, vr.end)}{long ? " · this view shows up to 3 months" : ""}</p>
        </div>
        <button type="button" className="btn" id="btn-exit-visit" onClick={onExit}>Back to clinician view</button>
      </header>
      {tr.map((T: Any) => {
        const c = T.counts;
        return (
          <article key={T.t.id} className="v-card">
            <h2>{T.t.name}</h2>
            <p className="v-sum"><span className="v-b v-good">{c.good}</span> good {c.good === 1 ? "day" : "days"} <span className="v-b v-mixed">{c.mixed}</span> so-so <span className="v-b v-hard">{c.hard}</span> hard <span className="v-b v-none">{c.none}</span> no data</p>
            <div className="vc" role="group" aria-label={`${T.t.name} by day`}>
              {DOW.map((x) => <span key={x} className="vc-dow">{x}</span>)}
              {grid.map((k: string | null, i: number) => {
                if (!k) return <span key={i} className="vc-day out" aria-hidden="true" />;
                const s = model.days.get(k)?.tr[T.t.id], st = s?.hasAnswers ? s.status : "none";
                return <span key={k} className={`vc-day v-${st}`} title={`${d(k, true)}: ${WORD[st]}`}>{dayNum(k)}<span className="vc-dot"><Icon st={st} /></span><span className="vh">{WORD[st]}</span></span>;
              })}
            </div>
          </article>
        );
      })}
      {VA.lines.filter((X: Any) => X.kind === "daily" && X.dueActive && inFocus(X)).map((X: Any) => {
        const two = X.bySlot.length === 2, per = new Map(X.perDay.map((p: Any) => [p.k, p]));
        return (
          <article key={X.L.id} className="v-card">
            <h2>Your daily {X.L.name}</h2>
            <p className="v-sum">You logged <b>{X.takenActive} of {X.dueActive}</b> doses on the days you used the app.{two ? ` Mornings ${X.bySlot[0].taken} of ${X.bySlot[0].due}, evenings ${X.bySlot[1].taken} of ${X.bySlot[1].due}.` : ""}{X.inactive ? ` ${plural(X.inactive, "day")} with no data.` : ""}</p>
            <div className="vc" role="group" aria-label={`${X.L.name} doses by day`}>
              {DOW.map((x) => <span key={x} className="vc-dow">{x}</span>)}
              {grid.map((k: string | null, i: number) => {
                if (!k) return <span key={i} className="vc-day out" aria-hidden="true" />;
                const p: Any = per.get(k);
                if (!p) return <span key={k} className="vc-day">{dayNum(k)}</span>;
                if (!p.act) return <span key={k} className="vc-day vd vd-nd" title={`${d(k, true)}: no data`}>{dayNum(k)}<span className="vd-p"><i className="nd" /></span><span className="vh">No data</span></span>;
                const words = p.filled.map((x: Any, j: number) => `${two ? (j ? "evening" : "morning") : "dose"} ${x ? "logged" : "not logged"}`).join(", ");
                return <span key={k} className="vc-day vd" title={`${d(k, true)}: ${words}`}>{dayNum(k)}<span className="vd-p">{p.filled.map((x: Any, j: number) => <i key={j} className={x ? "tk" : "ms"} />)}</span><span className="vh">{words}</span></span>;
              })}
            </div>
            <p className="v-note">{two ? "Top bar: morning. Bottom bar: evening. " : ""}Filled = you logged it. Gray dash = no data that day.</p>
          </article>
        );
      })}
      {VA.lines.filter((X: Any) => X.kind === "prn" && inFocus(X)).map((X: Any) => (
        <article key={X.L.id} className="v-card v-small">
          <h2>{X.L.name}</h2>
          <p className="v-big">{X.days}</p>
          <p className="v-sum">{X.days === 1 ? "day" : "days"} you used it{model.tById.get(X.L.trackerId)?.category === "respiratory" ? " (rescue inhaler)" : ""}</p>
        </article>
      ))}
      {L && focus.some((t: Any) => t.questions.some((q: Any) => q.type === "device")) && (
        <article className="v-card">
          <h2>Your breathing test</h2>
          <p className="v-sum">How much air you blew out in the first second, compared with what&apos;s expected for you. 80% or more is in the usual range.</p>
          {B && bar(d(B.key), B.fev1Pct)}
          {bar(d(L.key), L.fev1Pct)}
          {L.zone && <p className="v-note">Peak flow on {d(L.key)}: {pct(L.pefPctPB)} of your best, the <b>{L.zone} zone</b> of your action plan.</p>}
        </article>
      )}
      {!tr.length && <article className="v-card"><p className="v-sum">No trackers match this view.</p></article>}
    </section>
  );
}
