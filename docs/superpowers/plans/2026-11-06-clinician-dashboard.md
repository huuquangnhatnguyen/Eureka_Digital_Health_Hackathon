# Clinician Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-page, no-scroll Next.js dashboard. For one asthma patient it answers four questions: how the disease is going, whether lung function is changing, whether they take their medication, and how often symptoms happen.

**Architecture:**
- `web/` is a Next.js App Router app.
- Two API routes serve the raw patient documents from `data/*.json` through `lib/store.ts`.
- The browser fetches one patient and computes everything with pure TypeScript in `lib/` (per-day facts → tiles → flags). Switching views therefore needs no round-trip.
- Charts are hand-drawn SVG React components on one shared day axis.

**Tech Stack:** Next.js (latest, App Router, TypeScript), React, plain CSS modules, and vitest (the only extra dev dependency).

**Spec:** [docs/superpowers/specs/2026-11-05-clinician-dashboard-design.md](../specs/2026-11-05-clinician-dashboard-design.md). The visual reference is [docs/superpowers/specs/2026-11-05-clinician-dashboard-mockup.html](../specs/2026-11-05-clinician-dashboard-mockup.html). Executors read both.

## Global Constraints

- **Screen fit:** everything fits one 16:9 laptop screen at 1366×768 and up with **no page scroll**. Below 1366×768 the page may scroll.
- **Data:** `data/synthetic_db.json` (array of 3 patient docs) and `data/synthetic_tracker_definition.json`. Never hard-code question IDs; look them up by type (`faceScale`, `checkbox`, `yesNo`).
- **Defaults:** period **30** days, metric **FEV1**, show-as **% of predicted**.
- **Zone bands:** Green ≥ 80, Yellow 50–80, Red < 50. Shown only in %-based views.
- **Unlogged days must never read as "fine":**
  - Unlogged days are hatched on the timeline.
  - Symptom, feeling and Bad-day counts divide by **answered days**.
  - An unlogged day counts as missed for adherence.
- **Footer copy:** `Synthetic data · demo only · not clinical advice`, plus `Data through <last day>`.
- **Header identity:** "Patient N" plus the first 6 characters of `_id`. There is no name or age in the data.
- **Dependencies:** no chart library and no Tailwind. The only addition beyond create-next-app is `vitest`.
- **No auth.** The data is synthetic.

## Review Focus

1. **A comparison window with no readings** (the 7-day "period before" for P2 can be all unlogged): the delta is `null` and the tile shows "—", never `NaN`. Test: Task 4, `lungDelta null when previous window has no readings`.
2. **A malformed URL hash** (`#p=9&d=45&m=x`): falls back to defaults per key and doesn't crash. Test: Task 6, `parseHash falls back per key`.
3. **Malformed or odd symptom answers** (invalid JSON, `"None of these "` with a trailing space): invalid JSON counts as unanswered, and "None of these" counts as no symptoms. Test: Task 3, `symptom parsing edge cases`.
4. **An unknown patient id on the API** (`/api/patients/7`, `/api/patients/abc`): returns 404 JSON. Test: Task 2, `getPatient out of range`, plus a curl step.
5. **The latest submission is blank, or answers flip within minutes:** the latest *non-blank* answer wins, and the day is marked `flip`. Test: Task 3, `latest non-blank answer wins`.

---

## File Structure

