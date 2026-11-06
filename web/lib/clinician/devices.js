// Devices tab data, ported from the HTML's spiroReadings()/deviceWorkspace override and generalized: each paired device
// gets latest-value cards, a trend, and a per-reading table. Spirometry keeps the original's layout and wording;
// glucose meters and pulse oximeters follow the same shape. raw = the API patient record.
import { median, splitCamel } from "./model";
import { spiroAccepted, spiroSessions, spiroStamp } from "./review";

const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const yesNo = v => (v == null ? "—" : v ? "Yes" : "No");
const delta = (v, prev, unit, d = 2, what = "previous usable session") =>
  Number.isFinite(v) && Number.isFinite(prev) ? `${v - prev > 0 ? "+" : ""}${(v - prev).toFixed(d)} ${unit === "%" ? "percentage points" : unit} vs ${what}` : `No ${what} to compare`;
/** Quality messages; the original read qualityMessage, this data names the field message. */
const messages = r => (r.qualityReport?.qualityIndications || []).map(i => [i.qualityMessage ?? i.message, i.instructions].filter(Boolean).map(splitCamel).join(": ")).join("; ");
const qualityDetails = r => [`Device quality: ${r.qualityReport?.quality || "Not supplied"} · Accepted flag: ${yesNo(r.accepted)}`];
const row = (r, cells, details) => ({ key: r.date, date: r.date.slice(0, 10), time: r.date.slice(11, 19) + " UTC", cells, ok: spiroAccepted(r), messages: messages(r), details: [...qualityDetails(r), ...details] });
/** Per-UTC-day value of each series, from accepted readings. agg: "max" (spirometry, as the original), "min" or "median". */
function daily(readings, res, keys, agg) {
  const days = new Map();
  for (const r of readings) {
    const day = r.date.slice(0, 10);
    if (!days.has(day)) days.set(day, { day, vals: Object.fromEntries(keys.map(k => [k, []])) });
    if (!spiroAccepted(r)) continue;
    for (const k of keys) if (Number.isFinite(r[res]?.[k])) days.get(day).vals[k].push(r[res][k]);
  }
  return [...days.values()].map(({ day, vals }) => ({ day, ...Object.fromEntries(keys.map(k => [k, vals[k].length ? (agg === "max" ? Math.max(...vals[k]) : agg === "min" ? Math.min(...vals[k]) : median(vals[k])) : null])) }));
}

function spirometry(d, readings) {
  const accepted = readings.filter(spiroAccepted), sessions = spiroSessions(readings), usable = sessions.filter(s => s.accepted), latest = usable.at(-1), prior = usable.at(-2), f = latest?.fvcPlusResults || {};
  const cell = (r, key) => ({ main: num(r.fvcPlusResults?.[key]), sub: `${num(r.fvcPlusResults?.[key + "PercentPredicted"], 0)}% predicted` });
  return {
    subtitle: "Spirometry", counts: `${sessions.length} sessions · ${accepted.length}/${readings.length} blows accepted`, noun: "blows",
    latestHeading: "Latest usable session",
    latestText: (latest ? spiroStamp(latest) : "No usable session in selected dates.") + (prior ? " · Compared with " + spiroStamp(prior) : "") + (latest && sessions.at(-1) !== latest ? " · More recent readings need quality review." : ""),
    cards: [["fev1", "FEV1", "L"], ["fvc", "FVC", "L"], ["fev1FvcPercent", "FEV1 / FVC", "%"]].map(([key, label, unit]) => ({
      label, value: num(f[key], key === "fev1FvcPercent" ? 1 : 2), unit,
      subs: [key !== "fev1FvcPercent" ? `${num(f[key + "PercentPredicted"], 0)}% predicted` : "Ratio of session maximum volumes", delta(f[key], prior?.fvcPlusResults?.[key], unit)]
    })),
    trend: {
      title: "Lung function over time", zero: true, decimals: 2,
      // on: plotted by default; the rest can be added from the chart's Measures picker
      series: [
        { key: "fev1", label: "FEV1", unit: "L", color: "#BE3268", dash: "", on: true }, { key: "fvc", label: "FVC", unit: "L", color: "#287C82", dash: "6 4", on: true },
        { key: "fev6", label: "FEV6", unit: "L", color: "#6B4FA0", dash: "2 3" }, { key: "pef", label: "Peak flow", unit: "L/s", color: "#B86E00", dash: "10 4" },
        { key: "fef2575", label: "FEF25–75", unit: "L/s", color: "#2463AD", dash: "8 3 2 3" },
        { key: "fev1Predicted", label: "Predicted FEV1", unit: "L", color: "#BE3268", dash: "1 4" }, { key: "fvcPredicted", label: "Predicted FVC", unit: "L", color: "#287C82", dash: "1 4" }
      ],
      points: daily(readings, "fvcPlusResults", ["fev1", "fvc", "fev6", "pef", "fef2575", "fev1Predicted", "fvcPredicted"], "max"),
      caption: "Daily maximum of each measure from accepted blows; measures may come from different blows. Recorded days without accepted values break the line."
    },
    note: "Sessions group blows on the same UTC date, separated by no more than 30 minutes. Values use each measure’s largest accepted volume; they may come from different blows.",
    caption: "One row per blow. Volumes in liters; % predicted shown below each volume. Rejected readings are retained for review.",
    columns: [["FEV1 (L)", true], ["FVC (L)", true], ["FEV1/FVC", true]],
    rows: [...readings].reverse().map(r => row(r, [cell(r, "fev1"), cell(r, "fvc"), { main: `${num(r.fvcPlusResults?.fev1FvcPercent, 1)}%` }],
      [["pef", "Peak flow", "L/s"], ["fev6", "FEV6", "L"], ["fef2575", "FEF25–75", "L/s"], ["fev1Predicted", "Predicted FEV1", "L"], ["fvcPredicted", "Predicted FVC", "L"], ["pefPredicted", "Predicted peak flow", "L/s"], ["pefPercentPredicted", "Peak flow predicted", "%"]]
        .map(([key, label, unit]) => `${label}: ${num(r.fvcPlusResults?.[key])} ${unit}`)))
  };
}

