# Sample data

Made-up data in the shape the hackathon brief describes in section 3. It contains no real patient data.

For what every column means, with confidence and evidence for each guessed name, see [FIELDS.md](FIELDS.md).

- `synthetic_db.json` and `synthetic_tracker_definition.json`: **fully made-up test data, not based on any record**. Use these for building and demoing the clinician view.
  - **Patients:** 5 asthma patients over 90 days (3 tidy profiles, then 2 messier ones described below) (2026-08-11 to 2026-11-08), with the same structure as `sample_db.json`:
    - adherent and well controlled
    - poor adherence, with lung function drifting down to the Yellow zone
    - adherent, with one flare and recovery
  - **Medications:** a controller taken twice a day and a rescue inhaler.
  - **Tracker questions:** mood, symptoms, spirometry and missed school. The spirometry answer is filled in.
  - **Spirometry:** mostly good-quality blows. Each session has 3 accepted blows with the top two FEV1 within 0.15 L, and about 15% of sessions start with one rejected blow.
  - **Badges and plan:** tracker badges at 5-, 10- and 30-day streaks. `asthmaTreatmentPlan` is worked out from the latest best PEF: Green at 80% or more of predicted, Yellow at 50–80%, Red below 50%.
  - **More chronic conditions, all with a home device:** one file pair per disease, each holding the same 3 profiles in the same order, then 2 messier patients (below). The web app numbers them 6–20 in this order:

    | Disease | Home device | Patients | Tracker |
    |---|---|---|---|
    | Cystic fibrosis | Spirometer (Spirobank, as for asthma) | `synthetic_cf_db.json` | `synthetic_cf_tracker_definition.json` |
    | Type 1 diabetes | Glucose meter | `synthetic_t1d_db.json` | `synthetic_t1d_tracker_definition.json` |
    | Congenital heart disease | Pulse oximeter | `synthetic_heart_db.json` | `synthetic_heart_tracker_definition.json` |

    - **Same shape as asthma:** same top-level fields, `dailyLogs[]`, `medications[]` (one daily, one as-needed) and badges. The tracker has asthma's 4 question types (`device`, `faceScale`, `checkbox`, `yesNo`), and each patient's submissions use the `trackerId` from their disease's tracker file.
    - **Device:** one `medicalDevices[]` record with the same fields as the Spirobank. Its readings go in `baselineReadings[]` with the same `date`, `accepted` and `qualityReport`, plus one results object:
      - cystic fibrosis: `fvcPlusResults`, exactly as for asthma, with lower lung function (about 86% of predicted when well)
      - type 1 diabetes: `glucoseResults` (`glucose` in mg/dL, `unit`, `mealContext`), with up to 4 checks a day (before breakfast, before lunch, after school, before dinner). `glucose` is `null` on a failed strip, which is re-tested a minute later.
      - heart: `oximetryResults` (`spo2`, `pulse`, `perfusionIndex`), with one morning reading. About 15% of days start with a rejected reading (poor signal).
    - **The `device` answer** holds that morning's result, as asthma's does: `{"fev1","fvc","pef","accepted"}`, `{"glucose","accepted"}` or `{"spo2","pulse","accepted"}`.
    - **Answers agree with the reading.** Mood, symptoms, missed school and as-needed doses follow from how bad the day's reading is. For diabetes there is one correction-insulin dose per reading over 250 mg/dL, and "Shakiness" only on days with a reading under 70. Warning signs (coughing up blood, fever, nausea or vomiting, blue lips or fingers, fainting) only appear on bad days, never in the well-controlled patient. Each condition has its own flare and drift dates.
    - `asthmaTreatmentPlan` is `null`, because the Green/Yellow/Red zone is asthma-only.
    - **Guesses:** the glucose and oximetry field names, `deviceType` 1 and 2, `bootId` `GM` and `PO`, and `protocol: null` (its meaning is unknown).
  - **2 messier patients per disease (patients 4–5 in each file, so 4–5, 9–10, 14–15, 19–20 in the app):** made to look like real users, not perfect answers. They are made after all 12 tidy patients, so the tidy ones are unchanged. Each has its own story:

    | Disease | Patient 4 | Patient 5 |
    |---|---|---|
    | Asthma | teen whose tracking and doses fade over the term, stoic, poor blow technique | 9-day holiday gap, autumn flare, anxious, often logs in the evening |
    | Cystic fibrosis | joined 18 days in, 6-day hospital stay (no logs) during a flare | weekends off, often skips the spirometer |
    | Type 1 diabetes | teen who skips checks, under-reports, logs only half the correction doses | tight control with frequent lows, parent logs everything, a short sick spell |
    | Heart | stable but logs only 2–3 days a week | slowly getting worse despite taking meds, skips logging on bad days |

    - What makes them messy: days not logged at all, questions skipped, days with only a dose logged, mood that doesn't match the reading, a second submission that is blank or changes the mood answer, "None of these" ticked next to a symptom, doses logged later at a round time, more rejected device readings, and spirometry sessions that stop after 1–2 good blows.
    - The tidy-patient rules (one correction dose per high, warning signs only on bad days, 3 repeatable blows) are only checked for the tidy patients.
  - **Re-generating:** run `python data/generate_synthetic_db.py`. It writes all 4 file pairs and uses a fixed seed, so it gives the same files every time.
  - **Checking:** run `python data/test_synthetic_db.py`. It checks the structure, the ID links, value formats, each device's readings, the spirometry math, repeatability, adherence and the plan status.