```
web/
  package.json, tsconfig.json, next.config.ts, vitest.config.ts
  lib/
    types.ts         raw document types (PatientDoc, TrackerDef, Blow…) + view types (Metric, ShowAs, Period)
    store.ts         server-only: listPatients(), getPatient(i), getTracker()
    days.ts          buildDays(doc, tracker) → Built  (per-day facts, personal best, baseline)
    metric.ts        metricValue(day, built, metric, showAs) → number | null
    summary.ts       summarize(built, view) → Summary  (windows + 4 tiles)
    flags.ts         buildFlags(built, summary, view) → Flag[]
    hash.ts          parseHash(str) / toHash(view)
    *.test.ts        vitest tests next to each module
  app/
    layout.tsx, globals.css         CSS variables (light + dark), 100vh body
    page.tsx                        renders <Dashboard/>
    Dashboard.tsx                   'use client'; state, fetch, grid
    dashboard.module.css
    api/patients/route.ts           GET list
    api/patients/[id]/route.ts      GET one
  components/
    Header.tsx, Tiles.tsx, Timeline.tsx, LungChart.tsx, Flags.tsx, DayTooltip.tsx
```

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: `web/` (via create-next-app)
- Create: `web/vitest.config.ts`
- Modify: `.claude/launch.json` (add the `web` entry)
- Modify: `.gitignore` (add `web/node_modules`, `web/.next` if create-next-app's own `web/.gitignore` doesn't cover them)

**Interfaces:**
- Produces: `npm run dev` (port 3000) and `npm test` (vitest run) in `web/`, plus the path alias `@/*` → `web/*`.

- [ ] **Step 1: Create the app.** Run from the repo root:
  `npx create-next-app@latest web --typescript --eslint --app --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --yes`
  Expected: `web/app/page.tsx` exists.
- [ ] **Step 2: Add vitest.**
  - Run `cd web && npm i -D vitest`.
  - Add the script `"test": "vitest run"`.
  - Create `vitest.config.ts` with `test.environment = 'node'` and the alias `@` → `path.resolve(__dirname)`.
- [ ] **Step 3: Replace the starter page** with a placeholder `<main>Clinician dashboard</main>`. Delete the starter CSS and SVG assets.
- [ ] **Step 4: Add the launch entry** `{ "name": "web", "runtimeExecutable": "npm", "runtimeArgs": ["--prefix", "web", "run", "dev"], "port": 3000 }` next to the existing `dashboard` entry.
- [ ] **Step 5: Verify.**
  - Start preview `web`. Expected: the page shows "Clinician dashboard".
  - Run `cd web && npx vitest run --passWithNoTests`. Expected: exits 0.
- [ ] **Step 6: Commit:** `chore: scaffold Next.js app in web/`

---

### Task 2: Data store and API routes

**Files:**
- Create: `web/lib/types.ts`, `web/lib/store.ts`, `web/app/api/patients/route.ts`, `web/app/api/patients/[id]/route.ts`
- Test: `web/lib/store.test.ts`

**Interfaces:**
- Produces in `types.ts`, matching the shapes in `data/FIELDS.md`:
  - `PatientDoc`, `DailyLog`, `MedicationAdministration`, `Medication`, `Blow` (with `fvcPlusResults`, `qualityReport`, `accepted`, `date`), `TrackerDef`.
  - `type Metric = 'fev1' | 'fev1Fvc' | 'pef'`
  - `type ShowAs = 'raw' | 'predicted' | 'best' | 'baseline'`
  - `type Period = 7 | 30 | 90`
  - `interface View { patient: number; period: Period; metric: Metric; showAs: ShowAs }`
- Produces in `store.ts` (server-only; reads `path.join(process.cwd(), '..', 'data', …)` once and caches it):
  - `listPatients(): { index: number; shortId: string; zone: string }[]` (index is 1-based)
  - `getPatient(index: number): PatientDoc | null`
  - `getTracker(): TrackerDef`
- API:
  - `GET /api/patients` → `listPatients()`
  - `GET /api/patients/[id]` → `{ patient: PatientDoc, tracker: TrackerDef }`, or `404 { error: 'Patient not found' }`

- [ ] **Step 1: Write the failing tests** in `store.test.ts`:
  ```ts
  test('lists 3 patients', () => {
    const l = listPatients();
    expect(l).toHaveLength(3);
    expect(l.map(p => p.zone)).toEqual(['Green', 'Yellow', 'Green']);
    expect(l[0]).toMatchObject({ index: 1, shortId: '10114c' });
  });
  test('getPatient out of range', () => {
    expect(getPatient(0)).toBeNull(); expect(getPatient(4)).toBeNull(); expect(getPatient(NaN)).toBeNull();
  });
  test('tracker has the four question types', () => {
    expect(getTracker().questions.map(q => q.type).sort()).toEqual(['checkbox', 'device', 'faceScale', 'yesNo']);
  });
  ```
