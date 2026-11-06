// Self-check against facts documented in data/README.md. Run: node dashboard/check.js
const assert = require('assert');
const { buildDays, summarize } = require('./logic.js');
const raw = require('../data/sample_db_week.json');
const p = Array.isArray(raw) ? raw[0] : raw;
const b = buildDays(p);

assert.strictEqual(b.end, '2026-11-08');
assert.strictEqual(b.map['2026-11-04'].dose, false, '11-04 is a missed dose');
assert(b.map['2026-11-05'].pef < 80, '11-05 dips below 80% PEF (11-06 best is ~83%, README overstates)');
assert(b.map['2026-11-08'].pef >= 80, 'recovered by the weekend');
assert.strictEqual(p.medicalDevices[0].baselineReadings.length, Object.values(b.map).reduce((t, o) => t + o.blows.length, 0), 'every blow lands on a day');
const s = summarize(p, b, 7);
assert(s.flags.some(f => /below 80%/.test(f.text)), 'low reading flagged');
assert(s.missed.some(o => o.day === '2026-11-04'), 'missed dose listed');
console.log('ok', s.flags.map(f => `${f.sev}: ${f.text}`));
