"""Generate the synthetic patient files: fully made-up patients, NOT derived from any real or sample record.
One pair of files per disease, 3 patients each, every patient with a home device: data/synthetic_db.json +
synthetic_tracker_definition.json (asthma, spirometer), then data/synthetic_<disease>_db.json +
synthetic_<disease>_tracker_definition.json for cystic fibrosis (spirometer), type 1 diabetes (glucose meter)
and congenital heart disease (pulse oximeter).

Same structure as sample_db.json (brief section 3). Unlike the brief's example account, the spirometry here
is mostly good quality (accepted blows, ATS-style repeatability), so it can drive real charts.

Run from the repo root:  python data/generate_synthetic_db.py
Deterministic (fixed seed), so re-running gives the same file.
"""
import json
import random
import uuid
from datetime import date, datetime, timedelta, timezone

OUT_DB = "data/synthetic_db.json"
OUT_TRACKER = "data/synthetic_tracker_definition.json"
END = date(2026, 11, 8)
DAYS = 90
DST_END = date(2026, 11, 1)  # US Eastern: UTC-4 before, UTC-5 from this day

rng = random.Random(424242)


def rid():
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def oid():
    return "%024x" % rng.getrandbits(96)


TRACKER_ID = rid()
Q = {"spiro": rid(), "feel": rid(), "symp": rid(), "school": rid()}
TRACKER = {
    "id": TRACKER_ID,
    "name": "Asthma Tracker (synthetic)",
    "questions": [
        {"id": Q["spiro"], "type": "device", "text": "Please complete your spirometer reading"},
        {"id": Q["feel"], "type": "faceScale", "text": "How are you feeling today?", "options": ["Great", "Okay", "Bad"]},
        {"id": Q["symp"], "type": "checkbox", "text": "Please select the following symptoms that you are currently experiencing",
         "options": ["Coughing", "Wheezing", "Tight Chest", "Shortness Of Breath", "Activity limitations", "None of these "]},
        {"id": Q["school"], "type": "yesNo", "text": "Did you miss school today because of your asthma?"},
    ],
}
SYMPTOMS = TRACKER["questions"][2]["options"][:-1]
ISSUES = [("BlowOutLonger", "KeepGoingUntilCompletelyEmpty"), ("BlowOutFaster", "BlastOutImmediatelyWhenCompletelyFull")]

# Three made-up profiles so a clinician view has something to tell apart.
PROFILES = [
    {"label": "well controlled, adherent", "adherence": 0.93, "flares": [], "pred": (3.35, 3.95, 7.4), "baseline": 0.97},
    {"label": "poor adherence, worsening", "adherence": 0.45, "flares": [(60, 12)], "pred": (3.05, 3.60, 6.9), "baseline": 0.90},
    {"label": "adherent, one flare then recovery", "adherence": 0.85, "flares": [(35, 7)], "pred": (3.60, 4.25, 7.9), "baseline": 0.95},
]


def iso_utc(d, minutes_after_midnight_local):
    off = 5 if d >= DST_END else 4
    t = datetime(d.year, d.month, d.day, tzinfo=timezone.utc) + timedelta(
        minutes=minutes_after_midnight_local + off * 60, seconds=rng.randint(0, 59), milliseconds=rng.randint(0, 999))
    return t.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sev_on(profile, k, drift_from=60):
    """0 = well .. 1 = worst. k = day index from start."""
    s = 0.0
    for start, length in profile["flares"]:
        x = k - start
        if 0 <= x < length:
            s = max(s, 1 - abs(x - length / 2) / (length / 2) * 0.5)
    if profile["adherence"] < 0.6:  # untreated drift from drift_from to the end, reaching 0.6
        s = max(s, max(0, k - drift_from) / (DAYS - drift_from) * 0.6)
    return min(s, 1.0)