function glucoseDaily(readings) {
  const [md, lo, hi] = ["median", "min", "max"].map(agg => daily(readings, "glucoseResults", ["glucose"], agg));
  return md.map((p, i) => ({ ...p, glucoseMin: lo[i].glucose, glucoseMax: hi[i].glucose }));
}

function glucose(d, readings) {
  const ok = readings.filter(r => spiroAccepted(r) && Number.isFinite(r.glucoseResults?.glucose)), vs = ok.map(r => r.glucoseResults.glucose);
  const latest = ok.at(-1), prior = ok.at(-2), g = r => r?.glucoseResults?.glucose;
  const inRange = vs.filter(v => v >= 70 && v <= 180).length;
  return {
    subtitle: "Blood glucose", counts: `${readings.length} readings · ${ok.length}/${readings.length} accepted`, noun: "readings",
    latestHeading: "Latest accepted reading",
    latestText: latest ? `${spiroStamp(latest)} · ${splitCamel(latest.glucoseResults.mealContext)}` + (readings.at(-1) !== latest ? " · More recent readings need quality review." : "") : "No accepted reading in selected dates.",
    cards: [
      { label: "Latest glucose", value: num(g(latest), 0), unit: "mg/dL", subs: [latest ? splitCamel(latest.glucoseResults.mealContext) : "—", delta(g(latest), g(prior), "mg/dL", 0, "previous reading")] },
      { label: "Median", value: num(median(vs), 0), unit: "mg/dL", subs: [`of ${vs.length} accepted readings in selected dates`] },
      // 70–180 mg/dL is the usual target range for type 1 diabetes (ADA)
      { label: "In target range", value: vs.length ? num(inRange / vs.length * 100, 0) : "—", unit: "%", subs: ["70–180 mg/dL", `${vs.filter(v => v < 70).length} below · ${vs.filter(v => v > 180).length} above`] }
    ],
    trend: {
      title: "Blood glucose over time", zero: true, decimals: 0,
      series: [
        { key: "glucose", label: "Daily median", unit: "mg/dL", color: "#BE3268", dash: "", on: true },
        { key: "glucoseMin", label: "Daily lowest", unit: "mg/dL", color: "#2463AD", dash: "6 4" }, { key: "glucoseMax", label: "Daily highest", unit: "mg/dL", color: "#B86E00", dash: "2 3" }
      ],
      points: glucoseDaily(readings),
      caption: "Daily median, lowest and highest of accepted readings. Strip errors are left out of the line and kept in the table below."
    },
    note: "Each reading is one finger-stick test; several a day are normal.",
    caption: "One row per reading. Strip errors and rejected readings are retained for review.",
    columns: [["Glucose (mg/dL)", true], ["Meal context", false]],
    rows: [...readings].reverse().map(r => row(r, [{ main: num(g(r), 0) }, { main: splitCamel(r.glucoseResults?.mealContext) || "—" }], [`Unit: ${r.glucoseResults?.unit || "—"}`]))
  };
}

