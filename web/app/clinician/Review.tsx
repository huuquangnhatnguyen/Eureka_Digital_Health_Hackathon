"use client";

import { useEffect, useRef, useState } from "react";
import type { Any } from "./view";

type Choice = [id: string, label: string, unit: string];
type Review = {
  cards: Any[]; ticks: [number, string][]; subtitle: string;
  picker: { fixed: string | null; summary: Choice[]; groups: [string, Choice[]][]; note: string };
};

/** The card "At a glance" for every condition; the picker offers what this patient's device records.
    Added cards are saved per department in this browser. */
export default function ReviewOverview({ review, selected, onChange }: { review: Review; selected: string[]; onChange: (next: string[]) => void }) {
  const [notice, setNotice] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDetailsElement>(null);

  // After add/remove, move focus like the original: to the new card's remove button, or back to "Add".
  useEffect(() => {
    if (!focusId) return;
    (document.querySelector(`[data-widget="${focusId}"] .review-remove`) as HTMLElement | null ?? pickerRef.current?.querySelector("summary"))?.focus();
  }, [focusId, review]);

  const labels = new Map([...review.picker.summary, ...review.picker.groups.flatMap(([, l]) => l)].map(([id, label]) => [id, label]));
  const change = (id: string, add: boolean) => {
    const next = add ? [...new Set([...selected, id])] : selected.filter((x) => x !== id);
    setNotice(`${labels.get(id) ?? id} ${add ? "added" : "removed"}.`);
    if (pickerRef.current) pickerRef.current.open = false;
    setFocusId(add ? id : "__add");
    onChange(next);
  };

  const pickButton = ([id, name, unit]: Choice) => {
    const shown = id === review.picker.fixed, added = selected.includes(id);
    return (
      <button key={id} type="button" disabled={shown || added} onClick={() => change(id, true)}>
        {name}{unit} <span>{shown ? "Shown" : added ? "Added" : "＋"}</span>
      </button>
    );
  };

  return (
    <section className="review-overview" aria-labelledby="review-title">
      <div className="review-heading">
        <div>
          <h2 id="review-title">At a glance</h2>
          <p>{review.subtitle}</p>
        </div>
        <details className="overview-add" ref={pickerRef}>
          <summary>＋ Add</summary>
          <div className="overview-picker">
            <strong>Add to your overview</strong>
            <p>Saved for this department on this browser.</p>
            <h4>Patient summary</h4>
            {review.picker.summary.map(pickButton)}
            {review.picker.note && <p className="picker-note">{review.picker.note}</p>}
            {review.picker.groups.map(([group, list]) => (
              <div key={group}>
                <h4>{group}</h4>
                {list.map(pickButton)}
              </div>
            ))}
          </div>
        </details>
      </div>
      <div className="review-grid">
        {review.cards.map((c, i) => <Card key={c.id ?? `fixed-${i}`} c={c} ticks={review.ticks} onRemove={c.id ? () => change(c.id, false) : undefined} />)}
      </div>
      <p className="review-save" role="status" aria-live="polite">{notice}</p>
    </section>
  );
}