def make_blow(ts, fev1, fvc, pef, pred, issue=None):
    fev1p, fvcp, pefp = pred
    fev1, fvc, pef = round(fev1, 2), round(fvc, 2), round(pef, 2)
    return {
        "date": ts,
        "accepted": issue is None,
        "qualityReport": {
            "quality": "Acceptable" if issue is None else "NotAcceptable",
            "qualityIndications": [] if issue is None else [{"message": issue[0], "instructions": issue[1]}],
        },
        "fvcPlusResults": {
            "unlabeled1": None,
            "pefPercentPredicted": round(pef / pefp * 100, 4),
            "fev1PercentPredicted": round(fev1 / fev1p * 100, 4),
            "fev1Predicted": fev1p,
            "fev6": round(fvc - rng.uniform(0.0, 0.05), 2),
            "fvcPredicted": fvcp,
            "unlabeled2": None,
            "fvcPercentPredicted": round(fvc / fvcp * 100, 4),
            "fev1": fev1,
            "pefPredicted": pefp,
            "fev1FvcPercent": round(fev1 / fvc * 100, 1),
            "pef": pef,
            "fef2575": round(fev1 * rng.uniform(0.95, 1.15), 2),
            "fvc": fvc,
        },
    }


def session(d, minute, profile, sev):
    """3 good blows (FEV1 within 0.15 L), sometimes one extra rejected blow first."""
    pred = profile["pred"]
    lvl = profile["baseline"] * (1 - 0.35 * sev) + rng.uniform(-0.03, 0.03)
    fev1 = pred[0] * lvl
    fvc = pred[1] * (profile["baseline"] * (1 - 0.08 * sev) + rng.uniform(-0.03, 0.03))
    fev1 = min(fev1, fvc * 0.98)
    pef = pred[2] * lvl
    blows = []
    if rng.random() < 0.15:
        blows.append(make_blow(iso_utc(d, minute), fev1 * 0.8, fvc * 0.9, pef * 0.75, pred, rng.choice(ISSUES)))
        minute += 1
    for i in range(3):
        j = rng.uniform(-0.06, 0.0)  # all within 0.06 L of the best -> repeatable
        blows.append(make_blow(iso_utc(d, minute + i), fev1 + j, fvc + rng.uniform(-0.05, 0.0), pef * (1 + j / 2), pred))
    return blows


def best(blows):
    good = [b for b in blows if b["accepted"]]
    return max(good, key=lambda b: b["fvcPlusResults"]["fev1"]) if good else None


def zone(pef_pct):
    return "Green" if pef_pct >= 80 else "Yellow" if pef_pct >= 50 else "Red"


