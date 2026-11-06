"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEFAULT_CARDS, MAX_CARDS } from "@/lib/clinician/review";
import type { Any } from "./view";

/** Up to this many cards, the grid stretches to fill the rest of the screen; more cards and the page scrolls. */
const FIT_CARDS = 3, FIT_MIN = 400, FIT_MIN_WIDTH = 1101; // the grid is 3 columns above 1100px (clinician.css)

type Choice = [id: string, label: string, unit: string];
type Review = {
  cards: Any[]; ticks: [number, string][]; subtitle: string;
  picker: { fixed: string | null; summary: Choice[]; groups: [string, Choice[]][]; note: string };
};

/** The card "At a glance" for every condition; the picker offers what this patient's device records.
    Every card (defaults included) can be removed or moved; the list is saved per patient (see Overview.tsx). */
export default function ReviewOverview({ review, selected, onChange }: { review: Review; selected: string[]; onChange: (next: string[]) => void }) {
  const [notice, setNotice] = useState("");
  const [focusSel, setFocusSel] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDetailsElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fit = review.cards.length <= FIT_CARDS;

  // Fit mode: grid height = window height minus everything else on the page, so the page itself doesn't scroll.
  useLayoutEffect(() => {
    const g = gridRef.current;
    if (!g) return;
    const size = () => {
      g.style.height = "";
      delete g.dataset.fit;
      if (!fit || innerWidth < FIT_MIN_WIDTH) return; // narrower: cards wrap to 2+ rows, so the page scrolls
      const h = Math.floor(innerHeight - (document.documentElement.getBoundingClientRect().height - g.offsetHeight));
      if (h < FIT_MIN) return; // too short to fit readable cards: keep the normal layout and let the page scroll
      g.style.height = `${h}px`;
      g.dataset.fit = "";
    };
    size();
    addEventListener("resize", size);
    return () => removeEventListener("resize", size);
  }, [fit, review]);

  // After a change, keep focus on the card that changed (its remove or move button), else back on "Add".
  useEffect(() => {
    if (!focusSel) return;
    (document.querySelector(focusSel) as HTMLElement | null ?? pickerRef.current?.querySelector("summary"))?.focus();
  }, [focusSel, review]);

  const labels = new Map([...review.picker.summary, ...review.picker.groups.flatMap(([, l]) => l)].map(([id, label]) => [id, label]));
  const change = (id: string, add: boolean) => {
    const next = add ? [...new Set([...selected, id])] : selected.filter((x) => x !== id);
    setNotice(`${labels.get(id) ?? id} ${add ? "added" : "removed"}.`);
    if (pickerRef.current) pickerRef.current.open = false;
    setFocusSel(add ? `[data-widget="${id}"] .review-remove` : ".overview-add > summary");
    onChange(next);
  };
  const cards = review.cards, full = cards.length >= MAX_CARDS;
  const move = (i: number, d: -1 | 1) => {
    const a = cards[i].id, b = cards[i + d].id; // swap with the card on screen, skipping saved ids this patient can't show
    setNotice(`${cards[i].title} moved ${d < 0 ? "earlier" : "later"}.`);
    setFocusSel(`[data-widget="${a}"] [data-move="${d}"]:not(:disabled), [data-widget="${a}"] .review-remove`);
    onChange(selected.map((x) => (x === a ? b : x === b ? a : x)));
  };
  const isDefault = selected.join() === DEFAULT_CARDS.join();
  const reset = () => { setNotice("Overview reset to the default cards."); setFocusSel(".overview-add > summary"); onChange(DEFAULT_CARDS); };

  const pickButton = ([id, name, unit]: Choice) => {
    const shown = id === review.picker.fixed, added = selected.includes(id);
    return (
      <button key={id} type="button" disabled={shown || added || full} onClick={() => change(id, true)}>
        {name}{unit} <span>{shown ? "Shown" : added ? "Added" : "＋"}</span>
      </button>
    );
  };

  return (
    <section className={fit ? "review-overview review-fit" : "review-overview"} aria-labelledby="review-title">
      <div className="review-heading">
        <div>
          <h2 id="review-title">At a glance</h2>
          <p>{review.subtitle}</p>
        </div>
        <div className="review-actions">
          <p className="review-save" role="status" aria-live="polite">{notice}</p>
        <button type="button" className="review-reset" onClick={reset} disabled={isDefault}>Reset</button>
        <details className="overview-add" ref={pickerRef}>
          <summary>＋ Add</summary>
          <div className="overview-picker">
            <strong>Add to your overview</strong>
            <p>{full ? `All ${MAX_CARDS} slots are in use. Remove a card to add another.` : `Saved for this patient. ${cards.length} of ${MAX_CARDS} slots used.`}</p>
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
      </div>
      {cards.length ? (
        <div className="review-grid" ref={gridRef}>
          {cards.map((c, i) => (
            <Card key={`${c.id}-${i}`} c={c} ticks={review.ticks} onRemove={() => change(c.id, false)}
              onMove={(d) => move(i, d)} first={i === 0} last={i === cards.length - 1} />
          ))}
        </div>
      ) : <p className="empty">No cards. Use ＋ Add to choose what to see.</p>}
    </section>
  );
}

