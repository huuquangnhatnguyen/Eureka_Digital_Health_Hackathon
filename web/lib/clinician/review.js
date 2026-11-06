// shortcut: ported near-verbatim (untyped JS) from the HTML's card-based "At a glance" (secGlance override, baselineWidget, reviewPlot).
// Builds plain card objects; app/clinician/Review.tsx draws them. The original was asthma/spirometry-only; here every
// condition gets the same cards, and the device card follows the patient's device (spirometer, glucose meter, pulse oximeter).
import { addDays, eachDay, fmtDay, fmtRange, mean, median, plural, splitCamel, tally } from "./model";
import { classify, rangeFor } from "./ranges";

/* ---------------- raw spirometer readings (also used by the Devices tab) ---------------- */
export function spiroAccepted(r) { return r.accepted === true && (!r.qualityReport?.quality || r.qualityReport.quality === "Acceptable"); }
export function spiroStamp(r) { return r.date.slice(0, 10) + " · " + r.date.slice(11, 16) + " UTC"; }
/** Blows on the same UTC date with gaps of 30 minutes or less form one session. */
export function spiroSessions(readings) {
  const groups = [];
  for (const r of [...readings].sort((a, b) => a.date.localeCompare(b.date))) {
    let g = groups.at(-1);
    if (!g || r.date.slice(0, 10) !== g.date.slice(0, 10) || Date.parse(r.date) - Date.parse(g.blows.at(-1).date) > 30 * 60 * 1000) { g = { date: r.date, blows: [] }; groups.push(g); }
    g.blows.push(r);
  }
  return groups.map(g => {
    const usable = g.blows.filter(spiroAccepted), f = {};
    for (const key of ["fev1", "fvc"]) {
      const best = usable.filter(r => Number.isFinite(r.fvcPlusResults?.[key]) && r.fvcPlusResults[key] > 0).sort((a, b) => b.fvcPlusResults[key] - a.fvcPlusResults[key])[0];
      if (best) { f[key] = best.fvcPlusResults[key]; f[key + "PercentPredicted"] = best.fvcPlusResults[key + "PercentPredicted"]; }
    }
    f.fev1FvcPercent = Number.isFinite(f.fev1) && f.fvc > 0 ? f.fev1 / f.fvc * 100 : null;
    return { ...g, accepted: usable.length > 0, nAccepted: usable.length, fvcPlusResults: f };
  });
}

/* ---------------- device fields ----------------
   Spirometry fields (and their mapping confidence) are from the original; glucose and oximetry were added so every
   paired device gets cards. Confidence refers to the supplied field mapping, not measurement quality. */