def make_patient(profile):
    controller, rescue = rid(), rid()
    meds = [
        {"id": controller, "dosage": {"timing": {"periodUnit": "Daily", "frequency": 2, "period": 1}, "asNeeded": False},
         "howOften": "Daily", "icon": "Inhaler", "name": "Controller inhaler (synthetic)",
         "relatedCondition": TRACKER["name"], "archived": False, "index": 0},
        {"id": rescue, "dosage": {"timing": {"periodUnit": None, "frequency": None, "period": None}, "asNeeded": True},
         "howOften": "As Needed", "icon": "Inhaler", "name": "Rescue inhaler (synthetic)",
         "relatedCondition": TRACKER["name"], "archived": False, "index": 1},
    ]
    start = END - timedelta(days=DAYS - 1)
    logs, readings, badges = [], [], []
    streak = 0
    last_blows = []
    for k in range(DAYS):
        d = start + timedelta(days=k)
        sev = sev_on(profile, k)
        engaged = rng.random() < (0.92 if profile["adherence"] > 0.6 else 0.7)
        if not engaged:
            streak = 0
            continue
        school = d.weekday() < 5
        minute = rng.randint(7 * 60, 7 * 60 + 35) if school else rng.randint(9 * 60, 11 * 60)
        log = {"day": d.isoformat(), "allMedicationsAdministered": False, "trackerResponses": [], "medicationAdministrations": []}

        blows = session(d, minute, profile, sev) if rng.random() < 0.85 else []
        readings.extend(blows)
        b = best(blows)
        if b:
            last_blows = blows
        minute += 5

        feel = "Bad" if rng.random() < 0.1 + 0.8 * sev else ("Okay" if rng.random() < 0.25 else "Great")
        if feel == "Great" and rng.random() > 0.1:
            syms = ["None of these "]
        else:
            syms = rng.sample(SYMPTOMS, 1 + int(sev * 3 + rng.random()))
        resp = []
        if b:
            r = b["fvcPlusResults"]
            resp.append({"questionId": Q["spiro"], "value": json.dumps(
                {"fev1": r["fev1"], "fvc": r["fvc"], "pef": r["pef"], "accepted": True}, separators=(",", ":"))})
        resp.append({"questionId": Q["feel"], "value": feel})
        resp.append({"questionId": Q["symp"], "value": json.dumps(syms, separators=(",", ":"))})
        if school:
            resp.append({"questionId": Q["school"], "value": "true" if sev > 0.6 and rng.random() < 0.6 else "false"})
        log["trackerResponses"].append({"trackerId": TRACKER_ID, "date": iso_utc(d, minute), "responses": resp})
        if rng.random() < 0.12:  # an abandoned extra submission, as the real app produces
            log["trackerResponses"].append({"trackerId": TRACKER_ID, "date": iso_utc(d, minute + rng.randint(1, 20)), "responses": []})

        taken = 0
        for slot in (minute + rng.randint(2, 20), 18 * 60 + rng.randint(0, 120)):
            if rng.random() < profile["adherence"]:
                taken += 1
                log["medicationAdministrations"].append(
                    {"id": controller, "time": f"{slot // 60:02d}:{slot % 60:02d}", "name": meds[0]["name"], "value": 1})
        for _ in range(int(sev * 4 * rng.random() + (rng.random() < 0.05))):
            t = rng.randint(8 * 60, 21 * 60)
            log["medicationAdministrations"].append({"id": rescue, "time": f"{t // 60:02d}:{t % 60:02d}", "name": meds[1]["name"], "value": 2})
        log["medicationAdministrations"].sort(key=lambda m: m["time"])
        log["allMedicationsAdministered"] = taken == 2
        logs.append(log)

        streak += 1
        if streak in (5, 10, 30):
            badges.append({"badgeName": f"TrackerBadge{streak}", "date": iso_utc(d, minute + 1)})

    latest = best(last_blows)
    pct = latest["fvcPlusResults"]["pefPercentPredicted"]
    status = zone(pct)
    retest = None
    if status != "Green":
        t = datetime.fromisoformat(latest["date"].replace("Z", "+00:00")) + timedelta(hours=4)
        retest = t.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    serial = "Z%06d" % rng.randint(100000, 999999)
    return {
        "_id": oid(),
        "dailyLogs": logs,
        "medications": meds,
        "reminders": [],
        "medicalDevices": [{
            "protocol": 9,
            "address": rid().upper(),
            "bootId": "SM",
            "serialNumber": serial,
            "deviceType": 0,
            "atsStandard": True,
            "name": "Spirobank",
            "advertisedName": f"SM-009-{serial}",
            "baselineReadingDate": readings[0]["date"][:10],
            "baselineReadings": readings,
        }],
        "asthmaTreatmentPlan": {"status": status, "expiration": "2027-06-30T00:00:00.000Z", "retestTime": retest},
        "earnedMedicationBadges": [],
        "earnedTrackerBadges": badges,
    }