- [ ] **Step 2: Run** `npm test -- store`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `types.ts` and `store.ts`**, then the two route handlers. The `[id]` route parses with `Number(params.id)` and returns 404 when `getPatient` gives null.
- [ ] **Step 4: Run** `npm test -- store`. Expected: PASS.
- [ ] **Step 5: Check the API** with the dev server running:
  - `curl -s localhost:3000/api/patients` → 3 items.
  - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/patients/7` → `404`.
  - `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/patients/abc` → `404`.
- [ ] **Step 6: Commit:** `feat(web): patient store and API routes`

---

### Task 3: Per-day facts (`buildDays`)

A port of `buildDays` in `dashboard/logic.js`, extended per the spec's Calculations section.

**Files:**
- Create: `web/lib/days.ts`
- Test: `web/lib/days.test.ts`

**Interfaces:**
- Consumes: `PatientDoc` and `TrackerDef` from Task 2 (tests load them via `getPatient` / `getTracker`).
- Produces:
  ```ts
  interface Day {
    day: string;                 // 'YYYY-MM-DD' (= dailyLogs[].day; blows use date.slice(0,10))
    logged: boolean;             // a dailyLogs entry exists
    am: string[]; pm: string[];  // controller dose times, split at '14:00' (time < '14:00' → am)
    ctrlCount: number;           // am.length + pm.length
    rescue: string[];            // as-needed dose times (count entries, not value)
    feel: 'Great' | 'Okay' | 'Bad' | null;
    symptoms: string[] | null;   // null = unanswered; [] = "None of these"
    school: boolean | null;
    flip: boolean;               // >1 distinct non-blank feel answer that day
    blank: number;               // blank submissions
    blows: Blow[]; okBlows: number;
    best: Record<'fev1'|'fev1PercentPredicted'|'fev1FvcPercent'|'pef'|'pefPercentPredicted', number> | null; // max over accepted blows
    coach: string[];             // qualityIndications messages
  }
  interface Built {
    days: Record<string, Day>; first: string; end: string;  // end = last day with a log or blow
    perDay: number;              // controller dosage.timing.frequency (2)
    ctrlName: string;
    personalBest: { fev1: number; pef: number };            // max over all accepted blows
    baseline: { fev1: number; pef: number } | null;         // best accepted on medicalDevices[0].baselineReadingDate
    plan: PatientDoc['asthmaTreatmentPlan'];
  }
  function buildDays(doc: PatientDoc, tracker: TrackerDef): Built
  function emptyDay(day: string): Day
  function addDays(day: string, n: number): string
  function dayRange(built: Built, endDay: string, n: number): Day[]  // n days ending at endDay, oldest first; missing → emptyDay
  ```
  - The controller is the non-archived medication with `dosage.asNeeded === false`. Rescue is `asNeeded === true`.

- [ ] **Step 1: Write the failing tests** in `days.test.ts`:
  - `P1 basics`: `b.end === '2026-11-08'`, `b.perDay === 2`, `b.baseline` is not null.
  - `every blow lands on a day`: the sum of `days[*].blows.length` equals `medicalDevices[0].baselineReadings.length`, for all 3 patients.
  - `AM/PM split`: for P1, the 2026-08-16 day has `am` = `['09:59']`, `pm` = `['19:48']` and `ctrlCount` = `2`.
  - `dayRange fills gaps`: `dayRange(b2, '2026-11-08', 90)` has length 90, and exactly 26 entries have `logged === false`.
  - `symptom parsing edge cases`: build a synthetic doc copy with one submission each of these and check:
    - `'["None of these "]'` → `[]`
    - `'not json'` → `null`
    - `'["Coughing","Wheezing"]'` → `['Coughing','Wheezing']`
  - `latest non-blank answer wins`: a day with submissions `[Bad @08:00, Great @08:03, blank @08:05]` gives `feel === 'Great'`, `flip === true` and `blank === 1`.
- [ ] **Step 2: Run** `npm test -- days`. Expected: FAIL.
- [ ] **Step 3: Implement `days.ts`.** Sort submissions by `date` and fold them in order so the last non-blank answer wins. Strip "None of these" with `/^none of these/i` after trimming.
- [ ] **Step 4: Run** `npm test -- days`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(web): per-day facts from patient docs`