const RESULTS = { spirometry: "fvcPlusResults", glucose: "glucoseResults", oximetry: "oximetryResults" };
const kindOf = r => Object.keys(RESULTS).find(k => RESULTS[k] in r);
export const baselineFields = {
  fev1Volume: { kind: "spirometry", field: "fev1", label: "FEV1 volume", unit: "L", confidence: 98, group: "Measured values", basis: "fev1" },
  fvcVolume: { kind: "spirometry", field: "fvc", label: "FVC volume", unit: "L", confidence: 99, group: "Measured values", basis: "fvc" },
  pef: { kind: "spirometry", field: "pef", label: "Peak flow (PEF)", unit: "L/s", confidence: 97, group: "Measured values", basis: "pef" },
  ratio: { kind: "spirometry", field: "fev1FvcPercent", label: "FEV1/FVC · recorded ratio", unit: "%", pct: true, confidence: 98, group: "Measured values", basis: null },
  fev1Percent: { kind: "spirometry", field: "fev1PercentPredicted", label: "FEV1 · % predicted", unit: "%", pct: true, confidence: 97, group: "Percent predicted", basis: "fev1" },
  fvc: { kind: "spirometry", field: "fvcPercentPredicted", label: "FVC · % predicted", unit: "%", pct: true, confidence: 97, group: "Percent predicted", basis: "fvc" },
  pefPercent: { kind: "spirometry", field: "pefPercentPredicted", label: "PEF · % predicted", unit: "%", pct: true, confidence: 97, group: "Percent predicted", basis: "pef" },
  fev1Predicted: { kind: "spirometry", field: "fev1Predicted", label: "Predicted FEV1", unit: "L", confidence: 97, group: "Predicted values", predicted: true },
  fvcPredicted: { kind: "spirometry", field: "fvcPredicted", label: "Predicted FVC", unit: "L", confidence: 97, group: "Predicted values", predicted: true },
  pefPredicted: { kind: "spirometry", field: "pefPredicted", label: "Predicted PEF", unit: "L/s", confidence: 97, group: "Predicted values", predicted: true },
  glucose: { kind: "glucose", field: "glucose", label: "Blood glucose", unit: "mg/dL", dp: 0, group: "Measured values", median: true },
  spo2: { kind: "oximetry", field: "spo2", label: "Oxygen saturation (SpO2)", unit: "%", pct: true, dp: 0, group: "Measured values" },
  pulse: { kind: "oximetry", field: "pulse", label: "Pulse rate", unit: "bpm", dp: 0, group: "Measured values" },
  perfusionIndex: { kind: "oximetry", field: "perfusionIndex", label: "Perfusion index", unit: "%", dp: 1, group: "Measured values" },
  accepted: { kind: "*", field: "accepted", label: "Readings kept by the app", unit: "", confidence: 90, group: "App acceptance" }
};
const BASELINE_GROUPS = ["Measured values", "Percent predicted", "Predicted values", "App acceptance"];
/** The device card every patient with that device sees, and its title. */
const FIXED = { spirometry: ["fev1Percent", "Lung function · FEV1"], glucose: ["glucose", "Blood glucose"], oximetry: ["spo2", "Oxygen saturation · SpO2"] };
const NOUN = { spirometry: ["blow", "blows"], glucose: ["reading", "readings"], oximetry: ["reading", "readings"] };
/** Cards a patient starts with, in order; "device" is this patient's main device reading (FIXED). */
export const DEFAULT_CARDS = ["symptomDays", "doses", "device"];
/** Slots on the overview: 3 × 2 fits one screen on a laptop. */
export const MAX_CARDS = 6;
const DEFAULTS = { symptomDays: "Days with symptoms", doses: "Scheduled doses logged" };
const SUMMARY = { symptoms: "Symptom breakdown", feeling: "Latest reported feeling", rescue: "As-needed medication use", quality: "Reading quality", coverage: "Reporting coverage" };
/** Every card id the overview knows; the save API accepts only these. */
export const CARD_IDS = new Set([...DEFAULT_CARDS, ...Object.keys(SUMMARY), ...Object.keys(baselineFields)]);

/** Card labels for this patient's device (the same id reads "blows" on a spirometer, "readings" elsewhere). */
function labelOf(id, kind) {
  if (id === "accepted") return kind === "spirometry" ? "Blows kept by the app" : "Readings kept by the app";
  if (id === "quality") return kind === "spirometry" ? "Spirometry quality" : "Reading quality";
  if (id === "device") return FIXED[kind]?.[1];
  return DEFAULTS[id] || SUMMARY[id] || baselineFields[id]?.label;
}

/* ---------------- chart intervals ---------------- */
/** Chart intervals: daily up to 2 weeks, weekly up to 13 weeks, else about 12 equal buckets. */
export function reviewBins(r) {
  const size = r.n <= 14 ? 1 : r.n <= 91 ? 7 : Math.ceil(r.n / 12), list = [];
  for (let start = r.start; start <= r.end; start = addDays(start, size)) {
    const end = addDays(start, size - 1) > r.end ? r.end : addDays(start, size - 1);
    list.push({ start, end, keys: eachDay(start, end), label: fmtRange(start, end) });
  }
  return { list, size };
}

