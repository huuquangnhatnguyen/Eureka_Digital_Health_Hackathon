import { dbValue } from "@/lib/clinician/tabs";

/** Record table with a count, as the original's dbTable(). */
export default function DbTable({ title, columns, rows }: { title: string; columns: string[]; rows: unknown[][] }) {
  return (
    <section className="sec database-section">
      <div className="sec-h"><h3>{title}</h3><span className="muted">{rows.length} records</span></div>
      {rows.length ? (
        <div className="tbl-wrap db-scroll">
          <table className="tbl">
            <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{dbValue(v)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p className="empty">No records in selected dates.</p>}
    </section>
  );
}
