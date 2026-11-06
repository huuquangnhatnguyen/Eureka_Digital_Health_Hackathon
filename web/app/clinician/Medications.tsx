import { useMemo, useState } from "react";
import { clamp, fmtNum, fmtRange, fmtTime, plural } from "@/lib/clinician/model";
import { medsData, noDataText } from "@/lib/clinician/tabs";
import DbTable from "./DbTable";
import { fmtD, type Any } from "./view";

const pct = (v: number) => `${Math.round(v)}%`;

/** Medications tab: stat tiles, searchable plan, one panel per medicine, log trend and dose tables. A = all trackers. */
export default function Medications({ model, raw, A }: { model: Any; raw: Any; A: Any }) {
  const M = useMemo(() => medsData(raw, A), [raw, A]);
  const [q, setQ] = useState("");
  const plan = M.plan.filter((p: Any) => p.name.toLowerCase().includes(q.toLowerCase().trim()));
  return (
    <>
      <div className="proto-head">
        <div><h2>Medications</h2><p>Plan and patient-reported doses</p></div>
        <span className="tag">Patient record · {fmtRange(A.r.start, A.r.end)}</span>
      </div>
      <div className="proto-stats">
        {M.stats.map(([label, value, detail]: string[]) => (
          <article key={label} className="proto-stat"><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>
        ))}
      </div>
      <section className="sec">
        <div className="proto-toolbar">
          <h3>Medication plan</h3>
          <label>Find medication <input id="medication-search" type="search" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th scope="col">Medication</th><th scope="col">Schedule</th><th scope="col">Dose</th><th scope="col">Type</th></tr></thead>
            <tbody>{plan.map((p: Any) => <tr key={p.name}><th scope="row">{p.name}</th><td>{p.schedule}</td><td>{p.dose}</td><td>{p.type}</td></tr>)}</tbody>
          </table>
        </div>
        {!M.plan.length ? <p className="empty">No medications recorded in this period.</p> : !plan.length && <p className="empty">No medications match your search.</p>}
      </section>
      <section className="sec" id="sec-meds">
        <div className="sec-h"><h2>Medicines</h2><p className="sec-sub">Patient-reported doses.</p></div>
        <div className="mps">{A.lines.map((X: Any) => <MedPanel key={X.L.id} model={model} A={A} X={X} />)}</div>
      </section>
      <DbTrend title="Medication logs" points={M.trend} unit="doses / day" />
      <DbTable title="Dose history" columns={["Date", "Time", "Medication", "Logged quantity"]} rows={M.doses} />
      <DbTable title="Daily medication status" columns={["Date", "All medications marked taken"]} rows={M.status} />
      {M.badges.length > 0 && <DbTable title="Medication badges" columns={["Date", "Badge"]} rows={M.badges} />}
    </>
  );
}

/** One medicine, ported from the original medPanel(). shortcut: no interval ("every 2 weeks") variant; none in the data yet. */
function MedPanel({ model, A, X }: { model: Any; A: Any; X: Any }) {
  const L = X.L, T = L.trackerId ? model.tById.get(L.trackerId) : null, r = A.r, d = (k: string, dow = false) => fmtD(k, model.visit, { dow });
  const head = (
    <header className="mp-h">
      <h3>{L.name}</h3>
      <p className="muted">{T ? T.name : "Not linked to a tracker"} · {L.schedule.text}{L.dosageText ? ` · ${L.dosageText}` : ""}{L.members.length > 1 ? ` · ${L.members.length} records combined` : ""}</p>
    </header>
  );
  if (X.kind === "daily") {
    if (!X.due) return <article className="mp">{head}<p className="empty">No doses due in this period.</p></article>;
    if (!X.dueActive) return <article className="mp">{head}<p className="mp-v"><span className="v g-dim">No data</span> <span className="u">no entries in the app on any day in this period</span></p></article>;
    const two = X.bySlot.length === 2, nd = X.perDay.filter((p: Any) => !p.act).map((p: Any) => p.k);
    return (
      <article className="mp">
        {head}
        <p className="mp-v"><span className="v">{pct(X.pctActive)}</span> <span className="u">of doses logged · {X.takenActive} of {X.dueActive} on days with entries</span></p>
        {two && (
          <p className="muted seg-legend">
            <span className="nowrap"><span className="seg-key seg-0" />Mornings {pct((X.bySlot[0].taken / X.bySlot[0].due) * 100)}</span>
            <span className="nowrap"><span className="seg-key seg-1" />Evenings {pct((X.bySlot[1].taken / X.bySlot[1].due) * 100)}</span>
            {X.extra > 0 && <span>{plural(X.extra, "extra dose")} beyond the schedule</span>}
          </p>
        )}
        <Cols blocks={X.blocks} max={1} refV={0.8} stack={two} fmt={(v) => pct(v * 100)} aria={`${L.name} doses logged each ${r.n <= 120 ? "week" : "month"}, on days with entries`} />
        <p className="viz-cap">{r.n <= 120 ? "Weekly" : "Monthly"} share of doses logged · dashed line = 80%</p>
        {nd.length > 0 && <p className="card-f">{noDataText(nd, (k: string) => d(k))}: no entries in the app, so those days are left out of the rate.</p>}
      </article>
    );
  }
  if (X.kind === "prn") {
    const days = X.dayList.slice(-8).reverse();
    const rate = r.n <= 120 ? `${fmtNum(X.days / (r.n / 7))} days a week` : `${fmtNum(X.days / (r.n / 30.44))} days a month`;
    return (
      <article className="mp">
        {head}
        <p className="mp-v"><span className="v">{X.days}</span> <span className="u">{X.days === 1 ? "day" : "days"} used · {plural(X.uses, "use")} · {rate}</span></p>
        <Cols blocks={X.blocks} fmt={(v) => plural(v, "day")} aria={`${L.name} days used`} />
        <p className="viz-cap">{r.n <= 120 ? "Each bar is a week" : "Each bar is a month"}</p>
        {days.length > 0 && <p className="card-f">Most recent: {days.map((k: string) => `${d(k, true)} ${(model.days.get(k).doses[L.id] || []).map((x: Any) => fmtTime(x.mins)).join(" & ")}`).join("; ")}</p>}
      </article>
    );
  }
  return null;
}

