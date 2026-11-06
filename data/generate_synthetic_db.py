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
    if rng.random() < profile.get("bad_blow", 0.15):
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

    plan = plan_for(best(last_blows))
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
        "asthmaTreatmentPlan": plan,
        "earnedMedicationBadges": [],
        "earnedTrackerBadges": badges,
    }


def plan_for(latest):
    """Asthma action-plan zone from the latest best blow."""
    status = zone(latest["fvcPlusResults"]["pefPercentPredicted"])
    retest = None
    if status != "Green":
        t = datetime.fromisoformat(latest["date"].replace("Z", "+00:00")) + timedelta(hours=4)
        retest = t.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {"status": status, "expiration": "2027-06-30T00:00:00.000Z", "retestTime": retest}


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
        if i and rng.random() < profile.get("skip_check", 0.15):  # a skipped check; the morning one is always done
            continue
        t = minute if i == 0 else (12 * 60, 15 * 60 + 30, 18 * 60)[i - 1] + rng.randint(0, 40)
        if rng.random() < profile.get("strip_fail", 0.04):  # failed strip, re-tested a minute later
            readings.append({"date": iso_utc(d, t), "accepted": False, "qualityReport": qreport(("StripError", "UseANewTestStrip")),
                             "glucoseResults": {"glucose": None, "unit": "mg/dL", "mealContext": context}})
            t += 1
        low = rng.random() < profile.get("lows", 0.05) * (1 - sev)
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
    if rng.random() < profile.get("bad_signal", 0.15):
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


def meds_for(c, tracker):
    name, icon, per_day = c["daily"]
    daily, prn = rid(), rid()
    meds = [
        {"id": daily, "dosage": {"timing": {"periodUnit": "Daily", "frequency": per_day, "period": 1}, "asNeeded": False},
         "howOften": "Daily", "icon": icon, "name": name, "relatedCondition": tracker["name"], "archived": False, "index": 0},
        {"id": prn, "dosage": {"timing": {"periodUnit": None, "frequency": None, "period": None}, "asNeeded": True},
         "howOften": "As Needed", "icon": c["prn"][1], "name": c["prn"][0], "relatedCondition": tracker["name"],
         "archived": False, "index": 1},
    ]
    return meds, daily, prn


