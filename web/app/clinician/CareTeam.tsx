"use client";

import { useMemo, useState } from "react";
import { CARE_HINTS, CARE_LABELS, CARE_SORTS, careAsOf, careCSV, careFilter, careMeds, careRecentDays, careRows } from "@/lib/clinician/care";
import { inDepartment, type Department } from "@/lib/clinician/departments";
import { fmtRange } from "@/lib/clinician/model";
import { fmtD, type Any } from "./view";

type Status = keyof typeof CARE_LABELS;
const STATUSES = Object.keys(CARE_LABELS) as Status[];
const REVIEW_KEY = "shcv-care-reviewed-v1";
const readReviewed = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(REVIEW_KEY) ?? "{}"); } catch { return {}; } };

/** Care team dashboard: summary, "who needs a closer look" dot plot and the patient roster, for every API patient.
    patients: [{ index, raw, condition }]. onOpen opens one patient's record over the review period. */
export default function CareTeam({ patients, dept, departments, onDept, onOpen }: {
  patients: Any[]; dept: Department; departments: Department[]; onDept: (id: string) => void; onOpen: (index: number, start: string, end: string) => void;
}) {
  const [days, setDays] = useState(28);
  const [f, setF] = useState({ search: "", status: "all", active7: false, sort: "priority" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [inspect, setInspect] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(readReviewed);
  const asOf: string = useMemo(() => careAsOf(patients), [patients]);
  const all = useMemo(() => careRows(patients, days, asOf, reviewed), [patients, days, asOf, reviewed]);
  const rows: Any[] = careFilter(all, f, (r: Any) => inDepartment(dept, r.plan));
  const start = rows[0]?.start ?? all[0]?.start;
  const nSelected = rows.filter((r) => selected.has(r.id)).length;
  const lastText = (r: Any) => (r.lastLog ? fmtD(r.lastLog, asOf) : "No entries");

  const saveReviewed = (next: Record<string, string>, msg: string) => {
    setReviewed(next);
    setNotice(msg);
    try { localStorage.setItem(REVIEW_KEY, JSON.stringify(next)); } catch { /* storage unavailable: markers last until reload */ }
  };
  const toggleReview = (id: string) => {
    const next = { ...reviewed };
    if (next[id] === asOf) delete next[id]; else next[id] = asOf;
    saveReviewed(next, "Review marker saved in this browser.");
  };
  const markSelected = () => {
    const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
    saveReviewed({ ...reviewed, ...Object.fromEntries(ids.map((id) => [id, asOf])) }, `${ids.length} patients marked reviewed in this browser.`);
    setSelected(new Set());
  };
  const exportCSV = () => {
    const url = URL.createObjectURL(new Blob([careCSV(rows, days, asOf)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `synthetic-care-team-${asOf}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${rows.length} synthetic patient records.`);
  };
  const filterStatus = (status: string) => setF({ ...f, status });
  const open = (r: Any) => onOpen(r.index, r.start, asOf);
  const select = (ids: string[], on: boolean) => setSelected((s) => { const n = new Set(s); for (const id of ids) if (on) n.add(id); else n.delete(id); return n; });

  return (
    <section id="care-dashboard">
      <div className="care-title">
        <div>
          <p className="care-eyebrow">All patients · synthetic data</p>
          <h1>Care team dashboard</h1>
          <p>Medication reporting, activity, and home device readings in one place.</p>
        </div>
        <span className="care-demo">SYNTHETIC DATA · AS OF {fmtD(asOf, "", { year: true }).toUpperCase()}</span>
      </div>
      <div className="care-scope">
        <label>Department
          <select id="care-department" value={dept.id} onChange={(e) => { onDept(e.target.value); setSelected(new Set()); }}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <label>Review period
          <select id="care-period" value={days} onChange={(e) => { setDays(Number(e.target.value)); setSelected(new Set()); }}>
            {[7, 14, 28].map((n) => <option key={n} value={n}>Last {n} days</option>)}
          </select>
        </label>
        <span>Filters apply to all summaries, the dot plot, and the roster.</span>
      </div>
      <div className="care-filters">
        <label className="care-search">Find patient<input id="care-search" type="search" placeholder="Search name, ID, or plan…" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} /></label>
        <label>Adherence status
          <select id="care-status" value={f.status} onChange={(e) => filterStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUSES.map((k) => <option key={k} value={k}>{CARE_LABELS[k]}</option>)}
          </select>
        </label>
        <label>Roster sort
          <select id="care-sort" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })}>
            {CARE_SORTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="care-switch"><input type="checkbox" id="care-active" checked={f.active7} onChange={(e) => setF({ ...f, active7: e.target.checked })} />Active in last 7 days</label>
        <button type="button" className="lnk" id="care-reset" onClick={() => { setF({ search: "", status: "all", active7: false, sort: "priority" }); setSelected(new Set()); setNotice(""); }}>Reset filters</button>
      </div>

      <Summary rows={rows} status={f.status} onFilter={filterStatus} onOpen={open} />
      <Population rows={rows} days={days} asOf={asOf} patients={patients} inspect={inspect} onInspect={setInspect} onFilter={filterStatus} onOpen={open} lastText={lastText} />

      <section className="care-roster">
        <div className="care-roster-head">
          <h2>Patient roster <span>{rows.length}</span></h2>
          <div>
            <button className="btn-sm" type="button" id="care-mark-selected" disabled={!nSelected} onClick={markSelected}>Mark {nSelected} reviewed</button>
            <button className="btn-sm" type="button" id="care-export" disabled={!rows.length} onClick={exportCSV}>Export filtered CSV</button>
          </div>
        </div>
        <div className="care-table-scroll">
          <table className="care-table">
            <caption>Synthetic patient roster · {start ? fmtRange(start, asOf) : ""}. Click a patient to open their full record.</caption>
            <thead>
              <tr>
                <th scope="col"><input type="checkbox" id="care-select-all" aria-label="Select all visible patients" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} disabled={!rows.length} onChange={(e) => select(rows.map((r) => r.id), e.target.checked)} /></th>
                <th scope="col">Patient / plan</th><th scope="col">Doses logged</th><th scope="col">Status</th><th scope="col">Reporting</th>
                <th scope="col">Last 7 days</th><th scope="col">Symptoms</th><th scope="col">Latest device reading</th><th scope="col">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={(e) => select([r.id], e.target.checked)} /></td>
                  <th scope="row">
                    <button className="care-patient" type="button" onClick={() => open(r)}>{r.name} <span>↗</span></button>
                    <small>{r.plan}</small>
                    <small className="care-source">{r.source} · synthetic</small>
                  </th>
                  <td>
                    <strong>{r.percent == null ? "—" : `${Math.round(r.percent)}%`}</strong>
                    <div className="care-dose-meter"><i className={`care-fill-${r.status}`} style={{ width: `${r.percent ?? 0}%` }} /></div>
                    <small>{r.taken}/{r.due} scheduled doses*</small>
                  </td>
                  <td><span className={`care-status care-${r.status}`}><i className={`care-dot care-fill-${r.status}`} />{CARE_LABELS[r.status as Status]}</span></td>
                  <td><b>{r.activeDays}/{days} days</b><small>Last entry {r.lastLog ? fmtD(r.lastLog, asOf) : "none"}</small></td>
                  <td>
                    <div className="care-activity" role="img" aria-label={r.bits.map((b: Any) => `${fmtD(b.day, asOf)}: ${b.active ? "app activity" : "no entry"}`).join("; ")}>
                      {r.bits.map((b: Any) => <i key={b.day} className={b.active ? "active" : ""} title={`${fmtD(b.day, asOf)}: ${b.active ? "app activity" : "no entry"}`} />)}
                    </div>
                    <small>{r.active7}/7 days active</small>
                  </td>
                  <td><b>{r.symptoms} days</b><small>Reported symptoms</small></td>
                  <td>
                    <b>{r.reading ?? "—"}</b>
                    <small>{r.lastMeasurement ? fmtD(r.lastMeasurement, asOf) : "No usable reading"}</small>
                    {r.rejected > 0 && <small className="care-quality">{r.rejected} {r.noun[r.rejected === 1 ? 0 : 1]} to review</small>}
                  </td>
                  <td><button type="button" className="care-review-btn" aria-pressed={r.reviewed} onClick={() => toggleReview(r.id)}>{r.reviewed ? "✓ Reviewed" : "Mark reviewed"}</button></td>
                </tr>
              )) : <tr><td colSpan={9}><div className="care-empty">No patients match these filters.<br />Try another department, search, or status.</div></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="care-method">* Patient-reported doses / scheduled doses on days with app entries. No entry is unknown, not a confirmed missed dose. Green ≥85%; orange 50–&lt;85%; red &lt;50%. Gray when fewer than 7 reporting days or less than 50% coverage. These are demo workflow thresholds, not clinical risk grades.</p>
        <p className="care-live" role="status" aria-live="polite">{notice}</p>
      </section>
      <details className="care-provenance">
        <summary>About the synthetic data and dashboard calculations</summary>
        <p>{patients.length} synthetic patients from the API (data/synthetic_*_db.json): asthma, cystic fibrosis, type 1 diabetes and congenital heart disease. The dashboard counts back from {fmtD(asOf, "", { year: true })}, the newest day in any record.</p>
        <p>Scheduled doses are daily, non-as-needed medicines. Departments without matching patients show an empty roster.</p>
        <p>Latest device reading is the latest accepted reading in the period: FEV1 % predicted for spirometers, glucose for meters, SpO2 for pulse oximeters. The measurement card shows recency and quality, not diagnosis. Reviewed markers are local browser notes, not messages to a care team.</p>
      </details>
    </section>
  );
}