/** Column sparkline, ported from the original colsHTML(). */
function Cols({ blocks, max, refV, stack, cls, fmt, aria }: { blocks: Any[]; max?: number; refV?: number; stack?: boolean; cls?: string; fmt: (v: number) => string; aria: string }) {
  if (!blocks.length) return null;
  const top = max ?? Math.max(1e-9, ...blocks.map((b) => b.v).filter((v) => v != null));
  return (
    <div className={`cols-wrap${cls ? ` ${cls}` : ""}`}>
      <div className="cols" role="img" aria-label={aria}>
        {refV != null && <span className="cols-ref" style={{ bottom: `${clamp(refV / top, 0, 1) * 100}%` }} />}
        {blocks.map((b, i) => {
          const v = b.v, h = v == null ? 0 : clamp(v / top, 0, 1) * 100;
          const slots = stack && v ? b.bySlot : null; // morning/evening segments; each is its share of the bar's total due doses
          const tip = `${b.label}: ${v == null ? "no data" : fmt(v)}${slots ? ` · morning ${slots[0].taken} of ${slots[0].due}, evening ${slots[1].taken} of ${slots[1].due}` : ""}`;
          return (
            <span key={i} className={`col${slots ? " col-stack" : ""}${v == null ? " col-na" : v === 0 ? " col-zero" : ""}${i === blocks.length - 1 ? " col-last" : ""}`} title={tip}>
              {slots
                ? slots.map((s: Any, j: number) => s.taken > 0 && <i key={j} className={`seg-${j}`} style={{ height: `${(s.taken / b.due / top) * 100}%` }} />)
                : <i style={{ height: `${v == null ? 0 : Math.max(h, 4)}%` }} />}
            </span>
          );
        })}
      </div>
      <div className="cols-axis" aria-hidden="true"><span>{md(blocks[0].start)}</span><span>{md(blocks.at(-1).end)}</span></div>
    </div>
  );
}

const md = (k: string) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Daily log-count bars, one per calendar day (gaps = no log that day), ported from the original dbTrend(). */
function DbTrend({ title, points, unit }: { title: string; points: { date: string; value: number }[]; unit: string }) {
  if (!points.length) return null;
  const byDay = new Map(points.map((p) => [p.date, p.value])), blocks: Any[] = [];
  for (let t = Date.parse(points[0].date); t <= Date.parse(points.at(-1)!.date); t += 864e5) {
    const k = new Date(t).toISOString().slice(0, 10);
    blocks.push({ label: md(k), start: k, end: k, v: byDay.get(k) ?? null });
  }
  const hi = Math.max(...points.map((p) => p.value));
  return (
    <figure className="proto-chart">
      <h3>{title} <small className="muted">{unit}</small></h3>
      <Cols blocks={blocks} cls="cols-dense cols-tall" fmt={(v) => `${v} ${unit}`} aria={`${title}, one bar per day`} />
      <p className="viz-cap">Each bar is a day · tallest = {hi} · gaps = no log that day</p>
    </figure>
  );
}