- `sample_db.json`: one patient document, in the form of a Cosmos DB (MongoDB API) collection export.
- `sample_entry.json`: one tracker submission, as it would be added to `dailyLogs[].trackerResponses[]`.
- `tracker_definition.json`: the question wording, which is stored outside the patient record.
- `sample_db_week.json`: `sample_db.json` plus one invented week (2026-11-02 to 2026-11-08) of daily home spirometry. Each day has one 3-blow session before the Dulera dose, plus the mood and symptom answers. 11-04 is a missed dose with nothing logged. 11-05 and 11-06 are a dip (best PEF about 72% of predicted, with wheeze), and the patient recovers by the weekend. The 18 new blows are added to `medicalDevices[0].baselineReadings[]` in the same shape as the original 6 (24 in total). `trackerResponses` holds only questionnaire answers. Guesses: `"Acceptable"` as a quality value, and FEV6 and FEF25-75 are made up. The unknown `unlabeled1` and `unlabeled2` are set to null.
  - **Sparse history:** `generate_week_fill.py` also fills the 2026-06-25 to 2026-11-01 gap with made-up days, about half of all days (70 days). It uses a fixed random seed. These days include:
    - a 1–3 blow spirometry session on most logged days, sometimes with a not-acceptable blow and coaching messages
    - the mood and symptom survey, with the symptom answer sometimes skipped
    - a Dulera dose on about 80% of days, sometimes in the evening
    - a rare as-needed Excedrin dose
  - **Rough patches:** two invented ones, in early August and late September, with lower FEV1 and PEF and more "Bad" answers.
  - **Times:** school days (from 08-12) log around 7 AM local time. Timestamps are UTC with random milliseconds, using EDT until 11-01 and EST after.
  - **Messy submissions:** about 20% of the new days, plus 11-02 and 11-05, get extra submissions minutes apart. Some are blank (`responses: []`) and some flip Great/Bad, like the brief's April 28 example.
  - **Format fixes in the hand-written week:** symptom lists now have no spaces (`["A","B"]`), and timestamps have random milliseconds.
  - **Decisions (asked):**
    - no rescue inhaler added; the medication list is unchanged
    - `asthmaTreatmentPlan` shows the latest state: `Green`, `retestTime: null`
    - `reminders` and `earnedMedicationBadges` stay empty, and no new tracker badges
    - the spirometer question stays unanswered
  - **Guesses:**
    - `allMedicationsAdministered` = whether a Dulera dose was logged that day
    - the day of a submission = its UTC date. All new submissions are in the morning, so the UTC and local dates match.
  - **Totals:** 86 days, 111 submissions (22 blank), 128 blows.
  - **Re-running the script:** it appends, so run it only on a fresh copy of the hand-written week. The pre-fill file is not kept in the repo.

## Where the values come from

| Part | Source |
|---|---|
| Top-level sections (`dailyLogs`, `medications`, `reminders`, `medicalDevices`, `asthmaTreatmentPlan`, the two badge lists) | Section 3 of the brief |
| Doses: day, allMedicationsAdministered, id, time, name, value | Screenshot 1, row for row |
| Medications: ids, names, how often, icon, archived, index | Screenshot 1 |
| Device and the 6 spirometer blows, including all numbers and the 7 quality messages | Screenshot 1 |
| Tracker submissions: times, answers, blank entries | Screenshot 2, row for row (local times converted to UTC) |
| Tracker badge timestamps | Screenshot 1 |

## Guesses

- **Field names and casing.** The brief only names the top-level sections plus `questionId` and `value`. All other field names come from the spreadsheet column headings in camelCase, for example `Boot Id` → `bootId`.
- **The `trackerResponses[]` fields `trackerId` and `date`.** These are guesses.
- **Spirometry labels.** Screenshot 1 cuts the headings off. I worked them out from the math: FEV1 / FEV1 predicted = FEV1 % predicted, and FEV1 / FVC = the ratio column. Only `fvc` is labeled in the source. `fev6` and `fef2575` are best guesses, and `unlabeled1` and `unlabeled2` are still unknown.
- **Medication `dosage` sub-fields.** The headings are cut off. The values (1, 5, TRUE) are as shown in the screenshot.
- **Truncated text.** "NotAccept..." became `NotAcceptable`, "BlowOutL..." became `BlowOutLonger`, and "BlowOutF..." became `BlowOutFaster`.
- **IDs.** All tracker, question and patient IDs are invented. In the medication IDs, the hidden middle parts are invented.
- **Empty fields.** `asthmaTreatmentPlan` values, spirometry blow timestamps, and the empty `reminders` and `earnedMedicationBadges` lists. The screenshots show none of these.
- **Blank submissions.** Rows that are blank in Screenshot 2 are stored as `responses: []`. The spirometer question is never answered, as in Screenshot 2.
