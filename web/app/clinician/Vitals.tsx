import { useMemo } from "react";
import { vitalsData } from "@/lib/clinician/tabs";
import DbTable from "./DbTable";
import { fmtD, type Any } from "./view";

const EMOJI: Record<string, string> = { Great: "😄", Okay: "😐", Bad: "😞" };

/** Vitals tab: survey answers, feeling and symptom counts, questionnaire activity and tracker badges. */
export default function Vitals({ model, raw, A }: { model: Any; raw: Any; A: Any }) {
  const V = useMemo(() => vitalsData(raw, A), [raw, A]);
  return (
    <>
      <div className="proto-head"><div><h2>Vitals</h2></div></div>
      {/* The original kept a one-tab "Surveys" nav after removing its example vitals; kept for the same look. */}
      <div className="vital-nav" role="tablist" aria-label="Vital categories">
        <button type="button" role="tab" id="vital-surveys" aria-selected="true" tabIndex={0} aria-controls="vital-content">Surveys</button>
      </div>
      <section className="sec">
        <h3>Reported feeling</h3>
        <div className="feeling-counts">
          {V.feeling.map(([label, n]: [string, number]) => (
            <div key={label} className="feeling-item">
              <span className="feeling-emoji" role="img" aria-label={label}>{EMOJI[label]}</span>
              <strong>{n}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="sec">
        <h3>Reported symptoms</h3>
        <div className="symptom-counts">
          {V.symptoms.length
            ? V.symptoms.map(([label, n]: [string, number]) => <div key={label}><span>{label}</span><strong>{n}</strong></div>)
            : <p className="empty">No symptoms reported.</p>}
        </div>
      </section>
      <section className="sec" id="vital-content" role="tabpanel" aria-labelledby="vital-surveys">
        <div className="sec-h"><h3>Surveys</h3></div>
        {V.entries.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">Date</th><th scope="col">Tracker</th><th scope="col">Measure</th><th scope="col">Response</th></tr></thead>
              <tbody>
                {V.entries.map((e: Any, i: number) => (
                  <tr key={i}><td>{fmtD(e.date, model.visit)}</td><td>{e.tracker}</td><th scope="row">{e.label}</th><td>{e.value} {e.unit}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No readings recorded in this period.</p>}
      </section>
      <DbTable title="Questionnaire activity" columns={["Date", "Submissions", "Answered fields"]} rows={V.activity} />
      <DbTable title="Tracker badges" columns={["Date", "Badge"]} rows={V.badges} />
    </>
  );
}