function Card({ c, ticks, onRemove, onMove, first, last }: { c: Any; ticks: [number, string][]; onRemove: () => void; onMove: (d: -1 | 1) => void; first: boolean; last: boolean }) {
  return (
    <article className="review-card" data-widget={c.id}>
      <header>
        <h3>{c.title}</h3>
        <div className="review-tools">
          <button type="button" className="review-move" data-move="-1" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${c.title} earlier`}>↑</button>
          <button type="button" className="review-move" data-move="1" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${c.title} later`}>↓</button>
          <button type="button" className="review-remove" onClick={onRemove} aria-label={`Remove ${c.title}`}>×</button>
        </div>
      </header>
      {c.value && <div className="review-value">{c.value}{c.flag && <span className="review-flag">{c.flag}</span>}</div>}
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
      {c.plot ? <ReviewPlot {...c.plot} ticks={ticks}>{source(c)}</ReviewPlot> : source(c)}
      {c.foot && <p className="review-foot">{c.foot}</p>}
    </article>
  );
}

/** "Source & selection" disclosure; sits on the same line as "View chart values" when the card has a chart. */
function source(c: Any) {
  return c.source && (
    <details className="review-values baseline-source">
      <summary>Source &amp; selection</summary>
      {c.source.confidence && <p>Field mapping confidence: {c.source.confidence}% (supplied mapping, not clinical confidence).</p>}
      <code>{c.source.code}</code>
      {c.source.code.includes("fvcPlusResults") && <p>Sessions are inferred from the same UTC date and device, with gaps no greater than 30 minutes. No session IDs or pre/post-bronchodilator labels are supplied.</p>}
    </details>
  );
}

/** Bar or line chart with labelled values, ported from the original reviewPlot(); exact values in the table below it. */
function ReviewPlot({ points, max = 100, line = false, unit = "", color = "#BE3268", label = "", decimals = 0, range, ticks, children }: Any) {
  const w = 420, left = 42, right = 400, top = 26, bottom = 154, n = points.length, step = (right - left) / Math.max(1, n);
  const x = (i: number) => left + step * (i + 0.5), y = (v: number) => bottom - (v / max) * (bottom - top);
  const flagged = range && points.some((p: Any) => p.flag);
  // Out of range: a triangle pointing the way it is out (shape, not only colour). Unusual for this patient: a ring.
  const mark = (cx: number, v: number, status: string | null, odd: boolean, r: number, key?: number) => (
    <g key={key}>
      {status && <path d={status === "low" ? `M${cx - r},${y(v) - r * 0.7}h${2 * r}l${-r},${r * 1.7}z` : `M${cx - r},${y(v) + r * 0.7}h${2 * r}l${-r},${-r * 1.7}z`} fill="#B42318" />}
      {odd && <circle cx={cx} cy={y(v)} r={r + 3.5} fill="none" stroke="#302A31" strokeWidth={1.5} />}
    </g>
  );
  const grid = [...new Set([0, unit ? max / 2 : Math.ceil(max / 2), max])];
  let path = "", connected = false;
  for (const [i, p] of points.entries()) {
    if (p.v == null) { connected = false; continue; }
    path += `${connected ? "L" : "M"}${x(i)},${y(p.v)} `;
    connected = true;
  }
  return (
    <>
      <svg className="review-plot" viewBox={`0 0 ${w} 192`} role="img" aria-label={range ? `${label}. Normal range ${range.lo ?? 0}–${range.hi ?? "up"}${unit}.` : label}>
        {range && <rect x={left} width={right - left} y={y(Math.min(range.hi ?? max, max))} height={y(range.lo ?? 0) - y(Math.min(range.hi ?? max, max))} fill="#E5F3EC" />}
        {range && [range.lo, range.hi].filter((v) => v != null && v <= max).map((v) => (
          <g key={`r${v}`}>
            <line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="#3A8A63" strokeDasharray="4 3" />
            <text x={right + 4} y={y(v) + 4} fill="#2F7352" fontSize={10}>{v}</text>
          </g>
        ))}
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
            {p.marks?.map((m: Any, j: number) => mark(x(i), m.v, m.status, m.odd, 3.5, j))}
            {(p.status || p.odd) && mark(x(i), p.v, p.status, p.odd, 5.5)}
            {line
              ? <circle cx={x(i)} cy={y(p.v)} r={3.5} fill={color}><title>{`${p.label}: ${p.detail}${p.flag ? ` (${p.flag})` : ""}`}</title></circle>
              : <rect x={x(i) - step * 0.3} y={y(p.v)} width={step * 0.6} height={Math.max(1, bottom - y(p.v))} rx={3} fill={color}><title>{`${p.label}: ${p.detail}`}</title></rect>}
            {(n <= 8 || i % 2 === 0 || i === n - 1 || p.status) && <text x={x(i)} y={y(p.v) - 10} textAnchor="middle" fill={p.status ? "#B42318" : "#302A31"} fontWeight={p.status ? 700 : 400} fontSize={11}>{p.v.toFixed(decimals)}{unit}</text>}
          </g>
        ))}
        {ticks.map(([i, t]: [number, string]) => <text key={i} x={x(i)} y={180} textAnchor="middle" fill="#706670" fontSize={11}>{t}</text>)}
      </svg>
      {range && (
        <p className="review-legend">
          <span className="lg-band" /> Normal range
          {flagged && <><span className="lg-out">▼▲</span> Below / above normal <span className="lg-odd" /> Unusual for this patient</>}
        </p>
      )}
      <div className="review-links">
        <details className="review-values">
          <summary>View chart values</summary>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">Dates</th><th scope="col">{label}</th>{range && <th scope="col">Flag</th>}</tr></thead>
              <tbody>{points.map((p: Any) => <tr key={p.start}><td>{p.label}</td><td>{p.detail}</td>{range && <td>{p.flag || "—"}</td>}</tr>)}</tbody>
            </table>
          </div>
        </details>
        {children}
      </div>
    </>
  );
}