function oximetry(d, readings) {
  const ok = readings.filter(r => spiroAccepted(r) && Number.isFinite(r.oximetryResults?.spo2)), latest = ok.at(-1), prior = ok.at(-2), o = (r, k) => r?.oximetryResults?.[k];
  return {
    subtitle: "Pulse oximetry", counts: `${readings.length} readings · ${ok.length}/${readings.length} accepted`, noun: "readings",
    latestHeading: "Latest accepted reading",
    latestText: latest ? spiroStamp(latest) + (prior ? " · Compared with " + spiroStamp(prior) : "") + (readings.at(-1) !== latest ? " · More recent readings need quality review." : "") : "No accepted reading in selected dates.",
    cards: [["spo2", "SpO2", "%", 0], ["pulse", "Pulse", "bpm", 0], ["perfusionIndex", "Perfusion index", "%", 1]].map(([key, label, unit, dp]) => ({
      label, value: num(o(latest, key), dp), unit, subs: [delta(o(latest, key), o(prior, key), unit, dp, "previous reading")]
    })),
    trend: {
      title: "Pulse oximetry over time", zero: false, decimals: 0,
      series: [
        { key: "spo2", label: "SpO2", unit: "%", color: "#BE3268", dash: "", on: true }, { key: "pulse", label: "Pulse", unit: "bpm", color: "#287C82", dash: "6 4" },
        { key: "perfusionIndex", label: "Perfusion index", unit: "%", color: "#6B4FA0", dash: "2 3", decimals: 1 }
      ],
      points: daily(readings, "oximetryResults", ["spo2", "pulse", "perfusionIndex"], "median"),
      caption: "Accepted readings; on days with more than one, the median. Rejected readings break the line."
    },
    note: "",
    caption: "One row per reading. Rejected readings are retained for review.",
    columns: [["SpO2 (%)", true], ["Pulse (bpm)", true], ["Perfusion index (%)", true]],
    rows: [...readings].reverse().map(r => row(r, [{ main: num(o(r, "spo2"), 0) }, { main: num(o(r, "pulse"), 0) }, { main: num(o(r, "perfusionIndex"), 1) }], []))
  };
}

const KIND = { fvcPlusResults: spirometry, glucoseResults: glucose, oximetryResults: oximetry };
const LABEL = { fev1: "FEV1 (L)", fvc: "FVC (L)", pef: "Peak flow (L/s)", glucose: "Glucose (mg/dL)", spo2: "SpO2 (%)", pulse: "Pulse (bpm)" };

/** @returns {any} */
export function devicesData(raw, A) {
  const inRange = iso => iso.slice(0, 10) >= A.r.start && iso.slice(0, 10) <= A.r.end;
  const devices = (raw.medicalDevices || []).map(d => {
    const readings = (d.baselineReadings || []).filter(r => inRange(r.date)).sort((a, b) => a.date.localeCompare(b.date));
    const kind = Object.keys(KIND).find(k => (d.baselineReadings || []).some(r => k in r));
    return { name: d.name || "Medical device", serial: d.serialNumber || "—", n: readings.length, range: readings.length ? `${readings[0].date.slice(0, 10)} to ${readings.at(-1).date.slice(0, 10)}` : "No readings", ...(kind ? KIND[kind](d, readings) : { subtitle: "Device", counts: `${readings.length} readings`, rows: [] }) };
  });
  // Device answers inside check-ins ({"fev1":…} / {"glucose":…} / {"spo2":…}) are kept apart from the paired-device readings.
  const answers = (raw.dailyLogs || []).filter(l => l.day >= A.r.start && l.day <= A.r.end).flatMap(l => (l.trackerResponses || []).flatMap(t => (t.responses || []).flatMap(q => {
    try { const v = JSON.parse(q.value); return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).some(k => k in LABEL) ? [[t.date, v]] : []; } catch { return []; }
  }))).reverse();
  const keys = [...new Set(answers.flatMap(([, v]) => Object.keys(v).filter(k => k in LABEL)))];
  return {
    devices,
    subtitle: [...new Set(devices.map(d => d.subtitle))].join(" · "),
    questionnaire: { columns: ["Date / time (UTC)", ...keys.map(k => LABEL[k]), "Accepted"], rows: answers.map(([date, v]) => [date, ...keys.map(k => v[k]), v.accepted]) }
  };
}