/** Sessions of one device kind in the range: spirometer blows grouped by session, other devices one reading each. */
function baselineGroupsOf(raw, A, kind) {
  return (raw.medicalDevices || []).flatMap((device, index) => {
    const rs = (device.baselineReadings || []).filter(r => kindOf(r) === kind && r.date.slice(0, 10) >= A.r.start && r.date.slice(0, 10) <= A.r.end);
    const sessions = kind === "spirometry" ? spiroSessions(rs) : [...rs].sort((a, b) => a.date.localeCompare(b.date)).map(r => ({ date: r.date, blows: [r] }));
    return sessions.map(s => ({ ...s, device: device.name || `Device ${index + 1}`, deviceId: device.serialNumber || String(index) }));
  }).sort((a, b) => a.date.localeCompare(b.date) || a.deviceId.localeCompare(b.deviceId));
}
function baselineObservations(groups, d) {
  const res = r => r[RESULTS[d.kind]];
  return groups.map(session => {
    const candidates = session.blows.filter(r => (d.predicted || spiroAccepted(r)) && (d.basis ? (Number.isFinite(res(r)?.[d.basis]) && res(r)[d.basis] > 0) : Number.isFinite(res(r)?.[d.field])));
    const reading = d.basis ? candidates.reduce((best, r) => !best || res(r)[d.basis] > res(best)[d.basis] ? r : best, null) : candidates.at(-1);
    return { date: session.date, key: session.date.slice(0, 10), device: session.device, deviceId: session.deviceId, reading, rawValue: Number.isFinite(res(reading ?? {})?.[d.field]) ? res(reading)[d.field] : null };
  });
}
/** A device-field card from the raw baseline readings. kind = the device the card reads. */
function baselineCard(id, raw, A, bins, kind, saved) {
  const d = { ...baselineFields[id], kind }, groups = baselineGroupsOf(raw, A, kind), readings = groups.flatMap(s => s.blows), [one, many] = NOUN[kind];
  const source = { confidence: d.confidence, code: `medicalDevices[].baselineReadings[].${id === "accepted" ? "accepted" : RESULTS[kind] + "." + d.field}` };
  if (id === "accepted") {
    const yes = readings.filter(r => r.accepted === true).length, no = readings.filter(r => r.accepted === false).length, unknown = readings.length - yes - no;
    const points = bins.list.map(b => {
      const rows = readings.filter(r => r.date.slice(0, 10) >= b.start && r.date.slice(0, 10) <= b.end), kept = rows.filter(r => r.accepted === true).length, known = rows.filter(r => typeof r.accepted === "boolean").length;
      return { ...b, v: known ? kept / known * 100 : null, detail: rows.length ? `${kept} true · ${known - kept} false · ${rows.length - known} unknown` : `No ${many}` };
    });
    return {
      title: labelOf(id, kind), value: readings.length ? `${yes} of ${readings.length} ${many}` : `No ${many}`, context: "App accepted flag = true",
      lists: [{ items: [["Not kept (false)", no], ["Not recorded", unknown]] }],
      plot: { points, max: 100, unit: "%", label: `${cap(many)} kept by app (%)` }, source, foot: "This flag is not a quality grade. Percentages exclude unknown flags."
    };
  }
  const dp = d.dp ?? (d.pct ? 1 : 2), observations = baselineObservations(groups, d), valid = observations.filter(o => o.rawValue != null), latest = valid.at(-1);
  const fmt = v => `${v.toFixed(dp)} ${d.unit}`, lim = v => d.pct ? `${v}%` : `${v} ${d.unit}`;
  const range = rangeFor(id, saved), vsAll = valid.map(o => o.rawValue);
  const countOf = (vs, s) => vs.filter(v => classify(range, v) === s).length;
  const points = bins.list.map(b => {
    const obs = observations.filter(o => o.key >= b.start && o.key <= b.end), usable = obs.filter(o => o.rawValue != null), last = usable.at(-1);
    const vs = usable.map(o => o.rawValue), v = d.median ? median(vs) : last?.rawValue ?? null;
    // the point can hide out-of-range readings in its interval, so the values table counts them
    const flags = { status: v == null ? null : classify(range, v), flag: [countOf(vs, "low") && `${countOf(vs, "low")} below ${lim(range.lo)}`, countOf(vs, "high") && `${countOf(vs, "high")} above ${lim(range.hi)}`].filter(Boolean).join(" · ") };
    if (d.median) {
      // several readings a day: one reading can't stand for the interval, so chart the median
      return { ...b, v, ...flags, detail: vs.length ? `median ${fmt(v)} of ${plural(vs.length, one, many)} (${fmt(Math.min(...vs))} – ${fmt(Math.max(...vs))})` : "No usable value" };
    }
    return { ...b, v, ...flags, detail: last ? `${fmt(last.rawValue)} · ${spiroStamp(last.reading)} · ${last.device} · latest of ${usable.length} ${kind === "spirometry" ? "sessions" : many} with a value${obs.at(-1) !== last ? `; later ${kind === "spirometry" ? "session" : one} has no usable value` : ""}` : "No usable value" };
  });
  const lastRaw = readings.slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const max = Math.max(d.pct ? 120 : 1, Math.ceil(Math.max(0, ...vsAll) / (d.pct ? 20 : 1)) * (d.pct ? 20 : 1));
  const color = d.field.startsWith("fvc") || d.field === "pulse" ? "#287C82" : "#BE3268";
  const latestLabel = latest ? `${d.median ? "Latest reading · " : ""}${spiroStamp(latest.reading)} · ${latest.device}` : readings.length ? "No usable value in selected dates" : "No device readings in selected dates";
  const missing = latest && ((observations.at(-1)?.rawValue == null) || d.predicted && !Number.isFinite(lastRaw?.[RESULTS[kind]]?.[d.field]));
  const status = latest && classify(range, latest.rawValue), noun = kind === "spirometry" ? ["session", "sessions"] : [one, many];
  const card = {
    title: labelOf(id, kind), value: latest ? fmt(latest.rawValue) : "No data", context: latestLabel + (missing ? " · Newer readings lack a usable value" : ""),
    flag: status === "low" ? "Below normal" : status === "high" ? "Above normal" : "",
    plot: { points, max, unit: d.pct ? "%" : "", decimals: d.pct ? 0 : dp, line: true, color, label: `${d.label} (${d.unit})`, range },
    average: vsAll.length ? { value: fmt(mean(vsAll)), sub: `Mean of ${plural(vsAll.length, ...noun)} in the selected dates` } : null,
    source
  };
  if (range) {
    const normal = range.lo != null && range.hi != null ? `${range.lo}–${lim(range.hi)}` : range.lo != null ? `${lim(range.lo)} or above` : `${lim(range.hi)} or below`;
    if (card.average) card.average.sub += ` · ${Math.round((vsAll.length - countOf(vsAll, "low") - countOf(vsAll, "high")) / vsAll.length * 100)}% in range`;
    card.range = { key: id, unit: d.pct ? "%" : d.unit, value: range, custom: !!saved?.[id], text: normal };
    card.lists = [{ items: [
      ...(range.lo != null ? [[`Below ${lim(range.lo)}`, countOf(vsAll, "low")]] : []),
      [normal, vsAll.length - countOf(vsAll, "low") - countOf(vsAll, "high")],
      ...(range.hi != null ? [[`Above ${lim(range.hi)}`, countOf(vsAll, "high")]] : [])
    ] }];
  }
  return card;
}
const cap = s => s[0].toUpperCase() + s.slice(1);

