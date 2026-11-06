import { useMemo, useState } from "react";
import { devicesData } from "@/lib/clinician/devices";
import DbTable from "./DbTable";
import type { Any } from "./view";

/** Medical Device Readings tab: one section per paired device, then device answers given in check-ins. */
export default function Devices({ raw, A }: { raw: Any; A: Any }) {
  const D = useMemo(() => devicesData(raw, A), [raw, A]);
  return (
    <>
      <div className="proto-head"><div><h2>Medical Device Readings</h2><p className="muted">{D.subtitle || "No device"} · Pre-visit review</p></div></div>
      {!D.devices.length && <section className="sec"><p className="empty">No paired devices.</p></section>}
      {D.devices.map((d: Any) => <Device key={d.serial} d={d} />)}
      <details className="review-details">
        <summary>View questionnaire device readings · {D.questionnaire.rows.length}</summary>
        <DbTable title="Questionnaire device readings" columns={D.questionnaire.columns} rows={D.questionnaire.rows} />
      </details>
    </>
  );
}

function Device({ d }: { d: Any }) {
  return (
    <section className="sec database-section">
      <div className="spiro-header"><h3>{d.name}</h3><span className="muted">{d.counts}</span></div>
      <p className="spiro-meta">Serial: {d.serial} · Selected dates: {d.range}</p>
      {!d.n ? <p className="empty">No records in selected dates.</p> : (
        <>
          <h4>{d.latestHeading}</h4>
          <p className="spiro-meta">{d.latestText}</p>
          <div className="spiro-cards">
            {d.cards.map((c: Any) => (
              <div key={c.label} className="spiro-card">
                <span>{c.label}</span>
                <strong>{c.value} <small style={{ display: "inline" }}>{c.unit}</small></strong>
                {c.subs.map((s: string) => <small key={s}>{s}</small>)}
              </div>
            ))}
          </div>
          <Trend t={d.trend} />
          {d.note && <p className="spiro-meta">{d.note}</p>}
          <details className="review-details">
            <summary>View detailed readings · {d.n} {d.noun}</summary>
            <div className="sec-h"><h3>Device readings</h3><span className="muted">Newest first</span></div>
            <div className="tbl-wrap spiro-scroll">
              <table className="tbl spiro-table">
                <caption>{d.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">Date / time</th>
                    {d.columns.map(([label, isNum]: [string, boolean]) => <th key={label} scope="col" className={isNum ? "spiro-num" : undefined}>{label}</th>)}
                    <th scope="col">Quality</th><th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r: Any) => (
                    <tr key={r.key}>
                      <td><strong style={{ fontSize: 13 }}>{r.date}</strong><span className="spiro-secondary">{r.time}</span></td>
                      {r.cells.map((c: Any, i: number) => (
                        <td key={i} className={d.columns[i][1] ? "spiro-num" : undefined}><strong>{c.main}</strong>{c.sub && <span className="spiro-secondary">{c.sub}</span>}</td>
                      ))}
                      <td>
                        <span className={`spiro-quality${r.ok ? "" : " review"}`}>{r.ok ? "Accepted" : "Review quality"}</span>
                        {r.messages && <span className="spiro-secondary">{r.messages}</span>}
                      </td>
                      <td><details><summary>More values</summary>{r.details.map((p: string) => <p key={p}>{p}</p>)}</details></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

/** Daily trend, ported from the original spiroTrend(); the clinician picks which measures share the one axis, gaps break the line. */
function Trend({ t }: { t: Any }) {
  const [shown, setShown] = useState<string[]>(() => t.series.filter((s: Any) => s.on).map((s: Any) => s.key));
  const series = t.series.filter((s: Any) => shown.includes(s.key));
  const toggle = (key: string, on: boolean) => setShown(on ? [...shown, key] : shown.filter((k) => k !== key));
  const vals: number[] = t.points.flatMap((p: Any) => series.map((s: Any) => p[s.key])).filter(Number.isFinite);
  const head = (
    <div className="spiro-header">
      <h3>{t.title} <small className="muted">{[...new Set(series.map((s: Any) => s.unit))].join(" · ")}</small></h3>
      <details className="overview-add">
        <summary>Measures · {series.length}/{t.series.length}</summary>
        <div className="overview-picker">
          <strong>Show on chart</strong>
          {t.series.map((s: Any) => (
            <label key={s.key} className="chart-pick">
              <input type="checkbox" checked={shown.includes(s.key)} onChange={(e) => toggle(s.key, e.target.checked)} />
              <svg width={28} height={8} aria-hidden="true"><line x1={0} x2={28} y1={4} y2={4} stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dash || undefined} /></svg>
              {s.label} <span className="muted">{s.unit}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
  if (!series.length) return <figure className="spiro-trend">{head}<p className="empty">Pick at least one measure to plot.</p></figure>;
  if (!vals.length) return <figure className="spiro-trend">{head}<p className="empty">No accepted readings to plot in selected dates.</p></figure>;
  // zero-based like the original for volumes and glucose; oximetry sits in a narrow band, so it gets a padded min–max axis (capped at 100 when everything is %)
  const pad = Math.ceil(Math.max(...vals) + 1), cap = series.every((s: Any) => s.unit === "%") ? Math.min(100, pad) : pad;
  const lo = t.zero ? 0 : Math.floor(Math.min(...vals) - 2), hi = t.zero ? Math.max(1, Math.ceil(Math.max(...vals))) : cap;
  const t0 = Date.parse(t.points[0].day), span = Date.parse(t.points.at(-1).day) - t0;
  const x = (p: Any) => (span ? 50 + ((Date.parse(p.day) - t0) / span) * 690 : 395), y = (v: number) => 175 - ((v - lo) / (hi - lo || 1)) * 145;
  const grid = [lo, (lo + hi) / 2, hi];
  return (
    <figure className="spiro-trend">
      {head}
      <div className="spiro-legend">{series.map((s: Any) => (
        <span key={s.key} style={{ color: s.color }}>
          <svg width={24} height={8} aria-hidden="true"><line x1={0} x2={24} y1={4} y2={4} stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dash || undefined} /></svg> {s.label}
        </span>
      ))}</div>
      <svg viewBox="0 0 790 210" role="img" aria-label={`${t.title}; exact readings in the table below`}>
        {grid.map((v) => (
          <g key={v}>
            <line x1={50} x2={740} y1={y(v)} y2={y(v)} stroke="#e0e7ed" />
            <text x={38} y={y(v) + 4} textAnchor="end" fill="#526474" fontSize={12}>{v.toFixed(t.decimals === 0 ? 0 : 1)}</text>
          </g>
        ))}
        {series.map((s: Any) => {
          let path = "", connected = false;
          for (const p of t.points) {
            if (!Number.isFinite(p[s.key])) { connected = false; continue; }
            path += `${connected ? "L" : "M"}${x(p)},${y(p[s.key])} `;
            connected = true;
          }
          return (
            <g key={s.key}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dash || undefined} />
              {t.points.filter((p: Any) => Number.isFinite(p[s.key])).map((p: Any) => (
                <circle key={p.day} cx={x(p)} cy={y(p[s.key])} r={3} fill={s.color}><title>{`${p.day} · ${s.label} ${p[s.key].toFixed(s.decimals ?? t.decimals)} ${s.unit}`}</title></circle>
              ))}
            </g>
          );
        })}
        <text x={50} y={202} fill="#526474" fontSize={12}>{t.points[0].day}</text>
        <text x={740} y={202} textAnchor="end" fill="#526474" fontSize={12}>{t.points.at(-1).day}</text>
      </svg>
      <figcaption className="spiro-meta">{t.caption}</figcaption>
    </figure>
  );
}