function Summary({ rows, status, onFilter, onOpen }: { rows: Any[]; status: string; onFilter: (s: string) => void; onOpen: (r: Any) => void }) {
  const counts = Object.fromEntries(STATUSES.map((k) => [k, rows.filter((r) => r.status === k).length])) as Record<Status, number>;
  const total = rows.length, colors: Record<Status, string> = { red: "#D12E45", orange: "#E9BE87", green: "#9BC8AD", unknown: "#D9D3DD" };
  const low = rows.filter((r) => r.status === "red");
  const order: Status[] = ["red", "orange", "green", "unknown"];
  const starts = order.filter((k) => counts[k]).reduce<[Status, number][]>((acc, k) => [...acc, [k, acc.length ? acc.at(-1)![1] + (counts[acc.at(-1)![0]] / total) * 100 : 0]], []);
  return (
    <div className="care-summary">
      <article>
        <div className="care-eyebrow">Patients in view</div>
        <strong className="care-big">{total}</strong>
        <p>{rows.filter((r) => r.active7).length} active in last 7 days · {rows.filter((r) => r.activeDays).length} in selected period</p>
        <div className="care-mini-stats">
          <span><b>{rows.filter((r) => r.reviewed).length}</b> reviewed</span>
          <span><b>{rows.filter((r) => !r.reviewed && r.status !== "green").length}</b> awaiting review</span>
        </div>
      </article>
      <article>
        <div className="care-eyebrow">Medication plan adherence</div>
        <div className="care-adherence-layout">
          <div className="care-donut">
            <svg viewBox="0 0 180 180" aria-label="Medication logging distribution" role="group">
              <circle cx="90" cy="90" r="64" fill="none" stroke="#F2EDF1" strokeWidth="18" />
              {starts.map(([k, from]) => {
                const share = (counts[k] / total) * 100, visible = share === 100 ? 100 : Math.max(0.25, share - 1);
                return (
                  <circle key={k} className="care-donut-arc" cx="90" cy="90" r="64" pathLength={100} fill="none" stroke={colors[k]} strokeWidth={k === "red" ? 26 : 18}
                    strokeDasharray={`${visible} ${100 - visible}`} strokeDashoffset={-from} transform="rotate(-90 90 90)" role="button" tabIndex={0}
                    aria-label={`Show ${counts[k]} ${CARE_LABELS[k].toLowerCase()} patients, ${Math.round(share)}% of patients in view`}
                    onClick={() => onFilter(k)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onFilter(k); } }}>
                    <title>{`${CARE_LABELS[k]}: ${counts[k]} of ${total} patients (${Math.round(share)}%)`}</title>
                  </circle>
                );
              })}
            </svg>
            <button type="button" className="care-donut-center" disabled={!counts.red} onClick={() => onFilter("red")} aria-label={`Show ${counts.red} patients below 50% dose logging`}>
              <strong>{total ? counts.red : "—"}</strong>
              <span>{total ? "below 50%" : "No patients"}</span>
              <small>{total ? `${Math.round((counts.red / total) * 100)}% of ${total} in view` : ""}</small>
            </button>
          </div>
          <div className="care-key care-donut-key">
            {order.map((k) => (
              <button key={k} type="button" aria-pressed={status === k} onClick={() => onFilter(k)}>
                <i className={`care-dot care-fill-${k}`} /><span>{CARE_LABELS[k]}<small>{CARE_HINTS[k]}</small></span><b>{counts[k]}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="care-outliers">
          {low.length ? (
            <>
              <p>Patients with low medication logging</p>
              <div>
                {low.slice(0, 3).map((r) => <button key={r.id} type="button" onClick={() => onOpen(r)}>{r.name} <b>{Math.round(r.percent)}%</b></button>)}
                {low.length > 3 && <button type="button" onClick={() => onFilter("red")}>View all {low.length}</button>}
              </div>
            </>
          ) : <p>{total ? "No patients below 50% in this view." : "No patients match the current filters."}</p>}
        </div>
      </article>
      <article>
        <div className="care-eyebrow">Measurement follow-up</div>
        <div className="care-measure"><strong>{rows.filter((r) => r.measurementGap).length}</strong><span>without a usable device reading<br />in the last 7 days</span></div>
        <p>{rows.filter((r) => r.rejected > 0).length} patients have readings needing quality review in the selected period.</p>
        <small>Data quality and recency, not abnormal results.</small>
      </article>
    </div>
  );
}

function Population({ rows, days, asOf, patients, inspect, onInspect, onFilter, onOpen, lastText }: {
  rows: Any[]; days: number; asOf: string; patients: Any[]; inspect: string | null; onInspect: (id: string) => void; onFilter: (s: string) => void; onOpen: (r: Any) => void; lastText: (r: Any) => string;
}) {
  const ranked = rows.filter((r) => r.status !== "unknown").sort((a, b) => a.percent - b.percent || a.index - b.index);
  const unknown = rows.filter((r) => r.status === "unknown").sort((a, b) => a.index - b.index);
  const low = ranked.filter((r) => r.status === "red");
  const sel = rows.find((r) => r.id === inspect) || low[0] || ranked[0] || unknown[0];
  const meta = (r: Any) => `${r.activeDays}/${days} days reported · Last ${lastText(r)}`;
  return (
    <section className="population-panel" aria-labelledby="population-heading">
      <header className="population-heading">
        <div><h2 id="population-heading">Who needs a closer look?</h2><p>Medication doses logged · Lowest first · {ranked.length} patients with enough reporting</p></div>
        <span className="population-alert">{low.length} below 50%</span>
      </header>
      <div className="population-layout">
        <div className="population-main">
          <div className="population-axis">
            <span>Patient · reporting coverage</span>
            <div>{[0, 50, 85, 100].map((v) => <span key={v} style={{ left: `${v}%` }}>{v}%</span>)}</div>
            <span>Logged</span>
          </div>
          <div className="population-scroll" aria-label="Patients sorted by medication logging">
            {ranked.length ? ranked.map((r) => (
              <button key={r.id} type="button" className={`population-row ${sel?.id === r.id ? "is-selected" : ""}`} aria-pressed={sel?.id === r.id} onClick={() => onInspect(r.id)}
                aria-label={`Review ${r.name}, ${Math.round(r.percent)}% doses logged, ${r.activeDays} of ${days} days reported, last entry ${lastText(r)}`}>
                <span className="population-name"><b>{r.name}</b><small>{meta(r)}</small></span>
                <span className="population-track" aria-hidden="true">
                  <i className="population-tick at50" /><i className="population-tick at85" />
                  <i className={`population-dot care-fill-${r.status}`} style={{ left: `${r.percent}%` }} />
                </span>
                <strong className="population-percent">{Math.round(r.percent)}%<small>{CARE_LABELS[r.status as Status]}</small></strong>
              </button>
            )) : <p className="population-empty">No patients with enough reporting in this view.</p>}
          </div>
          <p className="population-note">One dot per patient. Select a row to see recent medication logs. Percentages use scheduled doses on days with entries.</p>
          <div className="population-unknown">
            <h3>Insufficient data <span>{unknown.length}</span></h3>
            <p>Shown separately; missing reports are not low adherence.</p>
            {unknown.length ? unknown.map((r) => (
              <button key={r.id} type="button" aria-pressed={sel?.id === r.id} onClick={() => onInspect(r.id)}>
                <span><b>{r.name}</b><small>{meta(r)}</small></span><span className="care-status care-unknown">Not enough reports</span>
              </button>
            )) : <small>No patients with insufficient data in this view.</small>}
          </div>
        </div>
        <aside className="population-review">
          <h3>Low logging · review list</h3>
          <p>Below the demo threshold of 50%.</p>
          <ol>
            {low.slice(0, 3).map((r) => (
              <li key={r.id}>
                <button type="button" aria-pressed={sel?.id === r.id} onClick={() => onInspect(r.id)}>
                  <span><b>{r.name}</b><small>{r.activeDays}/{days} days reported · {lastText(r)}</small></span><strong>{Math.round(r.percent)}%</strong>
                </button>
              </li>
            ))}
          </ol>
          {!low.length && <p>No patients below 50% in this view.</p>}
          {low.length > 3 && <button className="lnk" type="button" onClick={() => onFilter("red")}>View all {low.length} low-logging patients</button>}
          {sel && <Detail r={sel} raw={patients.find((p) => p.raw._id === sel.id).raw} asOf={asOf} onOpen={onOpen} />}
        </aside>
      </div>
    </section>
  );
}

function Detail({ r, raw, asOf, onOpen }: { r: Any; raw: Any; asOf: string; onOpen: (r: Any) => void }) {
  const recent = careRecentDays(raw, asOf), meds = careMeds(raw);
  return (
    <section className="population-detail" id="population-detail" aria-label="Selected patient medication details" tabIndex={-1}>
      <h3>{r.name}</h3>
      <p>{meds.join(", ") || "No scheduled medicine recorded"}</p>
      <div className="population-detail-value">
        <strong>{r.status === "unknown" ? "Insufficient data" : `${Math.round(r.percent)}% logged`}</strong>
        <span>{r.taken}/{r.due} doses on reporting days</span>
      </div>
      <h4>Last 7 days · doses logged / scheduled</h4>
      <div className="population-recent">
        {recent.map((d: Any) => <div key={d.day} className={d.due ? "has-data" : ""}><small>{fmtD(d.day, asOf)}</small><b>{d.due ? `${d.taken}/${d.due}` : "—"}</b></div>)}
      </div>
      <p>— No app entry or no scheduled dose. Missing reports are unknown.</p>
      <button type="button" className="btn-sm" onClick={() => onOpen(r)}>Open full patient record ↗</button>
    </section>
  );
}
