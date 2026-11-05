# Field reference: patient record export

This file explains every column in the patient record spreadsheet (Screenshot 1) and the matching field in [`sample_db.json`](sample_db.json). The screenshot cuts off many headings, so some names are worked out rather than read.

## How to read the confidence column

| Mark | Meaning |
|---|---|
| ✓ | Heading visible, or the meaning is obvious |
| ● | Checked by formula on all 6 blows (to 2–4 decimals) |
| ○ | Reasonable guess backed by the device manual or physiology |
| ? | Unknown |

Percentages are our own judgement, not measured. The meaning of a column is more certain than its exact heading wording; we rate the exact wording at about 50%.

**Evidence used**
- **A: formula.** For example FEV1 ÷ FVC × 100 = the ratio column, and measured ÷ predicted × 100 = the % predicted column, on every blow.
- **B: Spirobank Smart user manual** (MIR, Rev 2.4, [PDF](https://henrotech.be/sites/default/files/product/manual/SpirobankSmart_EN_REV.2.4_0.pdf)). It lists FEV1, PEF, FEV6, FEF2575 and FEV1/FVC, and says predicted values come from the GLI-2012 equations (Quanjer, Stanojevic, Stocks, Cole).
- **C: physiology.** For example FEV6 can't be larger than FVC, and a value that's identical on every blow can't be a breath measurement.
- **Standards:**
  - ATS/ERS 2019 spirometry standard ([PMC6794117](https://pmc.ncbi.nlm.nih.gov/articles/PMC6794117)) defines the measurements and blow-quality rules.
  - GLI-2012 ([doi:10.1183/09031936.00080312](https://doi.org/10.1183/09031936.00080312)) is the source of predicted values.
  - ERS/ATS 2022 ([doi:10.1183/13993003.01499-2021](https://doi.org/10.1183/13993003.01499-2021)) covers interpretation.

## How the tables fit together

The spreadsheet is a flattened JSON document. Each nested list becomes its own table, and child rows repeat the parent's columns so you can link them back.

```
patient
├─ dailyLogs[]                       one per day
│   ├─ medicationAdministrations[]   one per dose taken   → table "DAILY LOGS — MEDICATION ADMINISTRATIONS"
│   └─ trackerResponses[]            one per questionnaire submission (answers only)
├─ medications[]                     one per medicine set up → table "MEDICATIONS"
├─ medicalDevices[]                  one per paired device   → table "MEDICAL DEVICES"
│   └─ baselineReadings[]            one per blow            → table "… BASELINE READINGS"
│       └─ qualityReport.qualityIndications[]  one per message → table "… QUALITY REPORT — QUALITY INDICATIONS"
├─ asthmaTreatmentPlan               (not in the screenshot)
├─ earnedMedicationBadges[]          (empty)
└─ earnedTrackerBadges[]             one per badge → table "EARNED TRACKER BADGES"
```

Row counts in the sample: 1 device, 6 blows, and 7 quality messages, because blow 3 has two.

## Daily logs: medication administrations

One row per dose the patient marked as taken.

| Column (full name, guessed) | JSON field | Meaning | Example | Conf. |
|---|---|---|---|---|
| Day | `dailyLogs[].day` | Calendar day (local) | 2025-03-28 | ✓ 99% |
| All Medications Administered | `dailyLogs[].allMedicationsAdministered` | TRUE if every scheduled dose that day was logged | FALSE | ✓ 95% |
| Medication Administrations / ID | `…medicationAdministrations[].id` | The medicine, linked to `medications[].id` (screenshot shows only the start) | 4aec1b37… | ✓ 95% |
| Medication Administrations / Time | `….time` | Local time the dose was logged | 12:47 | ✓ 95% |
| Medication Administrations / Name | `….name` | Medicine name, copied from the medication | Dulera 2 | ✓ 99% |
| Medication Administrations / Value | `….value` | Number of doses | 1 | ✓ 90% |

The `Medication Administrations /` prefix is guessed (about 70%).

## Medications

One row per medicine the patient has set up, including archived ones.

| Column (full name, guessed) | JSON field | Meaning | Example | Conf. |
|---|---|---|---|---|
| ID | `medications[].id` | Unique ID | 4aec1b37-c83a-… | ✓ 99% |
| Dosage / Timing / Period Unit | `dosage.timing.periodUnit` | Schedule unit | Daily | ✓ 99% |
| Dosage / Timing / Frequency | `dosage.timing.frequency` | Doses per period | 1 | ○ 75% |
| Dosage / Timing / Period | `dosage.timing.period` | Length of the period | 5 | ○ 75% (could be swapped with Frequency) |
| Dosage / As Needed | `dosage.asNeeded` | Taken only when needed | TRUE | ○ 80% |
| How Often | `howOften` | Display text for the schedule | As Needed | ✓ 99% |
| Icon | `icon` | App icon (Dulera is really an inhaler) | Capsule | ✓ 99% |
| Name | `name` | Medicine name | Excedrin | ✓ 99% |
| Related Condition | `relatedCondition` | Linked tracker (cut off in the screenshot) | Cerebral P… | ○ 80% |
| Archived | `archived` | No longer active | TRUE | ✓ 99% |
| Index | `index` | Display order | 2 | ✓ 90% |

The dosage fields follow the FHIR `Dosage.timing.repeat` pattern (`frequency`, `period`, `periodUnit`) plus `asNeeded`. That's why we rate them at 75–80%.

## Medical devices

One row per paired device. Daily use does **not** add rows here. These columns are also repeated at the start of both reading tables.

| Column | JSON field | Meaning | Example | Conf. |
|---|---|---|---|---|
| Protocol | `medicalDevices[].protocol` | Device protocol version | 9 | ✓ 90% |
| Address | `address` | Bluetooth identifier (iOS format) | AAF17BF4-… | ✓ 95% |
| Boot Id | `bootId` | Device boot / model code | SM | ✓ 80% |
| Serial Number | `serialNumber` | Device serial | Z125775 | ✓ 99% |
| Device Type | `deviceType` | Device type code | 0 | ✓ 90% |
| ATS Standard | `atsStandard` | ATS/ERS standard setting | (empty) | ✓ 85% |
| Name | `name` | Device model | Spirobank | ✓ 99% |
| Advertised Name | `advertisedName` | Bluetooth broadcast name | SM-009-Z125775 | ✓ 95% |
| Baseline Reading Date | `baselineReadingDate` | Date of the baseline test | 2026-06-24 | ✓ 95% |

## Medical devices: baseline readings

One row per **blow**. One test session is several blows (3 to 8), and the session result is the best acceptable blow, not the average (ATS/ERS 2019). The device columns above come first, then:

| # | Column (full name, guessed) | JSON field | Plain meaning | Unit | Example | Conf. | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Baseline Readings / Accepted | `accepted` | Blow kept by the app. **Not** a quality grade. | bool | FALSE | ✓ 90% | |
| 2 | Baseline Readings / Quality Report / Quality | `qualityReport.quality` | Device quality grade | text | NotAcceptable | ○ 85% | Obvious word ending |
| 3 | FVC Plus Results / ??? | `fvcPlusResults.unlabeled1` | Unknown. The same on 5 of 6 blows, so probably an ID or setting, not a breath value. | ? | 16879 | ? | C |
| 4 | FVC Plus Results / PEF % Predicted | `pefPercentPredicted` | Peak flow vs expected | % | 23.36 | ● 97% | A |
| 5 | FVC Plus Results / FEV1 % Predicted | `fev1PercentPredicted` | First-second air vs expected | % | 47.94 | ● 97% | A |
| 6 | FVC Plus Results / FEV1 Predicted | `fev1Predicted` | Expected FEV1 for age, sex and height | L | 4.171884 | ● 97% | A, B, C |
| 7 | FVC Plus Results / FEV6 | `fev6` | Air blown out in the first 6 s | L | 5.39 | ○ 85% | B, C (always ≤ FVC) |
| 8 | FVC Plus Results / FVC Predicted | `fvcPredicted` | Expected FVC | L | 5.376757 | ● 97% | A, B, C |
| 9 | FVC Plus Results / ??? | `fvcPlusResults.unlabeled2` | Unknown, always 0. Probably not VEXT, because the hesitant blows would give a large VEXT. Possibly an error or flag field. | ? | 0 | ? | C |
| 10 | FVC Plus Results / FVC % Predicted | `fvcPercentPredicted` | Total air vs expected | % | 100.25 | ● 97% | A |
| 11 | FVC Plus Results / FEV1 | `fev1` | Air blown out in the first second | L | 2.00 | ● 98% | A, B |
| 12 | FVC Plus Results / PEF Predicted | `pefPredicted` | Expected peak flow | L/s | 9.544466 | ● 97% | A, B, C |
| 13 | FVC Plus Results / FEV1/FVC | `fev1FvcPercent` | Share blown out in the first second. Low means narrowed airways. | % | 37.1 | ● 98% | A, B |
| 14 | FVC Plus Results / PEF | `pef` | Fastest flow at the start of the blow | L/s | 2.23 | ● 97% | A, B |
| 15 | FVC Plus Results / FEF25-75 | `fef2575` | Average flow over the middle half of the blow | L/s | 1.37 | ○ 85% | B, C (always < PEF) |
| 16 | FVC Plus Results / FVC | `fvc` | Total air blown out | L | 5.39 | ✓ 99% | Visible heading |

- **"FVC Plus Results"** is the device's test name. It comes from the one full heading you can see, `FVC Plus Results / FVC (L)`.
- **PEF unit:** we believe it's L/s (90%). 9.5 is a normal adult predicted PEF in L/s, while 9.5 L/min would be impossible. The manual's spec table quotes L/min, so the app must convert.
- **Predicted values** are the same on every blow, because they depend only on the patient, not the blow.
- **Reading a result:** % predicted of about 80% or more is generally normal. For FEV1/FVC, the 2022 standard uses the lower limit of normal (LLN) rather than a fixed 70%.

## Medical devices: baseline readings: quality indications

One row per coaching message. A blow with two messages appears twice, so blow 3 makes 7 rows from 6 blows. It has all the reading columns above, plus:

| Column (full name, guessed) | JSON field | Meaning | Example | Conf. |
|---|---|---|---|---|
| Quality Report / Quality Indications / Message | `qualityReport.qualityIndications[].message` | What went wrong | BlowOutLonger, BlowOutFaster | ○ 70% (cut off at "BlowOutL…" / "BlowOutF…") |
| Quality Report / Quality Indications / Instructions | `….instructions` | What to tell the patient | KeepGoingUntilCompletelyEmpty | ✓ 95% |

Each message pairs with its instruction:
- BlowOutLonger → KeepGoingUntilCompletelyEmpty
- BlowOutFaster → BlastOutImmediatelyWhenCompletelyFull

## Earned tracker badges

| Column | JSON field | Meaning | Example | Conf. |
|---|---|---|---|---|
| Badge Name | `earnedTrackerBadges[].badgeName` | Reward for using the app | TrackerBadge10 | ✓ 99% |
| Date | `earnedTrackerBadges[].date` | When it was earned, in UTC | 2026-03-11T16:48:59.546Z | ✓ 99% |

## Time zones

- Medication `time` is **local** time with no time zone.
- Badge and tracker `date` values are **UTC**.
- TrackerBadge10 (16:48 UTC) appeared 1 second after a tracker submission on the same day the Dulera dose was logged at 12:47 local. That suggests the patient was on UTC−4.

## Still open

Answering these would replace the guesses above:
1. **The full headings.** Open the original .xlsx or .csv and click a header cell; the formula bar shows the full text.
2. **Columns 3 and 9.** Ask the organisers, or check the MIR SDK documentation.
3. **Which dosage field is frequency and which is period.**
