"""Generate data/synthetic_db.json: fully made-up patients, NOT derived from any real or sample record.

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


def sev_on(profile, k):
    """0 = well .. 1 = worst. k = day index from start."""
    s = 0.0
    for start, length in profile["flares"]:
        x = k - start
        if 0 <= x < length:
            s = max(s, 1 - abs(x - length / 2) / (length / 2) * 0.5)
    if profile["adherence"] < 0.6:  # untreated drift in the last month
        s = max(s, max(0, k - 60) / 30 * 0.6)
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


def main():
    db = [make_patient(p) for p in PROFILES]
    with open(OUT_DB, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2)
        f.write("\n")
    with open(OUT_TRACKER, "w", encoding="utf-8") as f:
        json.dump(TRACKER, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