# Three more chronic conditions, each with a home device and the same three PROFILES. Same shape as asthma:
# one medicalDevices[] record with its readings in baselineReadings[], and a `device` tracker question holding
# the day's reading. asthmaTreatmentPlan is null (the zone is asthma-only). `red` symptoms are warning signs,
# only reported on bad days. `flare` (start day, length) and `drift_from` differ per condition.
CONDITIONS = [
    {"file": "cf", "name": "Cystic Fibrosis Tracker (synthetic)", "short": "cystic fibrosis",
     "device_q": "Please complete your spirometer reading",
     "symptoms": ["Coughing", "More mucus", "Shortness Of Breath", "Fatigue", "Low appetite"],
     "red": ["Coughing up blood", "Fever"],
     "daily": ("CFTR modulator (synthetic)", "Pill", 2), "prn": ("Rescue inhaler (synthetic)", "Inhaler"),
     "device": ("Spirobank", "SM", 0, True), "flare": (24, 10), "drift_from": 52},
    {"file": "t1d", "name": "Type 1 Diabetes Tracker (synthetic)", "short": "diabetes",
     "device_q": "Please check your blood sugar",
     "symptoms": ["Excessive thirst", "Frequent urination", "Headache", "Fatigue"], "red": ["Nausea or vomiting"],
     "daily": ("Long-acting insulin (synthetic)", "Injection", 1), "prn": ("Correction insulin (synthetic)", "Injection"),
     "device": ("Glucose meter (synthetic)", "GM", 1, False), "flare": (44, 6), "drift_from": 58},
    {"file": "heart", "name": "Congenital Heart Disease Tracker (synthetic)", "short": "heart condition",
     "device_q": "Please complete your pulse oximeter reading",
     "symptoms": ["Fatigue", "Shortness Of Breath", "Swelling in legs or feet", "Low appetite", "Dizziness"],
     "red": ["Blue lips or fingers", "Fainting"],
     "daily": ("Heart medication (synthetic)", "Pill", 2), "prn": ("Extra diuretic dose (synthetic)", "Pill"),
     "device": ("Pulse oximeter (synthetic)", "PO", 2, False), "flare": (63, 7), "drift_from": 55},
]
CF_LUNGS = {"pred": (2.95, 3.45, 6.6), "baseline": 0.86}  # lower lung function than the asthma patients
MEALS = ["BeforeBreakfast", "BeforeLunch", "AfterSchool", "BeforeDinner"]  # last check ends by 18:40 local, same UTC day


def clamp(v):
    return min(1.0, max(0.0, v))


def qreport(issue=None):
    return {"quality": "Acceptable" if issue is None else "NotAcceptable",
            "qualityIndications": [] if issue is None else [{"message": issue[0], "instructions": issue[1]}]}


# Each measure_* returns the day's readings, the device answer (or None), x = 0 best day .. 1 worst day
# (mood, symptoms, school and as-needed doses follow from it), symptoms the reading implies, and the
# as-needed dose times when the reading decides them (None = draw from x).
def measure_cf(d, minute, profile, sev):
    blows = session(d, minute, {**profile, **CF_LUNGS}, sev) if rng.random() < 0.85 else []
    b = best(blows)
    if not b:
        return blows, None, sev, [], None
    r = b["fvcPlusResults"]
    x = clamp((1 - r["fev1PercentPredicted"] / (CF_LUNGS["baseline"] * 100)) / 0.35)
    return blows, {"fev1": r["fev1"], "fvc": r["fvc"], "pef": r["pef"], "accepted": True}, x, [], None


def measure_t1d(d, minute, profile, sev):
    readings, ok = [], []
    for i, context in enumerate(MEALS):
        if i and rng.random() < 0.15:  # a skipped check; the morning one is always done
            continue
        t = minute if i == 0 else (12 * 60, 15 * 60 + 30, 18 * 60)[i - 1] + rng.randint(0, 40)
        if rng.random() < 0.04:  # failed strip, re-tested a minute later
            readings.append({"date": iso_utc(d, t), "accepted": False, "qualityReport": qreport(("StripError", "UseANewTestStrip")),
                             "glucoseResults": {"glucose": None, "unit": "mg/dL", "mealContext": context}})
            t += 1
        low = rng.random() < 0.05 * (1 - sev)
        g = int(min(450, max(40, 55 + rng.randint(0, 14) if low else rng.gauss(135 + 170 * sev, 35 + 20 * sev))))
        readings.append({"date": iso_utc(d, t), "accepted": True, "qualityReport": qreport(),
                         "glucoseResults": {"glucose": g, "unit": "mg/dL", "mealContext": context}})
        ok.append((t, g))
    x = clamp((sum(g for _, g in ok) / len(ok) - 150) / 150)
    extra = ["Shakiness"] if min(g for _, g in ok) < 70 else []
    highs = [t + 2 for t, g in ok if g > 250]  # one correction dose per high reading
    return readings, {"glucose": ok[0][1], "accepted": True}, x, extra, highs