---

### Task 4: Metric values, windows and the four tiles

**Files:**
- Create: `web/lib/metric.ts`, `web/lib/summary.ts`
- Test: `web/lib/summary.test.ts`

**Interfaces:**
- Consumes: `Built`, `Day`, `dayRange`, `addDays` (Task 3), `View` (Task 2).
- Produces:
  ```ts
  function metricValue(d: Day, b: Built, m: Metric, s: ShowAs): number | null
  // fev1Fvc → best.fev1FvcPercent regardless of s
  // raw → best.fev1 | best.pef;  predicted → best.*PercentPredicted
  // best → value / personalBest * 100;  baseline → value / baseline * 100 (null if no baseline)
  function isPercent(m: Metric, s: ShowAs): boolean      // false only for raw fev1/pef
  function metricLabel(m: Metric, s: ShowAs): string     // e.g. 'FEV1 % predicted', 'PEF (L/s)'

  interface Summary {
    range: Day[];                       // the period, oldest first
    cur: Day[]; prev: Day[];            // comparison windows: 7/30 → cur = range, prev = n days before;
                                        // 90 → cur = last 14 of range, prev = first 14 of range
    disease: { verdict: 'Better' | 'Stable' | 'Worse'; bad: number; badDelta: number | null; symDelta: number | null };
    lung: { delta: number | null; latest: number | null; label: string; tone: 'bad' | 'warn' | 'neutral' };
    meds: { adherence: number; am: number; pm: number; unlogged: number; tone: 'good' | 'warn' | 'bad' }; // percentages 0–100
    symptoms: { days: number; answered: number; top: [string, number][] };   // sorted desc
    rescuePerWeek: number;
  }
  function summarize(b: Built, v: View): Summary
  ```
- Rules (from the spec, values exact):
  - **adherence** = Σ min(ctrlCount, perDay) ÷ (perDay × range.length) × 100.
  - **am / pm** % = days with ≥1 dose in that slot ÷ range.length × 100.
  - **lung.delta** = mean(metricValue over `cur`, skipping nulls) − mean(over `prev`), or `null` if either side has no values.
    - Tone: `bad` if ≤ −5, `warn` if ≤ −2, otherwise `neutral`. Always `neutral` when `!isPercent`.
  - **disease:**
    - `bad` = Bad days in `range`.
    - `badDelta` = Bad days in `cur` − Bad days in `prev`, and `symDelta` the same for symptom days. Each is `null` if the `prev` window has no answered days.
    - Constants `WORSE_BAD = 2` and `WORSE_SYM = 3` sit at the top of the file.
    - Verdict: Worse if badDelta ≥ 2 or symDelta ≥ 3. Better if badDelta ≤ −2 and symDelta ≤ −3. Stable otherwise, including when either delta is null.
  - **meds.tone:** `good` ≥ 80, `warn` ≥ 50, otherwise `bad`.
  - **symptoms:** `days` = days with a non-empty symptom array, and `answered` = days with symptoms ≠ null, both within `range`.
  - **rescuePerWeek** = rescue entries in `range` ÷ range.length × 7.