/** Days each symptom was ticked (the original read analyzeRespiratory's symFreq, which only asthma has). */
function symptomTally(model, T) {
  const q = (model.roles.get(T.t.id) || {}).symptoms;
  return q ? tally(T.rows.filter(x => x.m).flatMap(x => x.m[q.id] || [])) : [];
}

/** Cards for the trackers in focus, for any condition. raw = the API patient record; selected = card ids the clinician added
    (ids that don't apply to this patient's device are skipped, so one saved list works across patients).
    Cards follow the order of `selected`; every card carries the id it came from.
    Returns null when no tracker is in focus.
    @returns {any} */
export function buildReview(model, raw, A, focus, selected, ranges = raw.overviewRanges) {
  const CUR = model.visit.slice(0, 4), fmtD = k => fmtDay(k, { year: k.slice(0, 4) !== CUR });
  const trackers = A.trackers.filter(T => focus.includes(T.t));
  if (!trackers.length) return null;
  const kinds = [...new Set((raw.medicalDevices || []).flatMap(d => (d.baselineReadings || []).map(kindOf)).filter(Boolean))];
  const kind = kinds[0]; // one home device per patient in this data
  const bins = reviewBins(A.r), bucket = bins.size === 1 ? "Daily" : bins.size === 7 ? "Weekly" : `${bins.size}-day`, cards = [];
  const ticks = [...new Set([0, Math.floor((bins.list.length - 1) / 2), bins.list.length - 1])].map(i => [i, fmtD(bins.list[i].start)]);

  const ids = new Set(trackers.map(T => T.t.id)), meds = A.lines.filter(X => X.kind === "daily" && ids.has(X.L.trackerId));
  const asthma = trackers.some(T => T.t.category === "respiratory"); // "controller" is asthma wording
  const taken = meds.reduce((s, X) => s + X.takenActive, 0), due = meds.reduce((s, X) => s + X.dueActive, 0);
  const medpoints = bins.list.map(b => {
    let t = 0, d = 0;
    for (const X of meds) for (const day of X.perDay.filter(day => day.act && day.k >= b.start && day.k <= b.end)) { t += day.filled.filter(Boolean).length; d += X.L.schedule.perDay; }
    return { ...b, v: d ? t / d * 100 : null, detail: d ? `${t} of ${d} scheduled doses logged (${Math.round(t / d * 100)}%)` : "No scheduled doses on days with entries" };
  });
  // Picker: summary cards, then this device's fields by group.
  const applies = id => id in DEFAULTS || (id === "device" ? !!kind : id in SUMMARY ? (id !== "quality" || !!kind) : !!kind && (baselineFields[id]?.kind === kind || baselineFields[id]?.kind === "*"));
  const choice = id => { const f = baselineFields[id]; return [id, labelOf(id, kind), f?.unit && !f.pct && !f.label.includes("%") ? ` (${f.unit})` : ""]; };
  const picker = {
    fixed: kind && selected.includes("device") ? FIXED[kind][0] : null, // already on screen as the device card
    summary: [...DEFAULT_CARDS, ...Object.keys(SUMMARY)].filter(applies).map(choice),
    groups: BASELINE_GROUPS.map(g => [g, Object.keys(baselineFields).filter(id => applies(id) && baselineFields[id].group === g).map(choice)]).filter(([, l]) => l.length),
    note: kind === "spirometry" ? "Device fields below use mappings rated ≥90%." : kind ? "Device fields below read the paired device's readings." : ""
  };

  const sessions = A.spiro?.inR || [];
  for (const id of selected) {
    if (!applies(id) || id === picker.fixed) continue;
    if (id === "symptomDays") {
      for (const T of trackers) {
        const R = model.roles.get(T.t.id) || {};
        if (!R.symptoms) continue;
        const days = T.rows.filter(r => r.m && Array.isArray(r.m[R.symptoms.id]));
        const symptomatic = days.filter(r => r.m[R.symptoms.id].length);
        const points = bins.list.map(b => {
          const ds = days.filter(r => r.k >= b.start && r.k <= b.end), count = ds.filter(r => r.m[R.symptoms.id].length).length;
          return { ...b, v: ds.length ? count : null, detail: ds.length ? `${count} days with symptoms / ${ds.length} days answered (${b.keys.length - ds.length} days without an answer)` : "No symptom answers" };
        });
        cards.push({ id, title: "Days with symptoms", value: days.length ? `${symptomatic.length} of ${days.length} days` : "No answers", context: `${T.t.name} · Days with a symptom answer`, plot: { points, max: bins.size, label: "Days with symptoms" }, foot: `${bucket} symptom-day counts. — means no answers; missing days are not symptom-free days.` });
      }
      continue;
    }
    if (id === "doses") { cards.push({ id, title: asthma ? "Controller doses logged" : "Scheduled doses logged", value: due ? `${Math.round(taken / due * 100)}%` : "No data", context: `${taken} of ${due} scheduled doses · Patient-reported`, plot: { points: medpoints, max: 100, unit: "%", color: "#287C82", label: "Scheduled doses logged" }, foot: `${meds.map(X => X.L.name).join(", ") || "No scheduled medication recorded"}. ${bucket} percentages count only days with app entries.` }); continue; }
    if (id === "device") { cards.push({ ...baselineCard(FIXED[kind][0], raw, A, bins, kind, ranges), title: FIXED[kind][1], id }); continue; }
    if (baselineFields[id]) { cards.push({ ...baselineCard(id, raw, A, bins, kind, ranges), id }); continue; }
    const card = { id, title: labelOf(id, kind), value: "", context: "", foot: "" };
    if (id === "symptoms") Object.assign(card, {
      context: "Number of days each symptom was reported", foot: "A day may include more than one symptom.",
      lists: trackers.map(T => ({ heading: T.t.name, items: symptomTally(model, T).map(([name, n]) => [name, `${n} days`]), empty: "No symptoms reported in selected dates." }))
    });
    if (id === "feeling") Object.assign(card, {
      context: "Most recent response in selected dates", foot: "Patient-reported feeling, separate from symptom burden.",
      facts: trackers.map(T => {
        const q = (model.roles.get(T.t.id) || {}).feeling, last = q ? T.rows.filter(r => r.m && r.m[q.id] != null).at(-1) : null;
        return { label: T.t.name, value: last ? String(last.m[q.id]) : "No data", sub: last ? fmtD(last.k) : "" };
      })
    });
    if (id === "rescue") Object.assign(card, {
      context: "Patient-reported use in selected dates",
      lists: [{ items: A.lines.filter(X => X.kind === "prn" && ids.has(X.L.trackerId)).map(X => [X.L.name, `${X.days} days · ${X.uses} uses`]), empty: "No as-needed medication recorded." }]
    });
    if (id === "quality" && kind === "spirometry") Object.assign(card, {
      value: `${sessions.filter(s => s.quality !== "poor").length} / ${sessions.length} sessions`, context: "Had at least one accepted blow", foot: "Accepted blows do not constitute a full session quality grade.",
      lists: [{ items: [["No accepted blow", sessions.filter(s => s.quality === "poor").length], ["One accepted blow", sessions.filter(s => s.nUsable === 1).length]] }]
    });
    if (id === "quality" && kind !== "spirometry") {
      const rs = baselineGroupsOf(raw, A, kind).flatMap(s => s.blows), ok = rs.filter(spiroAccepted);
      const issues = tally(rs.filter(r => !spiroAccepted(r)).flatMap(r => (r.qualityReport?.qualityIndications || []).map(i => i.message)).filter(Boolean));
      Object.assign(card, {
        value: `${ok.length} / ${rs.length} readings`, context: "Accepted by the device", foot: "Device quality flags, not a clinical grade.",
        lists: [{ items: [["Not accepted", rs.length - ok.length], ...issues.map(([m, n]) => [splitCamel(m), n])] }]
      });
    }
    if (id === "coverage") {
      const ds = new Set(trackers.flatMap(T => T.rows.filter(r => r.m).map(r => r.k)));
      Object.assign(card, { value: `${ds.size} / ${A.r.n} days`, context: "Days with tracker answers", meter: { n: ds.size, of: A.r.n }, foot: `${A.r.n - ds.size} days without tracker answers.` });
    }
    cards.push(card);
  }
  return { cards, ticks, picker, subtitle: `${fmtRange(A.r.start, A.r.end)} · ${bucket.toLowerCase()} chart intervals` };
}
