// Visit mode calendar grid and the per-day CSV export, ported from the HTML's visitCalendar()/buildCSV().
import { DOWS, addDays, dowOf, eachDay, fmtNum } from "./model";

/** Monday-first weeks covering the range; days outside it are null (blank cells). */
export function calendarDays(r) {
  const start = addDays(r.start, -((dowOf(r.start) + 6) % 7)), end = addDays(r.end, (7 - dowOf(r.end)) % 7);
  return eachDay(start, end).map(k => (k < r.start || k > r.end ? null : k));
}

const csvCell = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** One row per day of the range: check-ins, day status and answers per tracker, doses per medicine, spirometry. */
export function buildCSV(model, A) {
  const head = ["date", "weekday"];
  for (const t of model.trackers) {
    head.push(`${t.name}: check-ins`, `${t.name}: day`);
    for (const q of t.questions) if (q.type !== "device") head.push(`${t.name}: ${q.short || q.text}`);
  }
  for (const L of model.lines) head.push(L.schedule.kind === "daily" ? `${L.name}: doses taken` : `${L.name}: doses`);
  if (model.sessions.length) head.push("FEV1 (L)", "FEV1 % predicted", "FVC (L)", "FEV1/FVC %", "Peak flow (L/min)", "Peak flow % of best", "Spirometry technique");
  const out = [head.map(csvCell).join(",")];
  for (const k of eachDay(A.r.start, A.r.end)) {
    const d = model.days.get(k), row = [k, DOWS[dowOf(k)]];
    for (const t of model.trackers) {
      const s = d && d.tr[t.id];
      row.push(s ? s.all.length : 0, s && s.hasAnswers ? s.status : "no data");
      for (const q of t.questions) {
        if (q.type === "device") continue;
        const v = s && s.hasAnswers ? s.merged[q.id] : undefined;
        row.push(v == null ? "" : Array.isArray(v) ? v.join("; ") : v === true ? "yes" : v === false ? "no" : v);
      }
    }
    for (const L of model.lines) row.push(d && d.doses[L.id] ? d.doses[L.id].length : d && d.activity ? 0 : "no data");
    if (model.sessions.length) {
      const s = d && d.sessions[0];
      row.push(...(s ? [fmtNum(s.best.fev1, 2), s.fev1Pct != null ? Math.round(s.fev1Pct) : "", fmtNum(s.best.fvc, 2), Math.round(s.best.ratio * 100), Math.round(s.best.pef * 60), s.pefPctPB != null ? Math.round(s.pefPctPB) : "", s.quality] : ["", "", "", "", "", "", ""]));
    }
    out.push(row.map(csvCell).join(","));
  }
  return out.join("\n") + "\n";
}