- [ ] **Step 1: Write the failing tests.** `v(p, period)` builds a `View` with defaults:
  ```ts
  test('adherence over 30 days', () => {
    expect(summarize(b1, v(1,30)).meds.adherence).toBeCloseTo(90.0, 1);
    expect(summarize(b2, v(2,30)).meds.adherence).toBeCloseTo(38.3, 1);
    expect(summarize(b3, v(3,30)).meds.adherence).toBeCloseTo(81.7, 1);
  });
  test('lung tile vs previous period, FEV1 % predicted', () => {
    expect(summarize(b1, v(1,30)).lung.delta).toBeCloseTo(0.1, 0);
    expect(summarize(b2, v(2,30)).lung.delta).toBeCloseTo(-15.1, 0);
    expect(summarize(b2, v(2,30)).lung.tone).toBe('bad');
    expect(summarize(b3, v(3,30)).lung.delta).toBeCloseTo(3.5, 0);
  });
  test('90-day view compares last 14 vs first 14', () => {
    expect(summarize(b2, v(2,90)).lung.delta).toBeCloseTo(-11.5, 0);
  });
  test('rescue per week', () => { expect(summarize(b2, v(2,30)).rescuePerWeek).toBeCloseTo(2.57, 1); });
  test('raw FEV1 is never coloured', () => { expect(summarize(b2, {...v(2,30), showAs:'raw'}).lung.tone).toBe('neutral'); });
  test('lungDelta null when previous window has no readings', () => {
    // b with all blows before the window removed
    expect(summarize(stripBefore(b2, '2026-11-02'), v(2,7)).lung.delta).toBeNull();
  });
  test('metricValue modes', () => {
    const d = b1.days['2026-08-11'];
    expect(metricValue(d,b1,'fev1','baseline')).toBeCloseTo(100, 5);
    expect(metricValue(d,b1,'fev1','predicted')).toBe(d.best!.fev1PercentPredicted);
    expect(metricValue(emptyDay('2026-01-01'),b1,'pef','raw')).toBeNull();
  });
  ```
  `stripBefore` is a test helper that copies `Built` and drops the days before a date.
- [ ] **Step 2: Run** `npm test -- summary`. Expected: FAIL.
- [ ] **Step 3: Implement `metric.ts` and `summary.ts`.**
- [ ] **Step 4: Run** `npm test -- summary`. Expected: PASS. If a pinned value is off by more than 0.5, recheck the window boundaries against the spec before touching the test. The values came from the real data on 2026-11-06.
- [ ] **Step 5: Commit:** `feat(web): metric modes, comparison windows and tiles`

---

### Task 5: "Also worth knowing" flags

**Files:**
- Create: `web/lib/flags.ts`
- Test: `web/lib/flags.test.ts`

**Interfaces:**
- Consumes: `Built` (Task 3), `Summary`, `metricValue` and `isPercent` (Task 4), `View`.
- Produces:
  ```ts
  type Sev = 'critical' | 'serious' | 'warning' | 'info' | 'good';
  interface Flag { id: string; sev: Sev; title: string; detail: string; days?: string[] }
  function buildFlags(b: Built, s: Summary, v: View): Flag[]   // sorted by severity, at most 6
  ```
- Flag ids and rules (from the spec):

  | id | Severity | Fires when |
  |---|---|---|
  | `rescue` | serious | `rescuePerWeek > 2`. Detail: "Above 2/week suggests asthma is not well controlled (GINA)." |
  | `ampm` | warning | \|am − pm\| > 20. The title names the lower slot ("Evening doses missed most"). |
  | `dip` | serious | Days in `range` where the metric value is below 80 **and** Σ over the 3 prior days of max(0, perDay − ctrlCount) ≥ 2. Uses the selected metric; for `raw` it uses `predicted`. `days` lists them. |
  | `zone` | warning | The plan status ≠ the zone of the mean FEV1 % predicted over the last 3 readings (80/50 cut-offs). |
  | `school` | info | Any `school === true` in range. `days` lists them. |
  | `blows` | info | Unaccepted blows ÷ all blows in range > 0.15. Detail: the top 2 coaching messages, de-camel-cased. |
  | `unlogged` | info | `meds.unlogged > 0`. `days` lists them. |
  | `flip` | info | Any `flip` days. |
  | `expiry` | info | `plan.expiration` is less than 60 days after `b.end`. |
  | `none` | good | Only when nothing else fires: "Nothing flagged in this period". |

