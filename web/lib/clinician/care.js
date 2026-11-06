// Care team dashboard data, ported from the HTML's careRows()/careFiltered()/careRecentDays(), fed by the API patients
// instead of the HTML's embedded demo cohort. Works on raw API records, as the original did.
// The original's "Latest FEV1" is generalized to the patient's device (FEV1 % predicted, glucose, SpO2).
import { addDays, eachDay } from "./model";
import { spiroAccepted } from "./review";

export const CARE_LABELS = { green: "On track", orange: "Follow up", red: "Low logging", unknown: "Insufficient data" };
export const CARE_HINTS = { red: "<50% logged", orange: "50–<85% logged", green: "≥85% logged", unknown: "Not enough reports" };
export const CARE_SORTS = [["priority", "Review priority"], ["name", "Patient name"], ["adherence", "Lowest logging first"], ["recent", "Most recent activity"]];

/** Demo workflow thresholds from the original, not clinical risk grades. */
export function careStatus(percent, coverage, activeDays) {
  return percent == null || coverage < 0.5 || activeDays < 7 ? "unknown" : percent >= 85 ? "green" : percent >= 50 ? "orange" : "red";
}
const active = l => (l.medicationAdministrations || []).length || (l.trackerResponses || []).some(t => (t.responses || []).some(q => q.value !== "" && q.value != null));
const scheduled = raw => (raw.medications || []).filter(m => !m.archived && !m.dosage?.asNeeded && m.howOften === "Daily");
const perDay = m => m.dosage?.timing?.frequency || 1;
const DEVICE = {
  fvcPlusResults: { noun: ["blow", "blows"], value: r => r.fvcPlusResults?.fev1PercentPredicted, text: v => `FEV1 ${v.toFixed(0)}% predicted` },
  glucoseResults: { noun: ["reading", "readings"], value: r => r.glucoseResults?.glucose, text: v => `${v.toFixed(0)} mg/dL` },
  oximetryResults: { noun: ["reading", "readings"], value: r => r.oximetryResults?.spo2, text: v => `SpO2 ${v.toFixed(0)}%` }
};

/** The day the dashboard counts back from: the newest day in any patient's record (the original fixed Nov 6). */
export const careAsOf = patients => patients.flatMap(p => (p.raw.dailyLogs || []).map(l => l.day)).sort().at(-1);

/** One roster row per patient. patients: [{ index, raw, condition }]; reviewed: { [id]: asOf } from the browser. */
export function careRows(patients, days, asOf, reviewed) {
  const start = addDays(asOf, 1 - days), seven = addDays(asOf, -6);
  return patients.map(({ index, raw, condition }) => {
    const logs = (raw.dailyLogs || []).filter(l => l.day >= start && l.day <= asOf), allLogs = (raw.dailyLogs || []).filter(l => l.day <= asOf);
    const activeLogs = logs.filter(active), activeDays = new Set(activeLogs.map(l => l.day)).size, meds = scheduled(raw);
    let due = 0, taken = 0;
    for (const log of activeLogs) for (const med of meds) { const n = perDay(med); due += n; taken += Math.min(n, (log.medicationAdministrations || []).filter(d => d.id === med.id).length); }
    const percent = due ? taken / due * 100 : null, coverage = activeDays / days;
    const symptoms = new Set();
    for (const log of logs) for (const t of log.trackerResponses || []) for (const q of t.responses || []) {
      try { const v = JSON.parse(q.value); if (Array.isArray(v) && v.some(s => typeof s === "string" && !/^none of these\s*$/i.test(s))) symptoms.add(log.day); } catch { /* not a checkbox answer */ }
    }
    const readings = (raw.medicalDevices || []).flatMap(d => d.baselineReadings || []).filter(r => r.date.slice(0, 10) >= start && r.date.slice(0, 10) <= asOf);
    const kind = Object.keys(DEVICE).find(k => readings.some(r => k in r)), dev = kind && DEVICE[kind];
    const latest = readings.filter(r => spiroAccepted(r) && Number.isFinite(dev?.value(r))).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const lastLog = allLogs.filter(active).map(l => l.day).sort().at(-1) || null, lastMeasurement = latest?.date.slice(0, 10) || null;
    const bits = eachDay(seven, asOf).map(day => ({ day, active: allLogs.some(l => l.day === day && active(l)) }));
    return {
      id: raw._id, index, name: `Patient ${index}`, plan: condition, source: `API · ${raw._id.slice(0, 6)}`, start, activeDays, coverage, due, taken, percent,
      status: careStatus(percent, coverage, activeDays), lastLog, bits, active7: bits.filter(b => b.active).length, symptoms: symptoms.size,
      reading: latest ? dev.text(dev.value(latest)) : null, readingValue: latest ? dev.value(latest) : null, lastMeasurement,
      readings: readings.length, rejected: readings.length - readings.filter(spiroAccepted).length, noun: dev?.noun || ["reading", "readings"],
      measurementGap: !lastMeasurement || lastMeasurement < seven, reviewed: reviewed[raw._id] === asOf
    };
  });
}

/** Search, status and "active in last 7 days" filters, then the chosen sort. inDept(row) applies the department. */
export function careFilter(rows, { search, status, active7, sort }, inDept) {
  const q = search.toLowerCase().trim(), rank = { red: 0, orange: 1, unknown: 2, green: 3 };
  return rows.filter(r => inDept(r) && (!q || `${r.name} ${r.id} ${r.plan}`.toLowerCase().includes(q)) && (status === "all" || r.status === status) && (!active7 || r.active7 > 0)).sort((a, b) => {
    if (sort === "name") return a.index - b.index;
    if (sort === "adherence") return (a.percent ?? -1) - (b.percent ?? -1);
    if (sort === "recent") return (b.lastLog || "").localeCompare(a.lastLog || "");
    return rank[a.status] - rank[b.status] || Number(a.reviewed) - Number(b.reviewed) || a.index - b.index;
  });
}

/** Last 7 days of scheduled doses logged / due, for the selected patient's detail panel. */
export function careRecentDays(raw, asOf) {
  const meds = scheduled(raw);
  return eachDay(addDays(asOf, -6), asOf).map(day => {
    const log = raw.dailyLogs?.find(l => l.day === day), on = log && active(log);
    return {
      day,
      due: on ? meds.reduce((n, m) => n + perDay(m), 0) : 0,
      taken: on ? meds.reduce((n, m) => n + Math.min(perDay(m), (log.medicationAdministrations || []).filter(d => d.id === m.id).length), 0) : 0
    };
  });
}
export const careMeds = raw => scheduled(raw).map(m => m.name);

/** Filtered roster as CSV (quoted fields, CRLF), as the original's export. */
export function careCSV(rows, days, asOf) {
  const headers = ["Patient", "Source", "Period start", "Period end", "Logged doses", "Scheduled doses on reporting days", "Logged percent", "Status", "Reporting days", "Period days", "Symptom days", "Last activity", "Latest device reading", "Reading date", "Reviewed"];
  const body = rows.map(r => [r.name, r.source + " (synthetic)", r.start, asOf, r.taken, r.due, r.percent == null ? "" : r.percent.toFixed(1), CARE_LABELS[r.status], r.activeDays, days, r.symptoms, r.lastLog || "", r.reading ?? "", r.lastMeasurement || "", r.reviewed ? "Yes" : "No"]);
  return [headers, ...body].map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(",")).join("\r\n");
}
