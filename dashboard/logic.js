// Turns one SMART@Home patient document into per-day facts + flags. Used by index.html and check.js.
const Q_FEEL = 'e1a9f3c2-7b4d-4e6a-8c5f-0d2b9a7e3f18';
const Q_SYMP = '5c8d2e7f-1a3b-4f9c-b6e0-7a4d1c9e2b53';
// NAEPP-style action-plan zones, applied to % predicted (no personal-best PEF in the record).
const ZONES = [{ min: 80, name: 'Green' }, { min: 50, name: 'Yellow' }, { min: 0, name: 'Red' }];
const zoneOf = v => ZONES.find(z => v >= z.min).name;

const isoDay = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const fmt = (s, wd) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(wd && { weekday: 'short' }) });
const empty = day => ({ day, logged: false, dose: false, doseTimes: [], prn: [], feel: null, symptoms: null, subs: 0, blank: 0, flip: false, blows: [], ok: 0, fev1: null, pef: null, coach: [] });

function buildDays(p) {
  const controller = p.medications.filter(m => !m.archived && m.dosage?.timing?.periodUnit === 'Daily');
  const ctrlIds = new Set(controller.map(m => m.id));
  const map = {};
  const get = day => (map[day] ??= empty(day));
  for (const l of p.dailyLogs) {
    const o = get(l.day);
    o.logged = true;
    for (const m of l.medicationAdministrations || []) {
      if (ctrlIds.has(m.id)) { o.dose = true; o.doseTimes.push(m.time); } else o.prn.push(`${m.name} ${m.time}`);
    }
    const subs = [...(l.trackerResponses || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
    o.subs = subs.length;
    const feels = new Set();
    for (const s of subs) {
      if (!s.responses?.length) { o.blank++; continue; }
      for (const r of s.responses) { // latest non-blank answer per question wins
        if (r.questionId === Q_FEEL) { o.feel = r.value; feels.add(r.value); }
        if (r.questionId === Q_SYMP) {
          try { o.symptoms = JSON.parse(r.value).map(x => x.trim()).filter(x => x && !/^none of these/i.test(x)); } catch { /* malformed list: leave as unanswered */ }
        }
      }
    }
    o.flip = feels.size > 1;
  }
  for (const b of p.medicalDevices?.[0]?.baselineReadings || []) if (b.date) get(b.date.slice(0, 10)).blows.push(b);
  for (const o of Object.values(map)) {
    const ok = o.blows.filter(b => b.accepted);
    const best = k => (ok.length ? Math.max(...ok.map(b => b.fvcPlusResults[k])) : null);
    Object.assign(o, { ok: ok.length, fev1: best('fev1PercentPredicted'), pef: best('pefPercentPredicted'), fev1L: best('fev1'), pefL: best('pef') });
    o.coach = o.blows.flatMap(b => b.qualityReport?.qualityIndications?.map(q => q.message) || []);
  }
  return { map, controller, end: Object.keys(map).sort().at(-1) };
}

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const range = (map, end, n) => Array.from({ length: n }, (_, i) => map[addDays(end, i - n + 1)] || empty(addDays(end, i - n + 1)));
const pct = v => `${Math.round(v)}%`;
const lowest = o => Math.min(o.fev1, o.pef);

function summarize(p, built, n) {
  const { map, controller, end } = built;
  const days = range(map, end, n);
  const ctrlName = controller.map(m => m.name).join(', ') || 'controller';
  const readings = days.filter(o => o.fev1 != null);
  const surveyed = days.filter(o => o.feel);
  const blows = days.flatMap(o => o.blows);
  const symCount = {};
  for (const o of days) for (const s of o.symptoms || []) symCount[s] = (symCount[s] || 0) + 1;
  const recent = mean(range(map, end, 7).filter(o => o.fev1 != null).map(o => o.fev1));
  const prior = mean(range(map, addDays(end, -7), 30).filter(o => o.fev1 != null).map(o => o.fev1));
  const s = {
    days, ctrlName, readings, surveyed, symCount,
    latest: readings.at(-1),
    adherence: days.filter(o => o.dose).length / days.length,
    missed: days.filter(o => !o.dose),
    bad: surveyed.filter(o => o.feel === 'Bad'),
    blowsTotal: blows.length, blowsOk: blows.filter(b => b.accepted).length,
    trend: recent != null && prior != null ? recent - prior : null,
    low: readings.filter(o => lowest(o) < 80),
    flips: days.filter(o => o.flip), blanks: days.reduce((t, o) => t + o.blank, 0),
  };

  const f = []; // {sev: critical|serious|warning|info|good, text}
  if (s.low.length) {
    const worst = s.low.reduce((a, b) => (lowest(a) < lowest(b) ? a : b));
    const sym = [...new Set(s.low.flatMap(o => o.symptoms || []))];
    f.push({ sev: lowest(worst) < 50 ? 'critical' : 'serious', text: `Lung function below 80% predicted on ${s.low.length} day(s): ${s.low.map(o => fmt(o.day)).join(', ')} (lowest ${pct(lowest(worst))}, ${zoneOf(lowest(worst))} zone)${sym.length ? `, with ${sym.join(', ').toLowerCase()}` : ''}.` });
    const afterMiss = s.low.filter(o => [1, 2].some(k => !(map[addDays(o.day, -k)]?.dose)));
    if (afterMiss.length) f.push({ sev: 'serious', text: `${afterMiss.length} of ${s.low.length} low day(s) came within 2 days of a missed ${ctrlName} dose.` });
    if (p.asthmaTreatmentPlan?.status === 'Green') f.push({ sev: 'warning', text: `Action plan is set to Green, but readings in this period reached the ${zoneOf(lowest(worst))} zone. Check that the plan still fits.` });
  }
  if (s.adherence < 0.8) f.push({ sev: 'serious', text: `${ctrlName} logged on ${pct(s.adherence * 100)} of days (${s.missed.length} of ${days.length} missed or not logged).` });
  else if (s.missed.length) f.push({ sev: 'warning', text: `${ctrlName} not logged on ${s.missed.length > 4 ? `${s.missed.length} days` : s.missed.map(o => fmt(o.day)).join(', ')}.` });
  if (s.trend != null && s.trend <= -5) f.push({ sev: 'warning', text: `FEV1 is ${pct(-s.trend)} pts lower over the last 7 days than the 30 days before.` });
  if (s.bad.length) {
    const top = Object.entries(symCount).sort((a, b) => b[1] - a[1])[0];
    f.push({ sev: 'warning', text: `Felt "Bad" on ${s.bad.length} of ${surveyed.length} surveyed days${top ? `. Most reported symptom: ${top[0]} (${top[1]} day${top[1] > 1 ? "s" : ""})` : ''}.` });
  }
  if (s.blowsTotal && 1 - s.blowsOk / s.blowsTotal > 0.15) {
    const coach = Object.entries(days.flatMap(o => o.coach).reduce((a, m) => ((a[m] = (a[m] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).map(([m]) => m.replace(/([A-Z])/g, ' $1').trim().toLowerCase());
    f.push({ sev: 'info', text: `${pct((1 - s.blowsOk / s.blowsTotal) * 100)} of spirometer blows not acceptable. Technique coaching: ${coach.slice(0, 2).join(', ')}.` });
  }
  if (s.flips.length) f.push({ sev: 'info', text: `Answer changed within minutes on ${s.flips.length} day(s). Showing the latest answer; ${s.blanks} blank submissions ignored.` });
  const exp = p.asthmaTreatmentPlan?.expiration;
  if (exp && (new Date(exp) - new Date(end)) / 864e5 < 60) f.push({ sev: 'info', text: `Action plan expires ${fmt(exp.slice(0, 10))}.` });
  if (!f.length) f.push({ sev: 'good', text: 'Nothing flagged in this period.' });
  const order = ['critical', 'serious', 'warning', 'info', 'good'];
  s.flags = f.sort((a, b) => order.indexOf(a.sev) - order.indexOf(b.sev));
  return s;
}

if (typeof module !== 'undefined') module.exports = { buildDays, summarize, zoneOf, addDays };
