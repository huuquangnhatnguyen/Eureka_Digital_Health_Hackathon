// Data for the Vitals tab (and later Medications), ported from the HTML's vitalWorkspace overrides.
// A.trackers must already be limited to the department's trackers; raw = the API patient record.

/** Daily logs in the selected range, newest first. */
const logsIn = (raw, A) => (raw.dailyLogs || []).filter(l => l.day >= A.r.start && l.day <= A.r.end).reverse();
const inRange = (A, iso) => iso.slice(0, 10) >= A.r.start && iso.slice(0, 10) <= A.r.end;

/** @returns {any} */
export function vitalsData(raw, A) {
  const feeling = new Map(), symptoms = new Map(), entries = [];
  for (const T of A.trackers) {
    for (const r of T.rows) {
      if (!r.m) continue;
      for (const q of T.t.questions) {
        const v = r.m[q.id];
        if (q.role === "feeling" && v != null) feeling.set(v, (feeling.get(v) || 0) + 1);
        if (q.role === "symptoms" && Array.isArray(v)) for (const s of v) symptoms.set(s, (symptoms.get(s) || 0) + 1);
      }
    }
    // Every non-device answer, as the "Surveys" table.
    for (const q of T.t.questions) {
      if (q.type === "device") continue;
      for (const r of T.rows) {
        const v = r.m?.[q.id];
        if (v == null) continue;
        entries.push({ date: r.k, tracker: T.t.name, label: q.short || q.text, value: Array.isArray(v) ? v.join(", ") || "None" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v), unit: q.unit || "" });
      }
    }
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));
  const activity = logsIn(raw, A).map(l => [l.day, (l.trackerResponses || []).length, (l.trackerResponses || []).reduce((n, t) => n + (t.responses || []).filter(q => q.value !== "" && q.value != null).length, 0)]);
  const badges = (raw.earnedTrackerBadges || []).filter(b => inRange(A, b.date)).map(b => [b.date.slice(0, 10), b.badgeName]);
  return { feeling: ["Great", "Okay", "Bad"].map(label => [label, feeling.get(label) || 0]), symptoms: [...symptoms], entries, activity, badges };
}

/** Table cell text, as the original's dbValue(). */
export function dbValue(v) {
  return v == null ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "number" ? Number(v.toFixed(3)).toLocaleString() : typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** Medications tab: stat tiles, plan rows, daily log counts and the raw dose tables. Uses every medicine, not just the department's. */
export function medsData(raw, A) {
  const daily = A.lines.filter(x => x.kind === "daily"), logged = daily.reduce((n, x) => n + (x.takenActive || 0), 0), due = daily.reduce((n, x) => n + (x.dueActive || 0), 0);
  const logs = logsIn(raw, A); // newest first
  return {
    stats: [
      ["Medications in this period", String(A.lines.length), "Scheduled and as-needed medications"],
      ["Scheduled doses logged", due ? Math.round(logged / due * 100) + "%" : "—", `${logged} of ${due} doses on days with app entries`],
      ["As-needed medications", String(A.lines.filter(x => x.kind === "prn").length), "Usage appears in the medication details below"]
    ],
    plan: A.lines.map(x => ({ name: x.L.name, schedule: x.L.schedule.text, dose: x.L.dosageText || "Not specified", type: x.kind === "prn" ? "As needed" : x.kind === "daily" ? "Daily" : "Periodic" })),
    trend: [...logs].reverse().map(l => ({ date: l.day, value: (l.medicationAdministrations || []).length })),
    doses: logs.flatMap(l => (l.medicationAdministrations || []).map(d => [l.day, d.time, d.name, d.value]).reverse()),
    status: logs.map(l => [l.day, l.allMedicationsAdministered]),
    badges: (raw.earnedMedicationBadges || []).filter(b => inRange(A, b.date)).map(b => [b.date.slice(0, 10), b.badgeName])
  };
}

/** "No data Oct 22 – Oct 25", or a count when the gaps are scattered. fmt formats a day key. */
export function noDataText(keys, fmt) {
  const runs = [];
  for (const k of keys) {
    const last = runs.at(-1);
    if (last && Date.parse(k) - Date.parse(last.end) === 86400000) { last.end = k; last.n++; } else runs.push({ start: k, end: k, n: 1 });
  }
  if (!runs.length) return "";
  return runs.length <= 2 ? `No data ${runs.map(g => (g.n === 1 ? fmt(g.start) : `${fmt(g.start)} – ${fmt(g.end)}`)).join(" and ")}` : `No data on ${keys.length} days`;
}
