"use client";

import "./clinician.css";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { PatientDoc, PatientListItem, TrackerDef } from "@/lib/types";
import { toViewDoc, toViewTracker } from "@/lib/clinician/adapt";
import { analyze, buildModel, diffDays, fmtRange, fmtTime } from "@/lib/clinician/model";
import { DEPARTMENTS, conditionName, departmentsWithPatients, groupPatients, inDepartment } from "@/lib/clinician/departments";
import { fmtD, focusOf, getJSON, type Any } from "./view";
import Overview from "./Overview";
import Vitals from "./Vitals";
import Medications from "./Medications";
import Devices from "./Devices";
import CareTeam from "./CareTeam";
import Visit from "./Visit";
import { buildCSV } from "@/lib/clinician/visit";

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
  const [view, setView] = useState<"patient" | "team">("patient");
  const [visit, setVisit] = useState(false);
  const [toast, setToast] = useState("");
  // every patient's record, fetched the first time the care team view opens
  const [cohort, setCohort] = useState<{ index: number; raw: PatientDoc; condition: string }[] | null>(null);

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
  // The original styles visit mode from <body class="is-visit">.
  useEffect(() => {
    document.body.classList.toggle("is-visit", visit && view === "patient");
    return () => document.body.classList.remove("is-visit");
  }, [visit, view]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (view !== "team" || cohort || !patients.length) return;
    Promise.all(patients.map((p) => getJSON<Omit<Detail, "index">>(`/api/patients/${p.index}`).then((d) => ({ index: p.index, raw: d.patient, condition: p.condition })))).then(
      setCohort,
      (e) => setError(String(e)),
    );
  }, [view, cohort, patients]);

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
  /** One row per day for the period shown, to the clipboard (the original only downloads inside a host that offers it). */
  const copyCSV = async () => {
    if (!model || !A) return;
    try {
      await navigator.clipboard.writeText(buildCSV(model, A));
      setToast("CSV copied to the clipboard.");
    } catch {
      setToast("Couldn't copy here. Please try exporting again.");
    }
  };
  /** From the care team roster: that patient's record over the review period, on Overview. */
  const openPatient = (i: number, start: string, end: string) => {
    setIndex(i);
    setRange(`custom|${start}|${end}`);
    setTab("overview");
    setVisit(false);
    setView("patient");
    window.scrollTo(0, 0);
  };

  return (
    <div className={view === "team" ? "care-team-mode" : undefined} style={{ margin: -24 /* full-bleed inside the root layout's padded <main> */ }}>
      <header className="bar" id="bar">
        <div className="bar-row">
          <p className="brand"><span className="brand-n">SMART@Home</span><span className="brand-s">Clinician view</span><span className="proto">PROTOTYPE</span></p>
          <div className="bar-act">
            <button type="button" className="btn" id="btn-visit" aria-pressed={visit} disabled={!ready} onClick={() => { setVisit(!visit); window.scrollTo({ top: 0 }); }}>{visit ? "Clinician view" : "Visit mode"}</button>
            <button type="button" className="btn btn-ghost" id="btn-export" disabled={!ready} onClick={copyCSV} title="Copies one row per day for the period shown">Copy CSV</button>
          </div>
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
        <nav className="care-view-tabs" aria-label="Clinical view">
          <button type="button" aria-pressed={view === "patient"} onClick={() => setView("patient")}>Patient</button>
          <button type="button" aria-pressed={view === "team"} onClick={() => setView("team")}>Care team <span>{patients.length}</span></button>
        </nav>
        {error ? (
          <div className="notice notice-warn" role="alert"><p><b>Couldn&apos;t load patient data.</b> {error}</p></div>
        ) : view === "team" ? (
          cohort ? <CareTeam patients={cohort} dept={dept} departments={departmentsWithPatients(patients)} onDept={pickDept} onOpen={openPatient} /> : <p className="muted">Loading all patients…</p>
        ) : !ready ? (
          <p className="muted">Loading…</p>
        ) : visit ? (
          <Visit model={model} A={A} focus={focus} onExit={() => { setVisit(false); window.scrollTo({ top: 0 }); }} />
        ) : (
          <>
            <PatientHeader model={model} />
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
      <div id="toast" className="toast" role="status" aria-live="polite" hidden={!toast}>{toast}</div>
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

function PatientHeader({ model }: { model: Any }) {
  const v: string = model.visit, le = model.lastEntry, la = model.lastActivity, doc = model.doc;
  // The original reads a plan title from the record and falls back to "Treatment plan"; our records have none, so the condition names it.
  const plan = [doc.treatmentPlan?.title, doc.treatmentPlan?.name, doc.asthmaTreatmentPlan?.title, doc.asthmaTreatmentPlan?.name, doc.syntheticProfile?.plan]
    .find((x) => typeof x === "string" && x.trim())?.trim() ?? (model.trackers[0] ? `${conditionName(model.trackers[0].name)} plan` : "Treatment plan");
  const last = le
    ? fmtD(le.key, v, { year: le.key.slice(0, 4) !== v.slice(0, 4) || diffDays(le.key, v) > 60 }) + (diffDays(le.key, v) <= 2 ? `, ${fmtTime(le.mins)}` : "")
    : "None";
  return (
    <section className="pt" id="sec-patient" aria-label="Patient">
      <div className="pt-id"><h1>{doc.profile.displayName}</h1><span className="pt-plan-title">{plan}</span></div>
      <dl className="pt-facts">
        <div><dt>Data through</dt><dd>{fmtD(v, v, { dow: true, year: true })}</dd></div>
        <div>
          <dt>Last check-in</dt>
          <dd>{last}{la && le && la.key > le.key && <span className="muted"> · app used {fmtD(la.key, v, { year: true })}</span>}</dd>
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