- [ ] **Step 1: Write the failing tests:**
  ```ts
  const ids = (p, per=30) => buildFlags(b[p], summarize(b[p], v(p,per)), v(p,per)).map(f => f.id);
  test('P1 has no serious or critical flags', () => {
    const f = buildFlags(b[1], summarize(b[1], v(1,30)), v(1,30));
    expect(f.some(x => x.sev === 'serious' || x.sev === 'critical')).toBe(false);
  });
  test('P2 flags rescue and dip-after-missed-doses', () => {
    expect(ids(2)).toEqual(expect.arrayContaining(['rescue', 'dip', 'unlogged']));
  });
  test('P3 flare is not blamed on adherence', () => { expect(ids(3, 90)).not.toContain('dip'); });
  test('P2 plan Yellow matches readings, so no zone flag', () => { expect(ids(2)).not.toContain('zone'); });
  test('at most 6, sorted by severity', () => { /* for every patient × period: length ≤ 6 and sev order non-decreasing */ });
  ```
- [ ] **Step 2: Run** `npm test -- flags`. Expected: FAIL.
- [ ] **Step 3: Implement `flags.ts`.**
- [ ] **Step 4: Run** `npm test`. Expected: all suites PASS.
- [ ] **Step 5: Commit:** `feat(web): clinician flags`

---

### Task 6: Page frame, header and URL state

**Files:**
- Create: `web/lib/hash.ts`, `web/lib/hash.test.ts`, `web/app/Dashboard.tsx`, `web/app/dashboard.module.css`, `web/components/Header.tsx`
- Modify: `web/app/page.tsx`, `web/app/layout.tsx`, `web/app/globals.css`

**Interfaces:**
- Consumes: the API (Task 2), `buildDays` (Task 3), `summarize` (Task 4), `buildFlags` (Task 5).
- Produces:
  - `parseHash(h: string): View` and `toHash(v: View): string` (format `p=2&d=30&m=fev1&s=predicted`).
  - `<Dashboard/>` holds `view`, `data: { built, summary, flags } | null` and `focus: 'disease' | 'lung' | 'meds' | 'symptoms' | null`, and passes them to the child components (Tasks 7–10).

- [ ] **Step 1: Write the failing test** `parseHash falls back per key`:
  - `parseHash('#p=9&d=45&m=x&s=raw')` → `{patient:1, period:30, metric:'fev1', showAs:'raw'}`.
  - `parseHash('')` → the defaults.
  - `toHash(parseHash('#p=2&d=7&m=pef&s=best'))` → `'p=2&d=7&m=pef&s=best'`.
  - The valid patient range is 1–3, from the list length. `parseHash` takes the max as a second argument with default 3.
- [ ] **Step 2: Run, then implement `hash.ts`, then run again.** Expected: FAIL, then PASS.
- [ ] **Step 3: Build the frame:**
  - `globals.css` holds the mockup's CSS variables, plus a `prefers-color-scheme: dark` block.
  - The page grid is `height: 100vh; grid-template-rows: 52px 112px 1fr 26px`, as in the mockup.
  - `Dashboard` reads the hash on mount, writes it on change, fetches `/api/patients` once and `/api/patients/[n]` when the patient changes, and computes `built`, `summary` and `flags` with `useMemo`.
  - `Header` shows the patient `<select>`, the zone pill, "Action plan expires …", the date range text and the 7/30/90 segmented buttons (`aria-pressed`).
  - The footer copy is exact, per Global Constraints.
  - Leave placeholder boxes for the tiles, timeline and side panel.
