# Clinician dashboard: one-page design

Date: 2026-11-05 · Status: draft for review (approach changed to Next.js on 2026-11-06)

## Intent

A clinician opens one patient and, at a glance on a laptop screen and without scrolling, gets the answers to four questions:

1. **How is the disease going?** From the "How are you feeling?" answers and symptoms.
2. **Is lung function changing?** From spirometry: FEV1, FEV1 % predicted, FEV1/FVC, PEF.
3. **Is the patient taking the medication?** From the daily dose logs.
4. **How often do symptoms happen?** From the daily symptom answers.

It also surfaces other signals in the data that help the clinician judge control and plan care.

## Goals, non-goals, anti-goals

- **Goals:**
  - All four answers readable in about 5 seconds.
  - Everything fits one 16:9 laptop screen (1366×768 and up) with no page scroll.
  - Works on the 3 synthetic patients in `data/synthetic_db.json`.
- **Non-goals:**
  - A multi-patient overview or triage list.
  - Editing data, auth, or a real database (for now the backend serves the JSON files).
  - Mobile layout.
  - Printing.
- **Anti-goals (a failure even if it works):**
  - The page scrolls on a laptop.
  - A headline number that can't be traced to the days behind it.
  - A quiet stretch that looks "fine" when it's really "not logged".

## Constraints

- **Data:** `data/synthetic_db.json` (array of 3 patient documents) and `data/synthetic_tracker_definition.json` (question wording and IDs). Field meanings are in `data/FIELDS.md`.
- **No name, age or height in the record.** The header shows "Patient 1/2/3" plus the short `_id`. The "predicted" values come pre-computed on each blow.
- **Hackathon demo, made-up data.** Nothing here is clinical advice. The page footer says so.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **Picked (2026-11-06)** | **Next.js (App Router, TypeScript) in `web/`, with hand-drawn SVG React components** | Frontend and backend live in one repo: API routes now, and a real database later. It needs npm and a build step. |
| Superseded | Plain HTML + vanilla JS in `dashboard/` | No installs, but it has no backend to grow into. This was the user's first pick, changed on 2026-11-06. |
| Rejected | React + Vite + Recharts | Has no backend. Chart libraries resist the tight row sizing. |
| Rejected | Streamlit / Dash | Built around scrolling pages. |

The user picked Next.js so the frontend and backend share one repo.

### How the Next.js app is set up *(my calls)*

- **Location:** `web/`, created with `create-next-app` (TypeScript, App Router, ESLint, no Tailwind). Plain CSS modules carry over the mockup's styles. The repo root keeps `data/` and the docs.
- **Backend:**
  - `GET /api/patients` returns the list: index, short id, plan zone.
  - `GET /api/patients/[id]` returns one raw patient document plus the tracker definition.
  - Both read `data/*.json` through a single `lib/store.ts`. Swapping it for Cosmos DB (MongoDB API) later touches only that file.
  - No auth, because the data is synthetic. Auth is the first thing to add if real data ever arrives.
- **Where the maths runs:** in the browser, in `lib/summary.ts`. This is a pure TypeScript port of `dashboard/logic.js` plus the calculations below. The period, metric and "show as" switches then respond instantly with no round-trip. The same module can run on the server later if needed.
- **Charts:** hand-written SVG React components (`Timeline`, `LungChart`, `Tiles`, `Flags`). There's no chart library: the shared day axis and exact row heights are easier to draw by hand than to force out of one.
- **Tests:** `vitest` (the one extra dev dependency) on `lib/summary.ts`, with the patient facts listed under Testing.
- **Old prototype:** `dashboard/` stays until the Next app shows the same view, then it's deleted. `.claude/launch.json` gains a `web` entry running `npm run dev` on port 3000.

## Layout (picked: "B · answers on top, shared timeline below")