function Card({ c, ticks, onRemove }: { c: Any; ticks: [number, string][]; onRemove?: () => void }) {
  return (
    <article className="review-card" data-widget={c.id}>
      <header>
        <h3>{c.title}</h3>
        {onRemove && <button type="button" className="review-remove" onClick={onRemove} aria-label={`Remove ${c.title}`}>×</button>}
      </header>
      {c.value && <div className="review-value">{c.value}</div>}
      <p className="review-context">{c.context}</p>
      {c.lists?.map((l: Any, i: number) => (
        <div key={i}>
          {l.heading && <h4>{l.heading}</h4>}
          <ul className="review-list">
            {l.items.length ? l.items.map(([k, v]: [string, string | number]) => <li key={k}><span>{k}</span><strong>{v}</strong></li>) : <li>{l.empty}</li>}
          </ul>
        </div>
      ))}
      {c.facts?.map((f: Any) => <div key={f.label} className="review-fact"><span>{f.label}</span><strong>{f.value}</strong><small>{f.sub}</small></div>)}
      {c.meter && (
        <div className="review-meter" role="img" aria-label={`${c.meter.n} of ${c.meter.of} days with answers`}>
          <span style={{ width: `${(c.meter.n / c.meter.of) * 100}%` }} />
        </div>
      )}
      {c.plot && <ReviewPlot {...c.plot} ticks={ticks} />}
      {c.source && (
        <details className="review-values baseline-source">
          <summary>Source &amp; selection</summary>
          {c.source.confidence && <p>Field mapping confidence: {c.source.confidence}% (supplied mapping, not clinical confidence).</p>}
          <code>{c.source.code}</code>
          {c.source.code.includes("fvcPlusResults") && <p>Sessions are inferred from the same UTC date and device, with gaps no greater than 30 minutes. No session IDs or pre/post-bronchodilator labels are supplied.</p>}
        </details>
      )}
      {c.foot && <p className="review-foot">{c.foot}</p>}
    </article>
  );
}

/** Bar or line chart with labelled values, ported from the original reviewPlot(); exact values in the table below it. */
function ReviewPlot({ points, max = 100, line = false, unit = "", color = "#BE3268", label = "", decimals = 0, ticks }: Any) {
  const w = 420, left = 42, right = 400, top = 26, bottom = 154, n = points.length, step = (right - left) / Math.max(1, n);
  const x = (i: number) => left + step * (i + 0.5), y = (v: number) => bottom - (v / max) * (bottom - top);
  const grid = [...new Set([0, unit ? max / 2 : Math.ceil(max / 2), max])];
  let path = "", connected = false;
  for (const [i, p] of points.entries()) {
    if (p.v == null) { connected = false; continue; }
    path += `${connected ? "L" : "M"}${x(i)},${y(p.v)} `;
    connected = true;
  }
  return (
    <>
      <svg className="review-plot" viewBox={`0 0 ${w} 192`} role="img" aria-label={label}>
        {line && <path d={path} fill="none" stroke={color} strokeWidth={2.5} />}
        {grid.map((v) => (
          <g key={v}>
            <line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="#E9DDE3" />
            <text x={34} y={y(v) + 4} textAnchor="end" fill="#706670" fontSize={11}>{Number(v.toFixed(1))}{unit}</text>
          </g>
        ))}
        {points.map((p: Any, i: number) => p.v == null ? (
          <text key={i} x={x(i)} y={bottom - 5} textAnchor="middle" fill="#706670" fontSize={12}>—</text>
        ) : (
          <g key={i}>
            {line
              ? <circle cx={x(i)} cy={y(p.v)} r={3.5} fill={color}><title>{`${p.label}: ${p.detail}`}</title></circle>
              : <rect x={x(i) - step * 0.3} y={y(p.v)} width={step * 0.6} height={Math.max(1, bottom - y(p.v))} rx={3} fill={color}><title>{`${p.label}: ${p.detail}`}</title></rect>}
            {(n <= 8 || i % 2 === 0 || i === n - 1) && <text x={x(i)} y={y(p.v) - 8} textAnchor="middle" fill="#302A31" fontSize={11}>{p.v.toFixed(decimals)}{unit}</text>}
          </g>
        ))}
        {ticks.map(([i, t]: [number, string]) => <text key={i} x={x(i)} y={180} textAnchor="middle" fill="#706670" fontSize={11}>{t}</text>)}
      </svg>
      <details className="review-values">
        <summary>View chart values</summary>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th scope="col">Dates</th><th scope="col">{label}</th></tr></thead>
            <tbody>{points.map((p: Any) => <tr key={p.start}><td>{p.label}</td><td>{p.detail}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}