- [ ] **Step 4: Verify in the browser pane** (preview `web`):
  - Switching patients and periods updates the hash.
  - Reloading keeps the view.
  - `#p=9` shows Patient 1.
  - No console errors.
- [ ] **Step 5: Commit:** `feat(web): page frame, header and URL state`

---

### Task 7: Four answer tiles

**Files:**
- Create: `web/components/Tiles.tsx`
- Modify: `web/app/Dashboard.tsx`

**Interfaces:**
- Consumes: `Summary` (Task 4), `focus` / `setFocus` (Task 6).
- Produces: `<Tiles s={Summary} period={Period} focus onFocus={(k) => void} />`. Clicking a tile toggles `focus` to that tile's key.

- [ ] **Step 1: Render the four tiles** with the mockup's copy:
  - **Question labels**, exact: "How is the disease going?", "Is lung function changing?", "Taking the medication?", "How often are symptoms?"
  - **Disease:** the verdict word, with the subline "Felt Bad N days (↑/↓k vs previous) · symptom days ↑/↓k".
  - **Lung:** "↑/↓ |delta|" with "pts · {label}" (or "L" / "L/s" when raw), and the subline "Latest {latest}".
  - **Medication:** "{adherence}%" with "of controller doses", and the subline "Morning {am}% · Evening {pm}% · {unlogged} days not logged".
  - **Symptoms:** "{days}" with "of {answered} answered days", and the subline "Most: {top[0]} · {top[1]} · {top[2]}".
  - A null delta renders "—". The left border and value take their colour from `tone`, and Disease Worse/Better/Stable maps to bad/good/neutral.
- [ ] **Step 2: Verify in the browser pane:**
  - P2 at 30 days shows Medication "38%", red, and Lung "↓ 15", red.
  - P1 at 30 days shows Medication "90%", green.
  - Clicking a tile toggles its highlighted state.
- [ ] **Step 3: Commit:** `feat(web): answer tiles`

---

### Task 8: Shared timeline rows and day tooltip

**Files:**
- Create: `web/components/Timeline.tsx`, `web/components/DayTooltip.tsx`
- Modify: `web/app/Dashboard.tsx`

**Interfaces:**
- Consumes: `Summary.range`, `Built`, `View`, `focus` (Tasks 4 and 6).
- Produces: `<Timeline built s view focus lungSlot={ReactNode} />`. It measures its own size with a `ResizeObserver` and passes `{ x(i), cw, width, height }` to the lung chart through the `lungSlot` render prop: `lungSlot: (geom: { L: number; R: number; cw: number; height: number }) => ReactNode`. This keeps the lung chart and the rows on one x scale.

- [ ] **Step 1: Draw the rows in the mockup's order**, each with a left label column `L = 120px` and one column per day:
  - **MEDICATION** group: Controller AM, Controller PM, Rescue inhaler (the count is drawn on the cell if > 1).
  - **HOW THEY FEEL** group: Feeling (green/amber/red, light grey when unanswered).
  - **SYMPTOMS** group: one row per checkbox option from the tracker, minus "None of these". Order and labels come from the tracker definition.
  - Missed school.
  - Row height is `clamp(14px, (height − lungMin − axis) / rows, 20px)`, with `lungMin = 160`.
  - Unlogged days are hatched (an SVG `pattern`) in every row.
  - Axis ticks every `ceil(n / 10)` days.
- [ ] **Step 2: Focus.** When `focus` is set, rows outside that tile's group render at `opacity: .35`:
  - `meds` → medication rows
  - `symptoms` → symptom rows
  - `disease` → feeling and symptom rows
  - `lung` → the lung slot
- [ ] **Step 3: Hover.** `mousemove` over the SVG works out the day index and draws an outlined column across all rows. `DayTooltip` shows:
  - controller times with "missed" for empty slots
  - rescue times
  - feeling, symptoms
  - best FEV1 (% pred and L) and PEF %
  - "N of M blows accepted", coaching messages
  - missed school

  The tooltip is placed inside the timeline box and flips sides near the right edge. `mouseleave` hides it.