The hi-fi visual reference is [2026-11-05-clinician-dashboard-mockup.html](2026-11-05-clinician-dashboard-mockup.html). Open it in a browser.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Patient 1 ▾] id 10114c…  ● Yellow zone  Plan exp. Jun 2027   [7d|30d|90d] │  header
├──────────────┬──────────────┬──────────────┬─────────────────────────────┤
│ DISEASE      │ LUNG FUNCTION│ MEDICATION   │ SYMPTOMS                    │  4 answer tiles
│ Worse        │ ↓ 14%        │ 58%          │ 14 / 30 days                │
│ Bad days 9 ↑6│ FEV1 %pred   │ AM 80 · PM 36│ mostly cough                │
├──────────────┴──────────────┴──────────────┴──────────┬──────────────────┤
│ Lung  [FEV1|FEV1/FVC|PEF]  show as [Raw|%pred|%best|%base]│ ALSO WORTH    │
│   ~~~~~~~ line over Green/Yellow/Red zone bands ~~~~  │ KNOWING          │
│ Dose AM   ■■■□■□■■■■…                                  │ 🔴 Rescue 4×/wk   │
│ Dose PM   ■■□□□□■□□■…                                  │ 🟡 PM doses miss. │
│ Rescue    ····▲▲·▲▲·…                                  │ 🟡 Dip after miss │
│ Feeling   ●●●●●●●●●●… (green/amber/red, grey = none)   │ ⚪ School 2 days  │
│ Cough / Wheeze / Tight chest / SOB / Activity  ■ rows │ ⚪ Blow quality   │
│ School    ·····■··■·…                                  │ ⚪ Not logged 4 d │
│           Aug 11 ─────────── date axis ───────── Nov 8 │                  │
└───────────────────────────────────────────────────────┴──────────────────┘
  footer: synthetic data · not clinical advice · data through <last day>
```

- **Page:** a CSS grid at `100vh`. Header and tiles take a fixed height, and the timeline takes the rest (`1fr`). Rows scale with the window height. Below 1366×768 the page may scroll; above it, never.
- **Shared axis:** every timeline row uses the same x scale (one column per day of the selected period).
- **Hover:** hovering a day draws a vertical guide across all rows and shows a tooltip with that day's details: doses with times, rescue uses, feeling, symptoms, best FEV1/PEF, accepted blows of total, and coaching messages.
- **Tile links:** clicking a tile highlights its rows in the timeline. *(My call, cheap to add.)*

## Controls

- **Patient switcher:** a dropdown of the 3 patients. The selection is kept in the URL hash (`#p=1&d=30`) so a reload keeps the view.
- **Period:** 7 / 30 / 90 days, default **30**, ending at the patient's last logged day. "Period before" means the same number of days immediately before the period. The data only covers 90 days, so the 90-day view has no period before. It compares the last 14 days with the first 14 days instead.
- **Lung metric:** FEV1 / FEV1/FVC / PEF. Default FEV1.
- **Show as** (applies to FEV1 and PEF): *(builder check, my call)*
  - **Raw (L or L/s):** actual litres, with no zone bands and no colouring. The tile shows the change in L.
  - **% of predicted (default):** the `*PercentPredicted` value stored on the blow.
  - **% of personal best:** the value ÷ the best value in the patient's whole history × 100.
  - **% of baseline:** the value ÷ the best accepted value on `medicalDevices[0].baselineReadingDate` × 100.
  - FEV1/FVC is already a ratio, so the switch is disabled when it's selected.
- **Zone bands:** shown behind the lung line only for %-based views: Green ≥ 80, Yellow 50–80, Red < 50.

## Calculations

All of these work per day, then over the period.

- **Day's spirometry:** the best accepted blow (`accepted: true`) for each metric, the same as `logic.js` today. Days with no accepted blow show a gap, not a zero.
- **Day's survey answers:** the latest non-blank submission wins for each question. Blank submissions (`responses: []`) are ignored. Question IDs are looked up by type (`faceScale`, `checkbox`, `yesNo`) in the tracker definition, not hard-coded. "None of these" counts as no symptoms. A symptom row shows grey when the question wasn't answered that day.
- **Controller adherence:** doses logged ÷ doses expected, where expected = `frequency` × days in the period (2/day for the synthetic controller). A dose counts as **AM** if its time is before 14:00 and **PM** otherwise. A day with nothing logged at all counts as missed in the adherence number, and it also feeds the "not logged" flag.
- **Rescue use:** the number of as-needed (`asNeeded: true`) log entries, not the sum of `value` (which is puffs), shown per week. This matches how GINA counts uses. *(Builder check, my call.)*
- **Missed-dose day:** a day with fewer controller doses than prescribed. *(Builder check, my call.)*
- **Denominators:** symptom, Bad-day and feeling counts divide by **answered days**, not by all days. Unlogged days are reported separately, so a gap never reads as "symptom-free". *(Builder check, my call.)*