def ox_reading(d, minute, sev, issue=None):
    spo2 = min(100, round(97 - 7 * sev + rng.gauss(0, 1)))
    pulse = round(85 + 30 * sev + rng.gauss(0, 5))
    if issue:  # a bad signal reads low and jumpy
        spo2, pulse = spo2 - rng.randint(4, 10), pulse + rng.randint(10, 30)
    return {"date": iso_utc(d, minute), "accepted": issue is None, "qualityReport": qreport(issue),
            "oximetryResults": {"spo2": spo2, "pulse": pulse,
                                "perfusionIndex": round(rng.uniform(0.3, 1.0) if issue else rng.uniform(1.5, 5.0), 1)}}


def measure_heart(d, minute, profile, sev):
    readings = []
    if rng.random() < 0.15:
        readings.append(ox_reading(d, minute, sev, ("PoorSignal", "KeepYourHandStill")))
        minute += 1
    readings.append(ox_reading(d, minute, sev))
    r = readings[-1]["oximetryResults"]
    return readings, {"spo2": r["spo2"], "pulse": r["pulse"], "accepted": True}, clamp((97 - r["spo2"]) / 7), [], None


MEASURE = {"cf": measure_cf, "t1d": measure_t1d, "heart": measure_heart}


def make_tracker(c):
    return {
        "id": rid(),
        "name": c["name"],
        "questions": [
            {"id": rid(), "type": "device", "text": c["device_q"]},
            {"id": rid(), "type": "faceScale", "text": "How are you feeling today?", "options": ["Great", "Okay", "Bad"]},
            {"id": rid(), "type": "checkbox", "text": "Please select the following symptoms that you are currently experiencing",
             "options": c["symptoms"] + (["Shakiness"] if c["file"] == "t1d" else []) + c["red"] + ["None of these "]},
            {"id": rid(), "type": "yesNo", "text": f"Did you miss school today because of your {c['short']}?"},
        ],
    }