- [ ] **Step 4: Verify in the browser pane:**
  - P2 at 90 days shows 26 hatched columns.
  - Hovering any day shows its tooltip with no console errors.
  - Switching to 7 days redraws with wider cells.
- [ ] **Step 5: Commit:** `feat(web): shared timeline and day tooltip`

---

### Task 9: Lung chart and switches

**Files:**
- Create: `web/components/LungChart.tsx`
- Modify: `web/components/Timeline.tsx` (switches in the timeline header), `web/app/Dashboard.tsx`

**Interfaces:**
- Consumes: the `lungSlot` geometry (Task 8), `metricValue`, `isPercent` and `metricLabel` (Task 4), `View` and the `setView` setter (Task 6).
- Produces: `<LungChart built range view geom />`.

- [ ] **Step 1: Switches** in the timeline header:
  - Metric segmented control: FEV1 / FEV1/FVC / PEF.
  - "Show as" segmented control: Raw / % predicted / % personal best / % baseline. It is disabled (`aria-disabled`, greyed) when the metric is `fev1Fvc`.
  - Both write to `view`, and so to the URL hash.
- [ ] **Step 2: Chart:**
  - **y-axis:** 40–100+ for % views (`max(100, ceil(max / 10) * 10)`), with zone bands behind the line. Raw views use 0 to `ceil(max)` with no bands.
  - **Line:** one point per day with a value, broken at nulls (gaps, not zero). Points below 80 are amber in % views.
  - **Comparison guide:** a dashed line at the `cur`-window mean, labelled "avg {value}", over the `cur` window's x-range.
  - **Label:** `metricLabel` at top left.
- [ ] **Step 3: Verify in the browser pane:**
  - P2 at 30 days in FEV1 % predicted shows a line dropping into the Yellow band.
  - Raw shows litres with no bands.
  - Selecting FEV1/FVC disables "Show as".
  - The lung tile from Task 7 changes with the switches.
- [ ] **Step 4: Commit:** `feat(web): lung chart with metric and show-as switches`

---

### Task 10: "Also worth knowing" panel

**Files:**
- Create: `web/components/Flags.tsx`
- Modify: `web/app/Dashboard.tsx`

**Interfaces:**
- Consumes: `Flag[]` (Task 5).
- Produces: `<Flags flags={Flag[]} />`.

- [ ] **Step 1: Render the panel**, headed "Also worth knowing":
  - Each flag is a severity dot (critical red, serious orange, warning amber, info grey, good green), a bold title, and a one-line detail clipped with `text-overflow: ellipsis`.
  - The panel is fixed at 330px wide and never scrolls, because at most 6 flags exist.
- [ ] **Step 2: Verify in the browser pane:**
  - P2 at 30 days lists the rescue and dip flags first.
  - P1 shows no orange or red dots.
  - P3 at 90 days shows no "dip" flag.
- [ ] **Step 3: Commit:** `feat(web): flags panel`

---

### Task 11: Fit check and cleanup

**Files:**
- Delete: `dashboard/`, and the `dashboard` entry in `.claude/launch.json`
- Modify: `README.md` (how to run: `cd web && npm i && npm run dev`, `npm test`)

- [ ] **Step 1: Fit check.** In the browser pane, `resize_window` to 1366×768, 1440×900 and 1920×1080, in light and dark mode. At each size run `document.documentElement.scrollHeight <= innerHeight` and `scrollWidth <= innerWidth`. Expected: `true` for all three patients at 30 and 90 days. Fix row clamping or tile heights if not.
- [ ] **Step 2: Run** `cd web && npm test && npm run build`. Expected: tests pass and the build succeeds.
- [ ] **Step 3: Delete `dashboard/` and its launch entry. Update README.**
- [ ] **Step 4: Screenshot** P2 at 30 days at 1440×900 as proof.
- [ ] **Step 5: Commit:** `chore: remove old prototype, document how to run`