def device_for(c, readings):
    dev_name, boot, dev_type, ats = c["device"]
    serial = ("Z%06d" if boot == "SM" else boot[0] + "%06d") % rng.randint(100000, 999999)
    return {
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


def make_condition_patient(c, tracker, profile):
    q_dev, q_feel, q_symp, q_school = (q["id"] for q in tracker["questions"])
    name, icon, per_day = c["daily"]
    meds, daily, prn = meds_for(c, tracker)
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
    device = device_for(c, readings)  # before oid(), to keep the random draws in their original order
    return {"_id": oid(), "dailyLogs": logs, "medications": meds, "reminders": [], "medicalDevices": [device],
            "asthmaTreatmentPlan": None, "earnedMedicationBadges": [], "earnedTrackerBadges": badges}


# Two more patients per disease, messier than the 3 profiles above: tracking that fades, late joiners, gaps
# (holiday, hospital stay), skipped questions, poor device technique, mood that doesn't match the reading
# (stoic or anxious), changed answers, doses logged late at round times or not at all.
# Knobs: engage/adherence = (start, end) daily probability; mood = bias added to how bad the day feels;
# device = chance of using the device on a logged day; partial = chance of skipping survey questions;
# meds_only = chance the app was opened only to log a dose; dup = chance of a second (blank or changed)
# submission; late = chance of logging in the early evening; miss_bad = chance of not logging on a bad day;
# prn_log = chance an as-needed dose gets logged; drift = (from day, severity reached at the end).
ASTHMA = {"file": "asthma", "symptoms": SYMPTOMS, "red": [], "daily": ("Controller inhaler (synthetic)", "Inhaler", 2),
          "prn": ("Rescue inhaler (synthetic)", "Inhaler"), "device": ("Spirobank", "SM", 0, True)}
MESSY = {
    "asthma": [
        {"label": "teen, tracking fades over the term, stoic", "engage": (0.95, 0.35), "adherence": (0.85, 0.4),
         "drift": (55, 0.45), "weekend_skip": 0.4, "device": 0.75, "bad_blow": 0.45, "short": 0.3, "mood": -0.25,
         "partial": 0.25, "dup": 0.05, "late": 0.1, "pred": (3.20, 3.80, 7.1), "baseline": 0.93},
        {"label": "holiday gap, autumn flare, anxious", "gaps": [(20, 9)], "flares": [(52, 10)], "engage": (0.85, 0.85),
         "adherence": (0.75, 0.8), "device": 0.6, "mood": 0.2, "dup": 0.3, "late": 0.55, "partial": 0.1,
         "meds_only": 0.1, "miss_bad": 0.2, "pred": (2.85, 3.30, 6.4), "baseline": 0.96},
    ],
    "cf": [
        {"label": "joined late, hospital stay for a flare", "join": 18, "flares": [(44, 9)], "gaps": [(47, 6)],
         "engage": (0.9, 0.8), "adherence": (0.9, 0.85), "device": 0.8, "partial": 0.1, "dup": 0.1, "late": 0.15,
         "bad_blow": 0.2, "short": 0.15, "miss_bad": 0.3},
        {"label": "weekends off, often skips the spirometer", "weekend_skip": 0.85, "engage": (0.85, 0.75),
         "adherence": (0.7, 0.6), "drift": (60, 0.3), "device": 0.45, "partial": 0.2, "meds_only": 0.15, "mood": 0.1,
         "dup": 0.15, "late": 0.3, "bad_blow": 0.3, "short": 0.25},
    ],
    "t1d": [
        {"label": "teen, skips checks, under-reports", "skip_check": 0.5, "engage": (0.9, 0.55), "adherence": (0.85, 0.6),
         "drift": (40, 0.45), "mood": -0.3, "partial": 0.35, "device": 0.9, "strip_fail": 0.08, "prn_log": 0.5,
         "weekend_skip": 0.3, "late": 0.2, "dup": 0.05},
        {"label": "tight control with lows, parent logs everything, sick days", "lows": 0.18, "skip_check": 0.05,
         "flares": [(30, 4)], "engage": (0.97, 0.95), "adherence": (0.98, 0.98), "mood": 0.25, "dup": 0.35,
         "partial": 0.05, "device": 1.0, "late": 0.1, "prn_log": 1.0},
    ],
    "heart": [
        {"label": "stable, logs a few days a week", "engage": (0.5, 0.4), "adherence": (0.85, 0.8), "partial": 0.45,
         "device": 0.7, "dup": 0.05, "late": 0.4, "bad_signal": 0.3, "meds_only": 0.2},
        {"label": "slowly worse despite taking meds, skips bad days", "drift": (30, 0.7), "adherence": (0.95, 0.92),
         "engage": (0.9, 0.7), "miss_bad": 0.35, "mood": -0.1, "partial": 0.15, "device": 0.85, "dup": 0.15,
         "late": 0.2, "bad_signal": 0.2},
    ],
}


def lerp(pair, k):
    return pair[0] + (pair[1] - pair[0]) * k / (DAYS - 1)


def clock(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def measure_spiro(c, d, minute, p, sev):
    lungs = CF_LUNGS if c["file"] == "cf" else {"pred": p["pred"], "baseline": p["baseline"]}
    blows = session(d, minute, {**p, **lungs}, sev)
    if rng.random() < p.get("short", 0):  # gave up after 1-2 good blows (good ones are last)
        blows = blows[:len(blows) - rng.randint(1, 2)]
    b = best(blows)
    if not b:
        return blows, None, sev, [], None
    r = b["fvcPlusResults"]
    x = clamp((1 - r["fev1PercentPredicted"] / (lungs["baseline"] * 100)) / 0.35)
    return blows, {"fev1": r["fev1"], "fvc": r["fvc"], "pef": r["pef"], "accepted": True}, x, [], None


def make_messy_patient(c, tracker, p):
    q_dev, q_feel, q_symp, q_school = (q["id"] for q in tracker["questions"])
    meds, daily, prn = meds_for(c, tracker)
    name, _, per_day = c["daily"]
    dumps = lambda v: json.dumps(v, separators=(",", ":"))
    start = END - timedelta(days=DAYS - 1)
    logs, readings, badges, streak = [], [], [], 0
    for k in range(DAYS):
        d = start + timedelta(days=k)
        sev = sev_on({"flares": p.get("flares", []), "adherence": 1}, k)
        if "drift" in p:
            f, top = p["drift"]
            sev = max(sev, max(0, k - f) / (DAYS - f) * top)
        engage = lerp(p["engage"], k) * (1 - p.get("weekend_skip", 0) * (d.weekday() >= 5)) \
            * (1 - p.get("miss_bad", 0) * (sev > 0.5))
        if k < p.get("join", 0) or any(s <= k < s + n for s, n in p.get("gaps", [])) or rng.random() >= engage:
            streak = 0
            continue
        school = d.weekday() < 5
        dev_min = rng.randint(7 * 60, 7 * 60 + 35) if school else rng.randint(9 * 60, 11 * 60 + 30)
        survey_min = dev_min + 5
        if rng.random() < p.get("late", 0):  # ends by 18:45 local, so still the same UTC day
            survey_min = rng.randint(17 * 60, 18 * 60 + 30)
            if c["file"] != "t1d":  # glucose checks stay tied to meals
                dev_min = survey_min - 5
        subs, day_readings, x, prn_times = [], [], sev, None
        if rng.random() >= p.get("meds_only", 0):
            answer, extra = None, []
            if rng.random() < p["device"]:
                measure = measure_spiro if c["file"] in ("asthma", "cf") else lambda c, *a: MEASURE[c["file"]](*a)
                day_readings, answer, x, extra, prn_times = measure(c, d, dev_min, p, sev)
            felt = clamp(x + p.get("mood", 0) + rng.gauss(0, 0.12))  # how the day feels to them, not what the device says
            feel = "Bad" if felt >= 0.45 else "Okay" if felt >= 0.2 else "Great"
            syms = rng.sample(c["symptoms"], min(len(c["symptoms"]), int(felt * 3 + rng.random()))) + extra
            if x >= 0.5:
                syms += [s for s in c["red"] if rng.random() < 0.4]
            if not syms or rng.random() < 0.03:  # 3%: ticks "None of these" next to a symptom by mistake
                syms.append("None of these ")
            survey = [{"questionId": q_feel, "value": feel}, {"questionId": q_symp, "value": dumps(syms)}]
            if school:
                survey.append({"questionId": q_school, "value": "true" if x > 0.55 and rng.random() < 0.6 else "false"})
            if rng.random() < p.get("partial", 0):  # answered a question or two, then closed the app
                survey = rng.sample(survey, rng.randint(0, len(survey) - 1))
            resp = ([{"questionId": q_dev, "value": dumps(answer)}] if answer else []) + survey
            if resp:
                subs.append({"trackerId": tracker["id"], "date": iso_utc(d, survey_min), "responses": resp})
            if rng.random() < p.get("dup", 0):
                again = iso_utc(d, survey_min + rng.randint(1, 15))
                if rng.random() < 0.5:
                    subs.append({"trackerId": tracker["id"], "date": again, "responses": []})
                else:  # came back and changed the mood answer
                    other = rng.choice([f for f in ("Great", "Okay", "Bad") if f != feel])
                    subs.append({"trackerId": tracker["id"], "date": again, "responses": [{"questionId": q_feel, "value": other}]})
        readings.extend(day_readings)

        doses, taken = [], 0
        morning = (dev_min if dev_min < 12 * 60 else rng.randint(7 * 60, 9 * 60)) + rng.randint(-10, 30)
        for slot in (morning, rng.randint(18 * 60, 21 * 60 + 30))[:per_day]:
            if rng.random() < lerp(p["adherence"], k):
                if rng.random() < 0.3:  # logged later from memory, at a round time
                    slot = slot // 30 * 30
                taken += 1
                doses.append({"id": daily, "time": clock(slot), "name": name, "value": 1})
        if prn_times is None:
            prn_times = [rng.randint(8 * 60, 21 * 60) for _ in range(round(x * 3 * rng.uniform(0.5, 1)))]
        for t in prn_times:
            if rng.random() < p.get("prn_log", 0.9):  # some as-needed doses never get logged
                doses.append({"id": prn, "time": clock(t), "name": c["prn"][0], "value": 2 if c["file"] == "asthma" else 1})
        doses.sort(key=lambda m: m["time"])
        if not (subs or doses or day_readings):
            streak = 0
            continue
        logs.append({"day": d.isoformat(), "allMedicationsAdministered": taken == per_day,
                     "trackerResponses": subs, "medicationAdministrations": doses})
        streak += 1
        if streak in (5, 10, 30):
            badges.append({"badgeName": f"TrackerBadge{streak}", "date": iso_utc(d, survey_min + 1)})
    plan = None
    if c["file"] == "asthma":
        last = max(r["date"][:10] for r in readings if r["accepted"])
        plan = plan_for(best([r for r in readings if r["date"][:10] == last]))
    return {"_id": oid(), "dailyLogs": logs, "medications": meds, "reminders": [], "medicalDevices": [device_for(c, readings)],
            "asthmaTreatmentPlan": plan, "earnedMedicationBadges": [], "earnedTrackerBadges": badges}


def write(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def main():
    groups = [(ASTHMA, TRACKER, [make_patient(p) for p in PROFILES])]  # asthma first, so its random draws stay unchanged
    for c in CONDITIONS:
        t = make_tracker(c)
        groups.append((c, t, [make_condition_patient(c, t, p) for p in PROFILES]))
    for c, t, patients in groups:  # after all the originals, so their random draws (and output) stay unchanged
        patients += [make_messy_patient(c, t, p) for p in MESSY[c["file"]]]
    for c, t, patients in groups:
        db, tr = (OUT_DB, OUT_TRACKER) if c is ASTHMA else (f"data/synthetic_{c['file']}_db.json",
                                                             f"data/synthetic_{c['file']}_tracker_definition.json")
        write(db, patients)
        write(tr, t)


if __name__ == "__main__":
    main()
