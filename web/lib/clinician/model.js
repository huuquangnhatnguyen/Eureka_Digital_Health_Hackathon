// shortcut: ported near-verbatim from .context/SMART@Home Clinician View.html, so plain untyped JS (callers get `any`); convert to TS if it grows.
// Raw patient doc (see adapt.ts) -> clean model -> per-date-range analysis. Pure functions, no DOM.

const TZ = "America/New_York";
const DAY_MS = 86400000;
const k2d = k => new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)));
const d2k = d => d.toISOString().slice(0, 10);
const addDays = (k, n) => d2k(new Date(k2d(k).getTime() + n * DAY_MS));
const diffDays = (a, b) => Math.round((k2d(b) - k2d(a)) / DAY_MS);
const dowOf = k => k2d(k).getUTCDay();
function eachDay(a, b) { const out = []; for (let k = a; k <= b; k = addDays(k, 1)) out.push(k); return out; }
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const TZ_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit"
});
const LOCAL_CACHE = new Map();
/** UTC ISO timestamp -> Eastern wall-clock date key and minutes after midnight. */
function toLocal(iso) {
  let v = LOCAL_CACHE.get(iso);
  if (v) return v;
  const p = {};
  for (const x of TZ_FMT.formatToParts(new Date(iso))) p[x.type] = x.value;
  const h = (+p.hour) % 24, m = +p.minute;
  v = { key: `${p.year}-${p.month}-${p.day}`, h, m, mins: h * 60 + m };
  LOCAL_CACHE.set(iso, v);
  return v;
}
/** Eastern wall-clock time -> UTC ISO timestamp (handles daylight saving time). */
function localISO(k, h, m, s = 0) {
  const base = Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), h, m, s);
  for (const off of [4, 5]) {
    const iso = new Date(base + off * 3600000).toISOString();
    const l = toLocal(iso);
    if (l.key === k && l.h === h && l.m === m) return iso;
  }
  return new Date(base + 5 * 3600000).toISOString();
}

const DAY_ENDS_AT = 180; // 3:00 AM. Anything earlier counts for the evening before.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const norm = s => String(s ?? "").trim().toLowerCase();
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function tally(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}
function dayOf(iso) {
  const l = toLocal(iso);
  if (l.mins < DAY_ENDS_AT) return { key: addDays(l.key, -1), mins: l.mins + 1440, afterMidnight: true };
  return { key: l.key, mins: l.mins, afterMidnight: false };
}

