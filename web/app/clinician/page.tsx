"use client";

import "./clinician.css";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { PatientDoc, PatientListItem, TrackerDef } from "@/lib/types";
import { toViewDoc, toViewTracker } from "@/lib/clinician/adapt";
import { analyze, buildModel, diffDays, fmtRange, fmtTime } from "@/lib/clinician/model";
import { DEPARTMENTS, departmentsWithPatients, groupPatients, inDepartment } from "@/lib/clinician/departments";
import { fmtD, focusOf, getJSON, type Any } from "./view";
import Overview from "./Overview";
import Vitals from "./Vitals";
import Medications from "./Medications";
import Devices from "./Devices";

const TABS = [
  ["overview", "Overview"],
  ["vitals", "Vitals"],
  ["medications", "Medications"],
  ["devices", "Medical Device Readings"],
] as const;
type Tab = (typeof TABS)[number][0];

interface Detail { index: number; patient: PatientDoc; tracker: TrackerDef }

export default function ClinicianView() {
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [index, setIndex] = useState(1);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deptId, setDeptId] = useState(DEPARTMENTS[0].id);
  const [range, setRange] = useState("all");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    getJSON<PatientListItem[]>("/api/patients").then(setPatients, (e) => setError(String(e)));
  }, []);
  useEffect(() => {
    let stale = false; // a slower earlier request must not overwrite the patient just picked
    getJSON<Omit<Detail, "index">>(`/api/patients/${index}`).then(
      (d) => !stale && setDetail({ index, ...d }),
      (e) => !stale && setError(String(e)),
    );
    return () => { stale = true; };
  }, [index]);

  const model = useMemo(() => detail && buildModel(toViewDoc(detail.patient, detail.index), [toViewTracker(detail.tracker)]), [detail]);
  const A = useMemo(() => model && analyze(model, range), [model, range]);
  const ready = model && A && detail?.index === index;
  const dept = DEPARTMENTS.find((d) => d.id === deptId)!;
  const focus = useMemo(() => (model ? focusOf(model, dept) : []), [model, dept]);
  // Tabs summarize the department's trackers only, as the original's viewA did.
  const viewA = useMemo(() => A && { ...A, trackers: A.trackers.filter((T: Any) => focus.includes(T.t)) }, [A, focus]);
  const pickDept = (id: string) => {
    const d = DEPARTMENTS.find((x) => x.id === id)!;
    setDeptId(id);
    const cur = patients.find((p) => p.index === index);
    // keep the current patient if they belong to the new department, else open its first patient
    if (!cur || !inDepartment(d, cur.condition)) setIndex(groupPatients(d, patients)[0][1][0].index);
  };

  return (
    <div style={{ margin: -24 /* full-bleed inside the root layout's padded <main> */ }}>
      <header className="bar" id="bar">
        <div className="bar-row">
          <p className="brand"><span className="brand-n">SMART@Home</span><span className="brand-s">Clinician view</span><span className="proto">PROTOTYPE</span></p>
        </div>
        <div className="ctl-row">
          <label className="ctl" htmlFor="sel-department">
            <span className="ctl-l">Department</span>
            <select id="sel-department" value={deptId} onChange={(e) => pickDept(e.target.value)}>
              {departmentsWithPatients(patients).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <label className="ctl" htmlFor="sel-patient">
            <span className="ctl-l">Patient</span>
            <select id="sel-patient" value={index} onChange={(e) => { setIndex(Number(e.target.value)); window.scrollTo({ top: 0 }); }}>
              {groupPatients(dept, patients).map(([condition, ps]) => (
                <optgroup key={condition} label={condition}>
                  {ps.map((p) => <option key={p.index} value={p.index}>Patient {p.index}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {ready && <DateControls key={`${A.r.start}|${A.r.end}`} start={A.r.start} end={A.r.end} onApply={(a, b) => setRange(`custom|${a}|${b}`)} />}
        </div>
      </header>

      <div className="main" id="main">
        {error ? (
          <div className="notice notice-warn" role="alert"><p><b>Couldn&apos;t load patient data.</b> {error}</p></div>
        ) : !ready ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <PatientHeader model={model} focus={focus} />
            <Notices model={model} A={A} range={range} onShowAll={() => setRange("all")} />
            <WorkspaceNav tab={tab} onChange={setTab} />
            <div id="workspace-content" role="tabpanel" aria-labelledby={`tab-${tab}`}>
              {tab === "overview" ? <Overview key={deptId} model={model} raw={detail.patient} A={viewA} focus={focus} deptId={deptId} />
                : tab === "vitals" ? <Vitals model={model} raw={detail.patient} A={viewA} />
                : tab === "medications" ? <Medications model={model} raw={detail.patient} A={A} />
                : <Devices raw={detail.patient} A={A} />}
            </div>
          </>
        )}
      </div>
      <footer className="foot"><p>SMART@Home · PROTOTYPE</p></footer>
    </div>
  );
}

function DateControls({ start, end, onApply }: { start: string; end: string; onApply: (from: string, to: string) => void }) {
  const [err, setErr] = useState("");
  return (
    <form
      className="date-controls"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget), a = String(f.get("from")), b = String(f.get("to"));
        if (!a || !b) return setErr("Choose both dates.");
        if (a > b) return setErr("End date must follow start date.");
        setErr("");
        onApply(a, b);
      }}
    >
      <label className="ctl">From<input type="date" id="date-from" name="from" defaultValue={start} /></label>
      <label className="ctl">To<input type="date" id="date-to" name="to" defaultValue={end} /></label>
      <button className="btn" id="apply-dates" type="submit">Apply</button>
      <span id="date-error" role="status">{err}</span>
    </form>
  );
}

function PatientHeader({ model, focus }: { model: Any; focus: Any[] }) {
  const v: string = model.visit, le = model.lastEntry, la = model.lastActivity;
  const last = le
    ? fmtD(le.key, v, { year: le.key.slice(0, 4) !== v.slice(0, 4) || diffDays(le.key, v) > 60 }) + (diffDays(le.key, v) <= 2 ? `, ${fmtTime(le.mins)}` : "")
    : "None";
  return (
    <section className="pt" id="sec-patient" aria-label="Patient">
      <div className="pt-id"><h1>{model.doc.profile.displayName}</h1></div>
      <dl className="pt-facts">
        <div><dt>Data through</dt><dd>{fmtD(v, v, { dow: true, year: true })}</dd></div>
        <div>
          <dt>Last check-in</dt>
          <dd>{last}{la && le && la.key > le.key && <span className="muted"> · app used {fmtD(la.key, v, { year: true })}</span>}</dd>
        </div>
        <div>
          <dt>Trackers</dt>
          <dd className="tchips">{model.trackers.map((t: Any) => <span key={t.id} className={`tchip${focus.includes(t) ? " on" : ""}`}>{t.name}</span>)}</dd>
        </div>
      </dl>
    </section>
  );
}

function Notices({ model, A, range, onShowAll }: { model: Any; A: Any; range: string; onShowAll: () => void }) {
  if (A.eng.anyDays || !model.lastEntry || range === "all") return null;
  return (
    <div className="notice notice-warn">
      <p><b>No data in this period.</b> The patient made no entries between {fmtRange(A.r.start, A.r.end)}. The last check-in was {fmtD(model.lastEntry.key, model.visit, { year: true })}.</p>
      <button className="btn-sm" type="button" onClick={onShowAll}>Show all data</button>
    </div>
  );
}

function WorkspaceNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  // Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern), as in the original.
  const onKeyDown = (e: KeyboardEvent) => {
    const i = TABS.findIndex(([id]) => id === tab), n = TABS.length;
    const j = { ArrowLeft: (i - 1 + n) % n, ArrowRight: (i + 1) % n, Home: 0, End: n - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    onChange(TABS[j][0]);
    document.getElementById(`tab-${TABS[j][0]}`)?.focus();
  };
  return (
    <nav className="workspace-nav" role="tablist" aria-label="Patient workspace" onKeyDown={onKeyDown}>
      {TABS.map(([id, label]) => (
        <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls="workspace-content" tabIndex={tab === id ? 0 : -1} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