def make_condition_patient(c, tracker, profile):
    q_dev, q_feel, q_symp, q_school = (q["id"] for q in tracker["questions"])
    name, icon, per_day = c["daily"]
    daily, prn = rid(), rid()
    meds = [
        {"id": daily, "dosage": {"timing": {"periodUnit": "Daily", "frequency": per_day, "period": 1}, "asNeeded": False},
         "howOften": "Daily", "icon": icon, "name": name, "relatedCondition": tracker["name"], "archived": False, "index": 0},
        {"id": prn, "dosage": {"timing": {"periodUnit": None, "frequency": None, "period": None}, "asNeeded": True},
         "howOften": "As Needed", "icon": c["prn"][1], "name": c["prn"][0], "relatedCondition": tracker["name"],
         "archived": False, "index": 1},
    ]
    # poor adherence: its flare starts with the drift; one flare: the condition's own dates
    profile = {**profile, "flares": [(c["drift_from"], n) if profile["adherence"] < 0.6 else c["flare"]
                                     for _, n in profile["flares"]]}
    start = END - timedelta(days=DAYS - 1)
    logs, readings, badges, streak = [], [], [], 0
    for k in range(DAYS):
        d = start + timedelta(days=k)
        sev = sev_on(profile, k, c["drift_from"])
        if rng.random() >= (0.92 if profile["adherence"] > 0.6 else 0.7):
            streak = 0
            continue
        school = d.weekday() < 5
        minute = rng.randint(7 * 60, 7 * 60 + 35) if school else rng.randint(9 * 60, 11 * 60)
        day_readings, answer, x, extra, prn_times = MEASURE[c["file"]](d, minute, profile, sev)
        readings.extend(day_readings)
        minute += 5  # the tracker is filled in just after the reading, as for asthma
        if x >= 0.5:
            feel = "Bad"
        elif x >= 0.25:
            feel = "Bad" if rng.random() < 0.3 else "Okay"
        else:
            r = rng.random()
            feel = "Bad" if r < 0.05 else "Okay" if r < 0.3 else "Great"
        if feel == "Great":
            syms = extra or (["None of these "] if rng.random() > 0.1 else rng.sample(c["symptoms"], 1))
        else:
            syms = rng.sample(c["symptoms"], min(len(c["symptoms"]), 1 + int(x * 3 + rng.random()))) + extra
            if x >= 0.5:
                syms += [s for s in c["red"] if rng.random() < 0.5]
        resp = [{"questionId": q_dev, "value": json.dumps(answer, separators=(",", ":"))}] if answer else []
        resp += [{"questionId": q_feel, "value": feel},
                 {"questionId": q_symp, "value": json.dumps(syms, separators=(",", ":"))}]
        if school:
            resp.append({"questionId": q_school, "value": "true" if x > 0.6 and rng.random() < 0.6 else "false"})
        subs = [{"trackerId": tracker["id"], "date": iso_utc(d, minute), "responses": resp}]
        if rng.random() < 0.12:  # an abandoned extra submission, as the real app produces
            subs.append({"trackerId": tracker["id"], "date": iso_utc(d, minute + rng.randint(1, 20)), "responses": []})

        doses, taken = [], 0
        for slot in (minute + rng.randint(2, 20), 18 * 60 + rng.randint(0, 120))[:per_day]:
            if rng.random() < profile["adherence"]:
                taken += 1
                doses.append({"id": daily, "time": f"{slot // 60:02d}:{slot % 60:02d}", "name": name, "value": 1})
        if prn_times is None:
            prn_times = [rng.randint(8 * 60, 21 * 60) for _ in range(round(x * 3 * rng.uniform(0.5, 1)))]
        for t in prn_times:
            doses.append({"id": prn, "time": f"{t // 60:02d}:{t % 60:02d}", "name": c["prn"][0], "value": 1})
        doses.sort(key=lambda m: m["time"])
        logs.append({"day": d.isoformat(), "allMedicationsAdministered": taken == per_day,
                     "trackerResponses": subs, "medicationAdministrations": doses})

        streak += 1
        if streak in (5, 10, 30):
            badges.append({"badgeName": f"TrackerBadge{streak}", "date": iso_utc(d, minute + 1)})
    dev_name, boot, dev_type, ats = c["device"]
    serial = ("Z%06d" if boot == "SM" else boot[0] + "%06d") % rng.randint(100000, 999999)
    device = {
        "protocol": 9 if boot == "SM" else None,  # protocol's meaning is unknown; only seen for the Spirobank
        "address": rid().upper(),
        "bootId": boot,
        "serialNumber": serial,
        "deviceType": dev_type,
        "atsStandard": ats,
        "name": dev_name,
        "advertisedName": f"SM-009-{serial}" if boot == "SM" else f"{boot}-{serial}",
        "baselineReadingDate": readings[0]["date"][:10],
        "baselineReadings": readings,
    }
    return {"_id": oid(), "dailyLogs": logs, "medications": meds, "reminders": [], "medicalDevices": [device],
            "asthmaTreatmentPlan": None, "earnedMedicationBadges": [], "earnedTrackerBadges": badges}


def write(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def main():
    write(OUT_DB, [make_patient(p) for p in PROFILES])  # asthma first, so its random draws (and output) stay unchanged
    write(OUT_TRACKER, TRACKER)
    for c in CONDITIONS:
        t = make_tracker(c)
        write(f"data/synthetic_{c['file']}_db.json", [make_condition_patient(c, t, p) for p in PROFILES])
        write(f"data/synthetic_{c['file']}_tracker_definition.json", t)


if __name__ == "__main__":
    main()