/* ---------------- formatting ---------------- */
function fmtDay(k, o = {}) {
  const d = k2d(k);
  let s = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  if (o.year) s += `, ${d.getUTCFullYear()}`;
  if (o.dow) s = `${DOWS[d.getUTCDay()]} ${s}`;
  return s;
}
function fmtRange(a, b) {
  if (a === b) return fmtDay(a, { year: true });
  const ya = a.slice(0, 4), yb = b.slice(0, 4);
  return ya === yb ? `${fmtDay(a)} – ${fmtDay(b)}, ${yb}` : `${fmtDay(a, { year: true })} – ${fmtDay(b, { year: true })}`;
}
function fmtTime(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  let h = Math.floor(mins / 60);
  const m = mins % 60, ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
function fmtNum(x, d = 1) {
  if (x == null || !Number.isFinite(x)) return "—";
  const v = Math.round(x * 10 ** d) / 10 ** d;
  return v.toFixed(d).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
const plural = (n, w, pl) => `${n} ${n === 1 ? w : pl || w + "s"}`;
const nextMonth = mk => { const y = +mk.slice(0, 4), m = +mk.slice(5, 7); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
// second replace splits a one-letter word before a capital ("UseANew" -> "Use A New"); the original lost it ("anew")
const splitCamel = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").toLowerCase().replace(/^./, c => c.toUpperCase());

/* Device coaching codes in plain English. */
const COACHING_TEXT = {
  KeepGoingUntilCompletelyEmpty: { short: "Stopped early", text: "Keep blowing until completely empty", effect: "FVC can read low" },
  BlastOutImmediatelyWhenCompletelyFull: { short: "Slow start", text: "Blast out as soon as the lungs are full", effect: "FEV1 and peak flow can read low" }
};
const coachingLabel = code => COACHING_TEXT[code] || { short: splitCamel(code), text: splitCamel(code), effect: "" };

/* ---------------- parsing ---------------- */
function faceIndex(q, v) { return (q.options || []).findIndex(o => norm(o) === norm(v)); }

/** The `value` field is always text. Read it according to the question type. */
function parseValue(q, raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") raw = JSON.stringify(raw);
  const s = String(raw).trim();
  if (!s || s === "null" || s === "undefined" || s === "[]") return null;
  switch (q.type) {
    case "yesno": {
      const t = s.toLowerCase();
      if (["true", "yes", "y", "1"].includes(t)) return true;
      if (["false", "no", "n", "0"].includes(t)) return false;
      return null;
    }
    case "number": { const x = parseFloat(s.replace(",", ".")); return Number.isFinite(x) ? x : null; }
    case "scale": { const x = parseFloat(s); return Number.isFinite(x) ? clamp(Math.round(x), q.min ?? 1, q.max ?? 10) : null; }
    case "face": case "single": case "icon": {
      const opt = (q.options || []).find(o => norm(o) === s.toLowerCase());
      return opt ? opt.trim() : s;
    }
    case "checkbox": {
      let arr;
      try { arr = JSON.parse(s); } catch { arr = s.split(","); }
      if (!Array.isArray(arr)) arr = [arr];
      arr = arr.map(x => String(x).trim()).filter(Boolean);
      const none = norm(q.none || "None of these");
      const opts = (q.options || []).map(o => o.trim());
      return [...new Set(arr.filter(x => norm(x) !== none).map(x => opts.find(o => norm(o) === norm(x)) || x))];
    }
    case "device": {
      try { const b = blowsFromAnswer(JSON.parse(s)); return b.length ? b : null; } catch { return null; }
    }
    default: return s;
  }
}
function blowsFromAnswer(o) {
  const list = Array.isArray(o) ? o : (o && o.blows) || [];
  const p = (o && o.pred) || {};
  return list.map(b => ({
    fev1: +b.FEV1, fvc: +b.FVC, pef: +b.PEF, fef: +b.FEF2575, fev6: +b.FEV6,
    pred: { fev1: +p.FEV1 || null, fvc: +p.FVC || null, pef: +p.PEF || null },
    accepted: b.accepted === true || b.accepted === "true", quality: b.quality ?? null, code: null,
    indications: (b.indications || []).map(x => (typeof x === "string" ? { instr: x } : { msg: x.qualityMessage, instr: x.instructions }))
  })).filter(b => Number.isFinite(b.fev1) && Number.isFinite(b.fvc));
}
function blowFromReading(r) {
  const f = r.fvcPlusResults || {}, q = r.qualityReport || {};
  return {
    fev1: +f.fev1, fvc: +f.fvc, pef: +f.pef, fef: +f.fef2575, fev6: +f.fev6,
    pred: { fev1: +f.fev1Pred || null, fvc: +f.fvcPred || null, pef: +f.pefPred || null },
    accepted: r.accepted === true || r.accepted === "true", quality: q.quality ?? null, code: q.code ?? null,
    indications: (q.qualityIndications || []).map(x => ({ msg: x.qualityMessage, instr: x.instructions }))
  };
}

/* ---------------- schedules ---------------- */
function parseSchedule(m) {
  const d = m.dosage || {}, t = d.timing || {};
  const how = norm(m.howOften);
  if (d.asNeeded === true || how.includes("needed") || how === "prn") return { kind: "prn", text: "as needed" };
  const unit = norm(t.periodUnit || (how === "daily" ? "d" : ""));
  const period = Number(t.period) || 1, freq = Number(t.frequency) || 1;
  const dayUnit = ["d", "day", "days", "daily"].includes(unit), weekUnit = ["wk", "week", "weeks", "weekly"].includes(unit);
  if ((dayUnit && period === 1) || (how === "daily" && !weekUnit && period === 1)) {
    let slots = (t.timeOfDay || []).map(hm => +hm.slice(0, 2) * 60 + +hm.slice(3, 5));
    if (slots.length !== freq) slots = freq === 1 ? [480] : freq === 2 ? [480, 1200] : Array.from({ length: freq }, (_, i) => Math.round(480 + i * 720 / (freq - 1)));
    slots.sort((a, b) => a - b);
    return { kind: "daily", perDay: freq, slots, text: freq === 1 ? "once daily" : freq === 2 ? "twice daily" : `${freq} times daily` };
  }
  const every = weekUnit ? period * 7 : period;
  return { kind: "interval", everyDays: every, text: every === 7 ? "weekly" : every === 14 ? "every 2 weeks" : `every ${every} days` };
}

/* ---------------- condition modules: what makes a good, mixed or hard day ---------------- */
const MODULES = {
  respiratory: {
    legend: { good: "No symptoms, no rescue inhaler", mixed: "Some symptoms or rescue inhaler", hard: "Woke at night, missed school or activities, activity limited, or felt Bad" },
    status(t, m, R, ctx) {
      const sym = R.symptoms ? m[R.symptoms.id] || [] : [];
      const worst = R.feeling && m[R.feeling.id] != null && faceIndex(R.feeling, m[R.feeling.id]) === R.feeling.options.length - 1;
      if ((R.nightWaking && m[R.nightWaking.id] === true) || (R.missed && m[R.missed.id] === true) || sym.some(x => /activity/i.test(x)) || worst) return "hard";
      if (sym.length || ctx.prnUsed) return "mixed";
      return "good";
    }
  },
  other: {
    legend: { good: "Best face-scale answer", mixed: "Middle answer", hard: "Worst answer" },
    status(t, m, R) {
      if (R.feeling && m[R.feeling.id] != null) {
        const i = faceIndex(R.feeling, m[R.feeling.id]), n = R.feeling.options.length;
        return i <= 0 ? "good" : i >= n - 1 ? "hard" : "mixed";
      }
      return "logged";
    }
  }
};
const moduleFor = t => MODULES[t.category] || MODULES.other;

/** Several check-ins on one day: the most recent answer to each question counts.
    An empty check-in never replaces an answer. Earlier answers are kept for hover. */
function mergeEntries(t, list) {
  const merged = {}, mixed = [];
  for (const q of t.questions) {
    const seq = list.filter(e => e.answers[q.id] !== undefined && e.answers[q.id] !== null).map(e => ({ v: e.answers[q.id], mins: e.mins }));
    if (!seq.length) continue;
    if (q.type === "device") { merged[q.id] = seq.flatMap(x => x.v); continue; }
    const last = seq[seq.length - 1].v;
    merged[q.id] = (q.type === "single" || q.type === "icon") ? [last] : last;
    if (new Set(seq.map(x => JSON.stringify(x.v))).size > 1) mixed.push({ q, seq });
  }
  return { merged, mixed };
}

/* ==========================================================================
   buildModel
   ========================================================================== */
/** @returns {any} */
function buildModel(doc, library) {
  const defs = new Map(library.map(t => [t.id, t]));
  const trackers = (doc.trackers || []).map(id => defs.get(id) || { id, name: id, category: "other", questions: [], missing: true });
  const tById = new Map(trackers.map(t => [t.id, t]));
  const qById = new Map();
  for (const t of trackers) for (const q of t.questions) qById.set(q.id, { t, q });
  const roles = new Map(trackers.map(t => [t.id, Object.fromEntries(t.questions.filter(q => q.role).map(q => [q.role, q]))]));
  const days = new Map();
  const D = k => {
    let d = days.get(k);
    if (!d) { d = { key: k, tr: {}, doses: {}, sessions: [], activity: false }; days.set(k, d); }
    return d;
  };
  const stat = { records: 0, submissions: 0, blank: 0, afterMidnight: 0, utcShift: 0, refiled: 0, unknownQ: 0, multiDays: 0, mixedDays: 0, dupDoses: 0, orphanDoses: 0, doses: 0, blows: 0, conflicts: 0, baselineBlows: 0, trackerBlows: 0 };

  /* Tracker check-ins */
  const entries = [];
  for (const log of doc.dailyLogs || []) {
    for (const tr of log.trackerResponses || []) {
      stat.records++; stat.submissions++;
      const d = dayOf(tr.submittedAt);
      if (d.afterMidnight) stat.afterMidnight++;
      if (tr.submittedAt.slice(0, 10) !== toLocal(tr.submittedAt).key) stat.utcShift++;
      if (log.day && log.day !== d.key) stat.refiled++;
      const answers = {};
      for (const r of tr.responses || []) {
        const qi = qById.get(r.questionId);
        if (!qi || qi.t.id !== tr.trackerId) { if (String(r.value ?? "").trim()) stat.unknownQ++; continue; }
        const v = parseValue(qi.q, r.value);
        if (v !== null && v !== undefined) answers[qi.q.id] = v;
      }
      const e = { trackerId: tr.trackerId, at: tr.submittedAt, t: Date.parse(tr.submittedAt), key: d.key, mins: d.mins, answers, blank: Object.keys(answers).length === 0 };
      entries.push(e);
      const day = D(d.key);
      day.activity = true;
      const slot = day.tr[tr.trackerId] || (day.tr[tr.trackerId] = { entries: [], all: [], blank: 0 });
      slot.all.push(e);
      if (e.blank) { slot.blank++; stat.blank++; } else slot.entries.push(e);
    }
  }
  for (const day of days.values()) {
    for (const [tid, slot] of Object.entries(day.tr)) {
      const t = tById.get(tid);
      slot.entries.sort((a, b) => a.t - b.t);
      slot.all.sort((a, b) => a.t - b.t);
      slot.hasAnswers = !!t && slot.entries.length > 0;
      if (!slot.hasAnswers) continue;
      if (slot.entries.length > 1) stat.multiDays++;
      const res = mergeEntries(t, slot.entries);
      slot.merged = res.merged; slot.mixed = res.mixed;
      if (res.mixed.length) stat.mixedDays++;
    }
  }

  /* Medicines: records with the same name become one line */
  const lineByName = new Map(), lineByMed = new Map();
  for (const m of doc.medications || []) {
    const nm = norm(m.name);
    let L = lineByName.get(nm);
    if (!L) { L = { id: "med-" + nm.replace(/[^a-z0-9]+/g, "-"), name: String(m.name).trim(), members: [], doses: [] }; lineByName.set(nm, L); }
    L.members.push(m);
    lineByMed.set(m.id, L);
  }
  const lines = [...lineByName.values()];
  for (const L of lines) {
    const active = L.members.filter(m => !m.archived);
    const primary = active[active.length - 1] || L.members[L.members.length - 1];
    L.schedule = parseSchedule(primary);
    const tid = primary.relatedCondition || L.members.map(m => m.relatedCondition).find(Boolean) || null;
    L.trackerId = tid && tById.has(tid) ? tid : null;
    L.archived = active.length === 0;
    L.dosageText = (primary.dosage && primary.dosage.text) || "";
    L.icon = primary.icon || "";
    const created = L.members.map(m => m.createdAt).filter(Boolean).sort()[0];
    L.created = created ? dayOf(created).key : null;
  }

  /* Doses */
  const raw = [];
  for (const log of doc.dailyLogs || []) {
    for (const a of log.medicationAdministrations || []) {
      stat.records++;
      const L = lineByMed.get(a.medicationId);
      if (!L) { stat.orphanDoses++; continue; }
      const d = dayOf(a.administeredAt);
      if (a.administeredAt.slice(0, 10) !== toLocal(a.administeredAt).key) stat.utcShift++;
      if (d.afterMidnight) stat.afterMidnight++;
      if (log.day && log.day !== d.key) stat.refiled++;
      raw.push({ line: L, medId: a.medicationId, at: a.administeredAt, t: Date.parse(a.administeredAt), key: d.key, mins: d.mins, value: parseFloat(a.value) || 1 });
    }
  }
  raw.sort((a, b) => a.t - b.t);
  const lastByLine = new Map(), hourPairs = [];
  for (const x of raw) {
    const prev = lastByLine.get(x.line.id);
    if (prev && x.t - prev.t <= 60000) { stat.dupDoses++; continue; } // a second tap within a minute
    if (prev && prev.key === x.key && Math.abs(x.t - prev.t - 3600000) <= 2000) hourPairs.push([prev, x]);
    lastByLine.set(x.line.id, x);
    x.line.doses.push(x);
    stat.doses++;
    const day = D(x.key);
    day.activity = true;
    (day.doses[x.line.id] || (day.doses[x.line.id] = [])).push(x);
  }

  /* Spirometry: baseline readings on the device plus spirometer answers in check-ins */
  const blows = [];
  for (const dev of doc.medicalDevices || []) {
    for (const r of dev.baselineReadings || []) {
      blows.push({ ...blowFromReading(r), at: r.date || localISO(dev.baselineReadingDate, 12, 0), src: "baseline" });
      stat.baselineBlows++;
    }
  }
  for (const e of entries) {
    for (const [qid, v] of Object.entries(e.answers)) {
      if (qById.get(qid).q.type !== "device") continue;
      for (const b of v) { blows.push({ ...b, at: e.at, src: "tracker" }); stat.trackerBlows++; }
    }
  }
  for (const b of blows) {
    const q = b.quality == null ? null : /^accept/i.test(b.quality);
    b.usable = b.accepted === true && q !== false;
    b.conflict = (b.accepted === true && q === false) || (b.accepted === false && q === true);
    if (b.conflict) stat.conflicts++;
    stat.blows++;
  }
  const byDay = new Map();
  for (const b of blows) {
    const k = dayOf(b.at).key;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(b);
  }
  const sessions = [];
  for (const [k, bs] of byDay) {
    bs.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const use = bs.filter(b => b.usable), basis = use.length ? use : bs;
    const best = { fev1: Math.max(...basis.map(b => b.fev1)), fvc: Math.max(...basis.map(b => b.fvc)), pef: Math.max(...basis.map(b => b.pef)) };
    best.ratio = best.fev1 / best.fvc;
    best.fef = basis.reduce((a, b) => (b.fev1 > a.fev1 ? b : a)).fef;
    const pred = (bs.find(b => b.pred && b.pred.fev1) || {}).pred || null;
    const s = {
      key: k, at: bs[0].at, mins: dayOf(bs[0].at).mins, blows: bs, nUsable: use.length,
      quality: use.length >= 2 ? "good" : use.length === 1 ? "fair" : "poor", best, pred,
      src: [...new Set(bs.map(b => b.src))],
      coaching: tally(bs.flatMap(b => b.indications.map(i => i.instr)).filter(Boolean)),
      conflicts: bs.filter(b => b.conflict).length
    };
    if (pred) {
      s.fev1Pct = pred.fev1 ? best.fev1 / pred.fev1 * 100 : null;
      s.fvcPct = pred.fvc ? best.fvc / pred.fvc * 100 : null;
      s.pefPctPred = pred.pef ? best.pef / pred.pef * 100 : null;
    }
    if (use.length >= 2) { const f = use.map(b => b.fev1).sort((a, b) => b - a); s.repeatable = f[0] - f[1] <= 0.15; }
    sessions.push(s);
    const day = D(k);
    day.sessions.push(s);
    day.activity = true;
  }
  sessions.sort((a, b) => (a.key < b.key ? -1 : 1));
  // Personal best peak flow: acceptable blows from the baseline session, else the first sessions.
  let pb = null;
  const base = sessions.find(s => s.src.includes("baseline") && s.nUsable > 0);
  if (base) pb = { pef: Math.max(...base.blows.filter(b => b.usable).map(b => b.pef)), key: base.key, from: "baseline" };
  else {
    const early = sessions.filter(s => s.nUsable > 0).slice(0, 4);
    if (early.length) pb = { pef: Math.max(...early.map(s => s.best.pef)), key: early[0].key, from: "first sessions" };
  }
  for (const s of sessions) {
    if (pb && s.quality !== "poor") {
      s.pefPctPB = s.best.pef / pb.pef * 100;
      s.zone = s.pefPctPB >= 80 ? "green" : s.pefPctPB >= 50 ? "yellow" : "red";
    }
  }

  /* Day status per tracker */
  const prnDays = new Map();
  for (const L of lines) {
    if (L.schedule.kind !== "prn" || !L.trackerId) continue;
    const set = prnDays.get(L.trackerId) || new Set();
    for (const x of L.doses) set.add(x.key);
    prnDays.set(L.trackerId, set);
  }
  for (const day of days.values()) {
    for (const [tid, slot] of Object.entries(day.tr)) {
      if (!slot.hasAnswers) continue;
      const t = tById.get(tid);
      slot.status = moduleFor(t).status(t, slot.merged, roles.get(tid), { prnUsed: !!(prnDays.get(tid) && prnDays.get(tid).has(day.key)) });
    }
  }

  /* Dates */
  const keys = [...days.keys()].sort();
  const asOf = doc.dataThrough;
  const firstKey = [keys[0], doc.enrolled].filter(Boolean).sort()[0] || asOf;
  const answered = entries.filter(e => !e.blank).sort((a, b) => b.t - a.t);
  const lastEntry = answered[0] || null;
  const lastByTracker = new Map();
  for (const e of answered) if (!lastByTracker.has(e.trackerId)) lastByTracker.set(e.trackerId, e);
  const times = [...entries.map(e => ({ t: e.t, what: "check-in" })), ...raw.map(x => ({ t: x.t, what: "medicine" })), ...blows.map(b => ({ t: Date.parse(b.at), what: "spirometer" }))].sort((a, b) => b.t - a.t);
  const lastActivity = times.length ? { ...times[0], iso: new Date(times[0].t).toISOString() } : null;
  if (lastActivity) { const d = dayOf(lastActivity.iso); lastActivity.key = d.key; lastActivity.mins = d.mins; }

  /* Notes on every change made to the record */
  const notes = { fixes: [], issues: [], assumptions: [...(doc.reconstructionNotes || [])] };
  notes.fixes.push(`Timestamps are stored in UTC. Each one was converted to Eastern time (America/New_York, daylight saving included) before grouping by day. ${stat.utcShift} of ${stat.records} records fall on a different calendar date in UTC.`);
  if (stat.afterMidnight) notes.fixes.push(`${plural(stat.afterMidnight, "record")} made between midnight and 3 AM count for the evening before, so a late check-in or a dose taken overnight stays with the day it belongs to.`);
  if (stat.multiDays) notes.fixes.push(`${plural(stat.multiDays, "tracker day")} had more than one check-in. Each became one row using the most recent answer to every question; an empty check-in never replaces an answer.${stat.mixedDays ? ` On ${plural(stat.mixedDays, "day")} an answer changed during the day; hover the day to see each answer and its time.` : ""}`);
  if (stat.blank) notes.fixes.push(`${plural(stat.blank, "check-in")} had no answers and ${stat.blank === 1 ? "was" : "were"} left out of the counts. ${stat.blank === 1 ? "It still counts" : "They still count"} as app activity.`);
  if (stat.dupDoses) notes.fixes.push(`${plural(stat.dupDoses, "duplicate medicine tap")} (the same medicine logged twice within a minute) ${stat.dupDoses === 1 ? "was" : "were"} removed.`);
  for (const L of lines) {
    if (L.members.length > 1) {
      const arch = L.members.filter(m => m.archived).length;
      notes.fixes.push(`${L.name}: ${L.members.length} medicine records with the same name were combined${arch ? ` (${arch} archived)` : ""}. Doses logged under any of them now count together.`);
    }
  }
  if (stat.baselineBlows && stat.trackerBlows) notes.fixes.push(`Spirometry was in two places with two different layouts: the device's baseline readings (${stat.baselineBlows} blows) and spirometer answers inside check-ins (${stat.trackerBlows} blows). Both are read and shown together.`);
  else if (stat.blows) notes.fixes.push(`${plural(stat.blows, "spirometer blow")} grouped into ${plural(sessions.length, "session")}. Each session reports the largest FEV1 and the largest FVC from acceptable blows, as the ATS/ERS standard does.`);
  if (stat.conflicts) notes.issues.push(`${plural(stat.conflicts, "blow")} ${stat.conflicts === 1 ? "has" : "have"} "accepted" and the device quality report disagreeing. They are treated as not acceptable, and the session is marked poor technique.`);
  for (const [a, b] of hourPairs) notes.issues.push(`${a.line.name} was logged at ${fmtTime(a.mins)} and ${fmtTime(b.mins)} on ${fmtDay(a.key, { year: true })}, exactly one hour apart. That can be a clock or time-zone error; both doses are kept.`);
  if (stat.orphanDoses) notes.issues.push(`${plural(stat.orphanDoses, "dose")} pointed to a medicine that isn't on the list and ${stat.orphanDoses === 1 ? "was" : "were"} left out.`);
  if (stat.unknownQ) notes.issues.push(`${plural(stat.unknownQ, "answer")} referred to questions missing from the tracker definition and ${stat.unknownQ === 1 ? "was" : "were"} left out.`);
  for (const t of trackers) {
    if (t.missing) notes.issues.push(`No definition found for tracker ${t.id}; its answers can't be read.`);
    if (!t.questions.length) notes.issues.push(`${t.name}: no questions are known for this tracker, so it shows check-ins only.`);
  }

  return {
    doc, trackers, tById, roles, qById, days, entries, lines, sessions, pb, stat, notes, hourPairs,
    firstKey, asOf, visit: doc.visitDate, lastEntry, lastByTracker, lastActivity,
    plan: doc.asthmaTreatmentPlan || null,
    badges: [...(doc.earnedTrackerBadges || []), ...(doc.earnedMedicationBadges || [])].map(b => ({ ...b, key: dayOf(b.date).key })).sort((a, b) => (a.date < b.date ? -1 : 1)),
    reminders: doc.reminders || []
  };
}

/* ==========================================================================
   Range analysis
   ========================================================================== */
const RANGE_OPTS = [
  { id: "28", label: "4 weeks", days: 28 },
  { id: "91", label: "3 months", days: 91 },
  { id: "365", label: "12 months", days: 365 },
  { id: "all", label: "All", days: null }
];
function makeRange(model, id) {
  const opt = RANGE_OPTS.find(o => o.id === id) || RANGE_OPTS[0];
  const custom = /^custom\|(\d{4}-\d{2}-\d{2})\|(\d{4}-\d{2}-\d{2})$/.exec(id);
  const end = custom ? custom[2] : model.asOf;
  let start = custom ? custom[1] : opt.days ? addDays(end, -(opt.days - 1)) : model.firstKey;
  const clipped = !custom && start < model.firstKey;
  if (clipped) start = model.firstKey;
  if (start > end) start = end;
  const n = diffDays(start, end) + 1;
  const prev = { start: addDays(start, -n), end: addDays(start, -1), n };
  // compare only with a full earlier period that has data in it
  const prevValid = prev.start >= model.firstKey;
  return { id: custom ? id : opt.id, label: custom ? fmtRange(start, end) : opt.label, start, end, n, clipped, prev, prevValid };
}
/** Consecutive blocks for small trend charts: weeks ending on the range end, or calendar months for long ranges. */
function blocksOf(r) {
  const out = [];
  if (r.n <= 120) {
    for (let e = r.end; e >= r.start; e = addDays(e, -7)) {
      const s = addDays(e, -6);
      out.unshift({ start: s < r.start ? r.start : s, end: e, label: `Week ending ${fmtDay(e)}` });
    }
  } else {
    let mk = r.start.slice(0, 7);
    const endMk = r.end.slice(0, 7);
    while (mk <= endMk) {
      const s = `${mk}-01`, last = addDays(`${nextMonth(mk)}-01`, -1);
      out.push({ start: s < r.start ? r.start : s, end: last > r.end ? r.end : last, label: `${MONTHS_LONG[+mk.slice(5, 7) - 1]} ${mk.slice(0, 4)}` });
      mk = nextMonth(mk);
    }
  }
  return out;
}
function trackerRows(model, t, a, b) {
  return eachDay(a, b).map(k => {
    const s = model.days.get(k) && model.days.get(k).tr[t.id];
    return { k, s, m: s && s.hasAnswers ? s.merged : null, status: s && s.hasAnswers ? s.status : null };
  });
}
const countIf = (rows, f) => rows.filter(r => r.m && f(r.m, r)).length;
const keysIf = (rows, f) => rows.filter(r => r.m && f(r.m, r)).map(r => r.k);

const GINA_TEXT = { well: "Well controlled", partly: "Partly controlled", uncontrolled: "Uncontrolled" };
const GINA_STATUS = { well: "good", partly: "warn", uncontrolled: "bad" };
/** GINA symptom control over the 4 weeks ending `end`, from home data. */
function gina(model, t, end) {
  const start = addDays(end, -27);
  const R = model.roles.get(t.id) || {};
  const rows = trackerRows(model, t, start, end);
  const logged = rows.filter(r => r.m).length;
  const prn = model.lines.filter(L => L.trackerId === t.id && L.schedule.kind === "prn");
  const items = [];
  const L1 = "Daytime symptoms more than 2 days a week", L2 = "Any night waking from asthma", L3 = "Rescue inhaler more than 2 days a week", L4 = "Any activity limitation from asthma";
  if (R.symptoms) {
    const ks = keysIf(rows, m => (m[R.symptoms.id] || []).length > 0);
    const rate = logged ? ks.length / logged * 7 : 0;
    items.push({ id: "sym", label: L1, yes: rate > 2, value: logged ? `${fmtNum(rate)} a week` : "—", note: `${ks.length} of ${plural(logged, "logged day")}`, days: ks });
  } else items.push({ id: "sym", label: L1, na: "Not asked by this tracker" });
  if (R.nightWaking) {
    const ks = keysIf(rows, m => m[R.nightWaking.id] === true);
    items.push({ id: "night", label: L2, yes: ks.length > 0, value: ks.length ? plural(ks.length, "night") : "None", days: ks });
  } else items.push({ id: "night", label: L2, na: "Not asked by this tracker" });
  if (prn.length) {
    const set = new Set();
    for (const L of prn) for (const d of L.doses) if (d.key >= start && d.key <= end) set.add(d.key);
    const rate = set.size / 4;
    items.push({ id: "rel", label: L3, yes: rate > 2, value: `${fmtNum(rate)} days a week`, note: `${plural(set.size, "day")} in 4 weeks`, days: [...set].sort() });
  } else items.push({ id: "rel", label: L3, na: "No as-needed inhaler on the medicine list" });
  const actOpt = R.symptoms && (R.symptoms.options || []).some(o => /activity/i.test(o));
  if (R.missed || actOpt) {
    const ks = keysIf(rows, m => (R.missed && m[R.missed.id] === true) || (actOpt && (m[R.symptoms.id] || []).some(x => /activity/i.test(x))));
    items.push({ id: "act", label: L4, yes: ks.length > 0, value: ks.length ? plural(ks.length, "day") : "None", days: ks });
  } else items.push({ id: "act", label: L4, na: "Not asked by this tracker" });
  const ans = items.filter(i => !i.na), score = ans.filter(i => i.yes).length, enough = logged >= 14;
  const level = !enough ? null : score === 0 ? "well" : score <= 2 ? "partly" : "uncontrolled";
  return { start, end, logged, items, score, answerable: ans.length, enough, level };
}

function analyzeRespiratory(model, t, r, rows, prows) {
  const R = model.roles.get(t.id) || {};
  const res = { gina: gina(model, t, r.end), ginaPrev: gina(model, t, addDays(r.end, -28)) };
  const W = clamp(Math.round(r.n / 7), 8, 26);
  res.ginaTrend = Array.from({ length: W }, (_, i) => {
    const e = addDays(r.end, -7 * (W - 1 - i));
    const g = gina(model, t, e);
    return { end: e, start: g.start, score: g.enough ? g.score : null, level: g.level, answerable: g.answerable, logged: g.logged };
  });
  if (R.symptoms) {
    res.symDays = keysIf(rows, m => (m[R.symptoms.id] || []).length > 0);
    res.psymDays = countIf(prows, m => (m[R.symptoms.id] || []).length > 0);
    res.symFreq = tally(rows.filter(x => x.m).flatMap(x => x.m[R.symptoms.id] || []));
  }
  if (R.nightWaking) { res.nights = keysIf(rows, m => m[R.nightWaking.id] === true); res.pnights = countIf(prows, m => m[R.nightWaking.id] === true); }
  if (R.missed) { res.missed = keysIf(rows, m => m[R.missed.id] === true); res.pmissed = countIf(prows, m => m[R.missed.id] === true); }
  if (R.feeling && R.symptoms) {
    const best = R.feeling.options[0].trim();
    res.discordant = rows.filter(x => x.s && x.s.entries.some(e => e.answers[R.feeling.id] === best && (e.answers[R.symptoms.id] || []).length > 0)).map(x => x.k);
  }
  return res;
}
function lineSpan(model, L) {
  const first = L.doses.length ? L.doses[0].key : null;
  const start = [L.created, first].filter(Boolean).sort()[0] || null;
  if (!start) return null;
  const end = L.archived ? (L.doses.length ? L.doses[L.doses.length - 1].key : start) : model.asOf;
  return { start, end };
}
function slotFill(L, list) {
  const slots = L.schedule.slots, filled = slots.map(() => null);
  let extra = 0;
  for (const d of [...list].sort((a, b) => a.mins - b.mins)) {
    let best = -1, bd = 1e9;
    slots.forEach((s, i) => { if (filled[i]) return; const dist = Math.abs(d.mins - s); if (dist < bd) { bd = dist; best = i; } });
    if (best >= 0 && (slots.length === 1 || bd <= 360)) filled[best] = d; else extra++;
  }
  return { filled, extra };
}
function analyzeLine(model, L, r) {
  const span = lineSpan(model, L), sch = L.schedule;
  const within = (k, a, b) => k >= a && k <= b;
  if (sch.kind === "prn") {
    const f = (a, b) => {
      const ds = L.doses.filter(d => within(d.key, a, b));
      const dayList = [...new Set(ds.map(d => d.key))];
      return { uses: ds.length, units: ds.reduce((s, d) => s + d.value, 0), days: dayList.length, dayList };
    };
    const cur = f(r.start, r.end);
    return { L, kind: "prn", span, ...cur, prev: f(r.prev.start, r.prev.end), perWeek: cur.days / (r.n / 7), blocks: blocksOf(r).map(b => ({ ...b, v: f(b.start, b.end).days })) };
  }
  if (sch.kind === "daily") {
    const f = (a, b) => {
      let due = 0, taken = 0, dueA = 0, takenA = 0, extra = 0, inactive = 0;
      const bySlot = sch.slots.map(s => ({ at: s, due: 0, taken: 0 })); // days with entries only
      const perDay = [];
      if (span) {
        const s0 = a < span.start ? span.start : a, s1 = b > span.end ? span.end : b;
        if (s0 <= s1) for (const k of eachDay(s0, s1)) {
          const day = model.days.get(k);
          const fill = slotFill(L, (day && day.doses[L.id]) || []);
          const n = fill.filled.filter(Boolean).length;
          due += sch.perDay; taken += n; extra += fill.extra;
          const act = !!(day && day.activity);
          if (act) fill.filled.forEach((x, i) => { bySlot[i].due++; if (x) bySlot[i].taken++; });
          if (act) { dueA += sch.perDay; takenA += n; } else inactive++;
          perDay.push({ k, filled: fill.filled, act });
        }
      }
      return { due, taken, pct: due ? taken / due * 100 : null, dueActive: dueA, takenActive: takenA, pctActive: dueA ? takenA / dueA * 100 : null, inactive, bySlot, extra, perDay };
    };
    const cur = f(r.start, r.end);
    return { L, kind: "daily", span, ...cur, prev: f(r.prev.start, r.prev.end), blocks: blocksOf(r).map(b => { const x = f(b.start, b.end); return { ...b, v: x.dueActive ? x.takenActive / x.dueActive : null, taken: x.takenActive, due: x.dueActive, bySlot: x.bySlot }; }) };
  }
  // fixed interval (e.g. every 14 days)
  const due = [];
  if (span) for (let k = span.start; k <= model.asOf; k = addDays(k, sch.everyDays)) due.push(k);
  const used = new Set();
  const events = due.map(k => {
    let best = null;
    for (const d of L.doses) {
      if (used.has(d)) continue;
      const dd = diffDays(k, d.key);
      if (dd >= -3 && dd <= 7 && (!best || Math.abs(dd) < Math.abs(diffDays(k, best.key)))) best = d;
    }
    if (best) used.add(best);
    return { due: k, dose: best, late: best ? diffDays(k, best.key) : null };
  });
  const inR = events.filter(e => within(e.due, r.start, r.end));
  const pending = e => !e.dose && diffDays(e.due, model.asOf) < 3;
  return {
    L, kind: "interval", span, events, inR,
    given: inR.filter(e => e.dose).length, onTime: inR.filter(e => e.dose && Math.abs(e.late) <= 2).length,
    late: inR.filter(e => e.dose && e.late > 2), missed: inR.filter(e => !e.dose && !pending(e)),
    next: due.length ? addDays(due[due.length - 1], sch.everyDays) : null
  };
}

function analyzeSpiro(model, r) {
  if (!model.sessions.length) return null;
  const inR = model.sessions.filter(s => s.key >= r.start && s.key <= r.end);
  const ok = inR.filter(s => s.quality !== "poor" && s.fev1Pct != null);
  const latest = ok[ok.length - 1] || null;
  const baseline = model.sessions.find(s => s.src.includes("baseline")) || null;
  const change = ok.length >= 4 ? mean(ok.slice(-3).map(s => s.fev1Pct)) - mean(ok.slice(0, 3).map(s => s.fev1Pct)) : null;
  const vsBase = latest && baseline && baseline !== latest && baseline.fev1Pct != null && baseline.quality !== "poor" ? latest.fev1Pct - baseline.fev1Pct : null;
  const poor = inR.filter(s => s.quality === "poor");
  const coaching = tally(inR.flatMap(s => s.blows.filter(b => !b.usable).flatMap(b => b.indications.map(i => i.instr))).filter(Boolean));
  return { inR, ok, latest, baseline, change, vsBase, poor, coaching, lastAny: model.sessions[model.sessions.length - 1] };
}

function analyzeEngagement(model, r) {
  const ks = eachDay(r.start, r.end);
  const anyAnswer = k => model.trackers.some(t => { const s = model.days.get(k) && model.days.get(k).tr[t.id]; return s && s.hasAnswers; });
  const per = model.trackers.map(t => {
    const slots = ks.map(k => model.days.get(k) && model.days.get(k).tr[t.id]);
    const withAns = slots.filter(s => s && s.hasAnswers);
    return {
      t, logged: withAns.length,
      blank: slots.reduce((a, s) => a + (s ? s.blank : 0), 0),
      multi: withAns.filter(s => s.entries.length > 1).length,
      checkins: slots.reduce((a, s) => a + (s ? s.all.length : 0), 0),
      medianTime: median(withAns.map(s => s.entries[0].mins))
    };
  });
  const gaps = [];
  let run = null;
  for (const k of ks) {
    if (!anyAnswer(k)) run = run ? { start: run.start, end: k, n: run.n + 1 } : { start: k, end: k, n: 1 };
    else { if (run && run.n >= 3) gaps.push(run); run = null; }
  }
  if (run && run.n >= 3) gaps.push(run);
  return { active: ks.filter(k => model.days.get(k) && model.days.get(k).activity).length, anyDays: ks.filter(anyAnswer).length, n: r.n, per, gaps };
}

/* Findings worth a look. tags = which views show them; topic = what each is about,
   so the glance can leave out what its answers already say. */
function collectFlags(model, A) {
  const F = [], r = A.r;
  const catTag = { respiratory: "pulm", neurology: "neuro", digestive: "gi" };
  const allTags = ["pulm", "neuro", "gi", "pcp", "nurse"];
  for (const T of A.trackers) {
    const tags = [catTag[T.t.category], "pcp"].filter(Boolean);
    if (T.gina) {
      const g = T.gina, gp = T.ginaPrev;
      if (g.enough && g.level !== "well") {
        F.push({
          topic: "control", sev: g.level === "uncontrolled" ? 3 : 2, tags,
          title: `Asthma ${GINA_TEXT[g.level].toLowerCase()} over the last 4 weeks`,
          detail: `${g.score} of ${g.answerable} GINA symptom-control questions were yes` + (gp.enough ? (gp.level === g.level ? ", the same as the 4 weeks before." : `. The 4 weeks before were ${GINA_TEXT[gp.level].toLowerCase()}.`) : "."),
          days: [...new Set(g.items.flatMap(i => i.days || []))].sort(), go: "sec-glance"
        });
      }
      if (T.discordant && T.discordant.length >= 2) {
        F.push({ topic: "discordant", sev: 1, tags, title: `Said "Great" on ${plural(T.discordant.length, "day")} that also listed symptoms`, detail: "Worth asking how those days felt. Overall ratings and symptom lists don't always agree.", days: T.discordant, go: "sec-timeline" });
      }
      const missing = g.items.filter(i => i.na).map(i => i.id);
      if (missing.length) {
        const what = { sym: "daytime symptoms", night: "night waking", rel: "rescue inhaler use (no rescue inhaler is on the medicine list)", act: "activity limits or missed school" };
        F.push({ topic: "setup", sev: 1, tags: [...tags, "nurse"], title: `${T.t.name} can answer ${g.answerable} of the 4 asthma-control questions`, detail: `It doesn't record ${missing.map(m => what[m]).join(" or ")}. Adding these in the portal would let the view check control fully.`, go: "sec-details" });
      }
    }
    if (T.missed && T.missed.length) F.push({ topic: "missed", sev: 1, tags: [...tags, "nurse"], title: `Missed school or activities on ${plural(T.missed.length, "day")} (${T.t.name.toLowerCase()})`, detail: T.missed.map(k => fmtDay(k, { dow: true })).join(", ") + ".", days: T.missed, go: "sec-timeline" });
  }
  for (const X of A.lines) {
    const T = X.L.trackerId ? model.tById.get(X.L.trackerId) : null;
    const tags = [T && catTag[T.category], "pcp", "nurse"].filter(Boolean);
    if (X.kind === "daily" && X.dueActive >= 7) {
      const p = X.pctActive;
      if (p < 80) {
        let detail = `${X.takenActive} of ${X.dueActive} doses logged on days with entries.`;
        if (X.inactive) detail += ` No data on ${plural(X.inactive, "day")}; those days are left out.`;
        const ctl = T && A.trackers.find(y => y.t === T);
        if (ctl && ctl.gina && ctl.gina.level && ctl.gina.level !== "well") detail += " With symptoms like these, low use makes it hard to tell a medicine that isn't working from one that isn't being taken.";
        F.push({ topic: "adherence", sev: p < 50 ? 3 : 2, tags, title: `${X.L.name}: ${Math.round(p)}% of doses logged`, detail, days: X.perDay.filter(d => d.act && d.filled.some(x => !x)).map(d => d.k), go: "sec-meds" });
      }
      if (X.bySlot.length === 2 && X.bySlot[0].due >= 7 && X.bySlot[1].due >= 7) {
        const am = X.bySlot[0].taken / X.bySlot[0].due * 100, pm = X.bySlot[1].taken / X.bySlot[1].due * 100;
        if (Math.abs(am - pm) >= 25) {
          const low = pm < am ? 1 : 0, word = low ? "evening" : "morning";
          const rem = model.reminders.filter(x => x.medicationId && X.L.members.some(m => m.id === x.medicationId)).map(x => x.time).sort()[low];
          F.push({
            topic: "timing", sev: 1, tags: [...new Set([...tags, "nurse"])],
            title: `Most missed ${X.L.name} doses are ${word} doses`,
            detail: `Mornings ${Math.round(am)}%, evenings ${Math.round(pm)}% on days with entries.${rem ? ` The ${word} reminder is set for ${fmtTime(+rem.slice(0, 2) * 60 + +rem.slice(3, 5))}.` : ` No ${word} reminder is set.`}`,
            days: X.perDay.filter(d => d.act && !d.filled[low]).map(d => d.k), go: "sec-meds"
          });
        }
      }
    }
    if (X.kind === "interval") {
      if (X.late.length) F.push({ topic: "interval", sev: 1, tags, title: `${X.L.name}: ${plural(X.late.length, "dose")} given late`, detail: X.late.map(e => `Due ${fmtDay(e.due)}, given ${fmtDay(e.dose.key)}`).join("; ") + ".", days: X.late.map(e => e.dose.key), go: "sec-meds" });
      if (X.missed.length) F.push({ topic: "interval", sev: 2, tags, title: `${X.L.name}: ${plural(X.missed.length, "dose")} not logged`, detail: X.missed.map(e => `Due ${fmtDay(e.due)}`).join("; ") + ".", days: X.missed.map(e => e.due), go: "sec-meds" });
    }
  }
  const S = A.spiro;
  if (S) {
    if (S.latest && (S.latest.fev1Pct < 80 || (S.vsBase != null && S.vsBase <= -10))) {
      F.push({
        topic: "lung", sev: 2, tags: ["pulm", "pcp"],
        title: `FEV1 ${Math.round(S.latest.fev1Pct)}% of predicted on ${fmtDay(S.latest.key)}`,
        detail: [S.vsBase != null ? `${S.vsBase < 0 ? "Down" : "Up"} ${Math.abs(Math.round(S.vsBase))} points from the baseline on ${fmtDay(S.baseline.key)} (${Math.round(S.baseline.fev1Pct)}%).` : "", S.latest.zone ? `Peak flow ${Math.round(S.latest.pefPctPB)}% of personal best (${S.latest.zone} zone).` : ""].filter(Boolean).join(" "),
        days: S.ok.map(s => s.key), go: "sec-lung"
      });
    }
    const poorAll = S.inR.length ? S.poor : (S.lastAny && S.lastAny.quality === "poor" ? [S.lastAny] : []);
    if (poorAll.length && (poorAll.length >= 2 || !S.inR.length || poorAll.length / S.inR.length >= 0.25)) {
      const top = (S.inR.length ? S.coaching : S.lastAny.coaching)[0];
      F.push({
        topic: "technique", sev: 1, tags: ["nurse", "pulm"],
        title: S.inR.length ? `${poorAll.length} of ${plural(S.inR.length, "spirometry test")} had no acceptable blow` : `The last spirometry test (${fmtDay(S.lastAny.key, { year: true })}) had no acceptable blow`,
        detail: `${top ? `Most common device coaching: "${coachingLabel(top[0]).text}" (${plural(top[1], "blow")}). ` : ""}Worth a technique check at this visit.`,
        days: poorAll.map(s => s.key), go: "sec-lung"
      });
    }
  }
  const plan = model.plan;
  if (plan && plan.expiration) {
    const left = diffDays(model.visit, plan.expiration);
    if (left <= 30) F.push({ topic: "plan", sev: left < 0 ? 2 : 1, tags: ["nurse", "pulm"], title: left < 0 ? `Asthma action plan expired ${fmtDay(plan.expiration, { year: true })}` : `Asthma action plan expires ${fmtDay(plan.expiration)}, ${plural(left, "day")} after this visit`, detail: `The app currently shows the ${String(plan.status).toLowerCase()} zone.`, go: "sec-lung" });
  }
  const E = A.eng;
  if (model.lastEntry && model.lastEntry.key < addDays(r.end, -6)) {
    F.push({ topic: "stale", sev: 2, tags: allTags, title: `No entries since ${fmtDay(model.lastEntry.key, { year: true })}`, detail: `${plural(diffDays(model.lastEntry.key, model.visit), "day")} before this visit.${model.lastActivity && model.lastActivity.key > model.lastEntry.key ? ` The app was last used on ${fmtDay(model.lastActivity.key, { year: true })} (${model.lastActivity.what} only).` : ""}`, go: "sec-engagement" });
  } else if (!model.lastEntry) {
    F.push({ topic: "stale", sev: 2, tags: allTags, title: "No entries yet", detail: "No tracker answers in this record.", go: "sec-engagement" });
  }
  const gapsShown = E.gaps.filter(g => g.n < r.n);
  if (gapsShown.length && gapsShown.length <= 2) {
    for (const g of gapsShown) F.push({ topic: "gaps", sev: 1, tags: allTags, title: `No data ${fmtDay(g.start)} – ${fmtDay(g.end)} (${plural(g.n, "day")})`, detail: "No entries on these days. They are left out of symptom and medicine rates.", days: eachDay(g.start, g.end), go: "sec-engagement" });
  } else if (gapsShown.length > 2) {
    const longest = [...gapsShown].sort((a, b) => b.n - a.n)[0];
    F.push({ topic: "gaps", sev: 1, tags: allTags, title: `${gapsShown.length} stretches of 3 or more days with no data`, detail: `Longest: ${fmtRange(longest.start, longest.end)} (${plural(longest.n, "day")}).`, days: gapsShown.flatMap(g => eachDay(g.start, g.end)), go: "sec-engagement" });
  }
  return F.sort((a, b) => b.sev - a.sev);
}

/** @returns {any} */
function analyze(model, rangeId) {
  const r = makeRange(model, rangeId);
  const A = { r, trackers: [], lines: [], spiro: null, eng: null, flags: [] };
  for (const t of model.trackers) {
    const rows = trackerRows(model, t, r.start, r.end), prows = trackerRows(model, t, r.prev.start, r.prev.end);
    const counts = { good: 0, mixed: 0, hard: 0, logged: 0, none: 0 }, pcounts = { good: 0, mixed: 0, hard: 0, logged: 0, none: 0 };
    for (const x of rows) counts[x.status || "none"]++;
    for (const x of prows) pcounts[x.status || "none"]++;
    const base = { t, rows, prows, counts, pcounts, logged: rows.filter(x => x.m).length, plogged: prows.filter(x => x.m).length };
    const extra = t.category === "respiratory" ? analyzeRespiratory(model, t, r, rows, prows) : {};
    A.trackers.push({ ...base, ...extra });
  }
  A.lines = model.lines.map(L => analyzeLine(model, L, r));
  A.spiro = analyzeSpiro(model, r);
  A.eng = analyzeEngagement(model, r);
  A.flags = collectFlags(model, A);
  return A;
}

export { TZ, DAY_MS, k2d, d2k, addDays, diffDays, dowOf, eachDay, round, clamp, TZ_FMT, LOCAL_CACHE, toLocal, localISO, DAY_ENDS_AT, MONTHS, MONTHS_LONG, DOWS, norm, mean, median, tally, dayOf, fmtDay, fmtRange, fmtTime, fmtNum, plural, nextMonth, splitCamel, COACHING_TEXT, coachingLabel, faceIndex, parseValue, blowsFromAnswer, blowFromReading, parseSchedule, MODULES, moduleFor, mergeEntries, buildModel, RANGE_OPTS, makeRange, blocksOf, trackerRows, countIf, keysIf, GINA_TEXT, GINA_STATUS, gina, analyzeRespiratory, lineSpan, slotFill, analyzeLine, analyzeSpiro, analyzeEngagement, collectFlags, analyze };