**Tiles:**
- **Disease:**
  - "Worse" if, compared with the period before, Bad days go up by ≥ 2 **or** symptom days go up by ≥ 3.
  - "Better" if Bad days go down by ≥ 2 **and** symptom days go down by ≥ 3.
  - "Stable" otherwise.
  - Subline: Bad-day count and its change.
  - *(My call. The thresholds are constants at the top of the file.)*
- **Lung function:** the mean of the selected metric over this period minus its mean over the period before, shown as ↑/↓ points. For 90 days it's the last 14 days against the first 14 (user's choice, 2026-11-05). On the real data, FEV1 % predicted at 30 days gives P1 +0.1, **P2 −15.1** and P3 +3.5. Colour: red at ≤ −5, amber at −5 to −2, otherwise neutral. Subline: the metric name and the latest value.
- **Medication:** adherence %, coloured green at ≥ 80%, amber at 50–80%, red below 50%. Subline: AM % · PM %.
- **Symptoms:** days with any symptom ÷ days the symptom question was answered (see Denominators). Subline: the most common symptom.

**"Also worth knowing" flags:** these replace the old `logic.js` flags. The old adherence, FEV1-trend and Bad-day flags are dropped because the tiles now show them. The old "below 80%" flag is folded into the dip flag and the zone bands. Plan expiry stays as *info* when it's under 60 days away. *(Builder check, my call.)* Flags are sorted by severity (critical > serious > warning > info). Show at most 6, one line each:
- **Rescue inhaler:** average uses per week above 2 is *serious*. That's the GINA "not well controlled" signal.
- **Morning vs evening:** AM and PM adherence more than 20 points apart is a *warning* ("evening doses missed most").
- **Dips after missed doses:** the selected metric falls below 80% after **2 or more controller doses were missed in the 3 days before**. This is *serious*. The rule is stricter than the old `logic.js` rule, so one missed dose doesn't pin an adherent patient's flare (Patient 3, 09-16) on adherence. *(Builder check, my call.)*
- **Plan zone mismatch:** an action-plan zone that doesn't match recent readings is a *warning*. This is the existing rule.
- **Missed school:** any days with `yesNo` = true is *info*, giving the count.
- **Blow quality:** more than 15% of blows not accepted is *info*, with the top coaching messages. This is the existing rule.
- **Not logged:** days with no log at all are *info*, giving the count.
- **Changed answers:** answers changed within minutes on any days are *info*. This is the existing rule.
- **Nothing to report:** if no flag fires, show "Nothing flagged in this period" as *good*.

## Build parts (in order, each one demoable)

0. **Scaffold:** `web/` via create-next-app, the `web` launch entry, and a placeholder page.
1. **Backend + data layer:**
   - `lib/store.ts` and the two API routes.
   - `lib/summary.ts`, ported from `logic.js`: question lookup by type, AM/PM doses, rescue use, missed school, the "show as" modes and the previous-period comparisons.
   - vitest tests for the patient facts below.
2. **Page frame + header:** the 100vh grid, patient switcher, period buttons, URL hash, zone pill, footer.
3. **Four answer tiles.**
4. **Shared timeline:** axis, dose rows, rescue, feeling, symptom rows, school, plus the hover guide and tooltip.
5. **Lung row + switches:** line chart, zone bands, metric and "show as" switches, gaps.
6. **"Also worth knowing" panel.**
7. **Fit check + cleanup:** confirm there's no scroll at 1366×768, 1440×900 and 1920×1080, in light and dark mode. Then delete `dashboard/`.

## Testing

`npm test` (vitest) checks `lib/summary.ts` against the synthetic patients' known shapes from `data/README.md`:
- **Patient 1 (adherent, well controlled):** adherence ≥ 80%, and no serious flags.
- **Patient 2 (poor adherence, drifting to Yellow):** adherence < 80%, the 30-day lung tile is about −15, and the zone is Yellow.
- **Patient 3 (one flare, then recovery):** a dip below 80% in the 90-day view, a recovered latest value, and **no** "dip after missed doses" flag.

The API routes are checked with one request each, and the UI by eye in the browser pane at the three sizes in part 7.

## Left to the builder

- Exact colours, fonts and spacing (start from the mockup's palette; add a dark mode).
- Tooltip styling, axis tick density, and how the tile highlight looks.
- Whether the old `sample_db_week.json` view stays reachable. Default: the dashboard loads only `synthetic_db.json`.
