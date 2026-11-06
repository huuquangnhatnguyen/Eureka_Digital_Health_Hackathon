"""Checks for the synthetic patient files, one pair per disease. Run from the repo root: python data/test_synthetic_db.py"""
import json
from datetime import date

load = lambda f: json.load(open(f"data/{f}", encoding="utf-8"))
FILES = [("synthetic_db.json", "synthetic_tracker_definition.json")] + [
    (f"synthetic_{k}_db.json", f"synthetic_{k}_tracker_definition.json") for k in ("cf", "t1d", "heart")]
db, trackers = [], {}
for db_file, tracker_file in FILES:  # each file holds one disease: 3 tidy + 2 messy patients, all on that file's tracker
    t = load(tracker_file)
    trackers[t["id"]] = t
    group = load(db_file)
    assert len(group) == 5 and all(tr["trackerId"] == t["id"] for p in group for l in p["dailyLogs"] for tr in l["trackerResponses"])
    db += group
ref = json.load(open("data/sample_db.json", encoding="utf-8"))[0]  # structure reference only

TOP = set(ref)
LOG_KEYS = {"day", "allMedicationsAdministered", "trackerResponses", "medicationAdministrations"}
BLOW_KEYS = set(ref["medicalDevices"][0]["baselineReadings"][0]["fvcPlusResults"])
DEVICE_KEYS = set(ref["medicalDevices"][0])
MED_KEYS = set(ref["medications"][0])
# What each device's readings and tracker answer hold. The spirometer uses the brief's fvcPlusResults.
DEVICE_TYPES = {"Spirobank": ("fvcPlusResults", {"fev1", "fvc", "pef"}),
                "Glucose meter (synthetic)": ("glucoseResults", {"glucose"}),
                "Pulse oximeter (synthetic)": ("oximetryResults", {"spo2", "pulse"})}


def daily_med(p):
    return next(m for m in p["medications"] if m["howOften"] == "Daily")


def check_patient(p, tidy):
    assert set(p) == TOP, set(p) ^ TOP
    med_ids = {m["id"] for m in p["medications"]}
    ctrl = daily_med(p)
    per_day = ctrl["dosage"]["timing"]["frequency"]
    assert all(set(m) == MED_KEYS for m in p["medications"])
    tracker_ids = {tr["trackerId"] for l in p["dailyLogs"] for tr in l["trackerResponses"]}
    assert len(tracker_ids) == 1, "one tracker per patient"
    tracker = trackers[tracker_ids.pop()]
    assert all(m["relatedCondition"] == tracker["name"] for m in p["medications"])
    qtypes = {q["id"]: q for q in tracker["questions"]}
    assert len(p["medicalDevices"]) == 1, "every patient has one home device"
    dev = p["medicalDevices"][0]
    results_key, answer_keys = DEVICE_TYPES[dev["name"]]

    days = [l["day"] for l in p["dailyLogs"]]
    assert days == sorted(days) and len(days) == len(set(days)), "one entry per day, sorted"
    for l in p["dailyLogs"]:
        assert set(l) == LOG_KEYS
        for tr in l["trackerResponses"]:
            assert set(tr) == {"trackerId", "date", "responses"}
            assert tr["date"][:10] == l["day"]
            for r in tr["responses"]:
                q = qtypes[r["questionId"]]
                v = r["value"]
                assert isinstance(v, str), "value is always text"
                if q["type"] == "checkbox":
                    assert set(json.loads(v)) <= set(q["options"]) and ", " not in v
                elif q["type"] == "faceScale":
                    assert v in q["options"]
                elif q["type"] == "yesNo":
                    assert v in ("true", "false")
                elif q["type"] == "device":
                    assert set(json.loads(v)) == answer_keys | {"accepted"}
        doses = [m for m in l["medicationAdministrations"] if m["id"] == ctrl["id"]]
        assert l["allMedicationsAdministered"] == (len(doses) == per_day)
        for m in l["medicationAdministrations"]:
            assert m["id"] in med_ids and set(m) == {"id", "time", "name", "value"}

    assert set(dev) == DEVICE_KEYS
    br = dev["baselineReadings"]
    assert [b["date"] for b in br] == sorted(b["date"] for b in br)
    assert dev["baselineReadingDate"] == br[0]["date"][:10]
    assert set(days) >= {b["date"][:10] for b in br}, "every reading falls on a logged day"
    for b in br:
        assert set(b) == {"date", "accepted", "qualityReport", results_key}
        assert b["accepted"] == (b["qualityReport"]["quality"] == "Acceptable")
        assert b["accepted"] == (not b["qualityReport"]["qualityIndications"])
    if results_key == "glucoseResults":
        for b in br:
            g = b["glucoseResults"]["glucose"]
            assert (g is None) == (not b["accepted"]) and (g is None or 40 <= g <= 450)
    if results_key == "oximetryResults":
        for b in br:
            assert 70 <= b["oximetryResults"]["spo2"] <= 100 and 40 <= b["oximetryResults"]["pulse"] <= 200
    if results_key != "fvcPlusResults":
        assert p["asthmaTreatmentPlan"] is None
        return
    by_day = {}
    for b in br:
        r = b["fvcPlusResults"]
        assert set(r) == BLOW_KEYS
        assert 0 < r["fev1"] <= r["fvc"]
        for v, pr, pc in (("fev1", "fev1Predicted", "fev1PercentPredicted"),
                          ("fvc", "fvcPredicted", "fvcPercentPredicted"),
                          ("pef", "pefPredicted", "pefPercentPredicted")):
            assert abs(r[v] / r[pr] * 100 - r[pc]) < 0.01
        assert abs(r["fev1"] / r["fvc"] * 100 - r["fev1FvcPercent"]) < 0.06
        if b["accepted"]:
            by_day.setdefault(b["date"][:10], []).append(r["fev1"])
    for day, vals in by_day.items():  # ATS-style repeatability: top two FEV1 within 0.15 L
        top = sorted(vals, reverse=True)
        assert (len(top) >= 3 or not tidy) and (len(top) < 2 or top[0] - top[1] <= 0.15), (day, top)

    plan = p["asthmaTreatmentPlan"]
    if tracker["name"] != "Asthma Tracker (synthetic)":  # the zone is asthma-only
        assert plan is None
        return
    assert plan["status"] in ("Green", "Yellow", "Red")
    assert (plan["retestTime"] is None) == (plan["status"] == "Green")


def adherence(p):
    ctrl = daily_med(p)
    n = sum(1 for l in p["dailyLogs"] for m in l["medicationAdministrations"] if m["id"] == ctrl["id"])
    return n / (ctrl["dosage"]["timing"]["frequency"] * len(p["dailyLogs"]))


for i, p in enumerate(db):
    check_patient(p, i % 5 < 3)

assert len(db) == 20 and len(trackers) == 4
for g in range(0, 20, 5):  # each condition group: well controlled, poor adherence, one flare
    a = [adherence(p) for p in db[g:g + 3]]
    assert a[0] > 0.85 and a[1] < 0.6, (g, a)  # profiles really differ
assert db[0]["asthmaTreatmentPlan"]["status"] == "Green"
assert db[1]["asthmaTreatmentPlan"]["status"] != "Green"  # untreated drift shows up
assert len({p["_id"] for p in db}) == len(db)
RED_FLAGS = {"Coughing up blood", "Fever", "Nausea or vomiting", "Blue lips or fingers", "Fainting"}


def badness(readings):
    """The day's device result, higher = worse; None if no accepted reading."""
    ok = [b for b in readings if b["accepted"]]
    if not ok:
        return None
    if "fvcPlusResults" in ok[0]:
        return -max(b["fvcPlusResults"]["fev1PercentPredicted"] for b in ok)
    if "glucoseResults" in ok[0]:
        return sum(b["glucoseResults"]["glucose"] for b in ok) / len(ok)
    return -min(b["oximetryResults"]["spo2"] for b in ok)


def days_of(p):
    """Per logged day: (day, feel, symptoms, badness, accepted readings, as-needed doses). New diseases only."""
    t = trackers[p["dailyLogs"][0]["trackerResponses"][0]["trackerId"]]
    q = {x["type"]: x["id"] for x in t["questions"]}
    prn = next(m["id"] for m in p["medications"] if m["dosage"]["asNeeded"])
    by_day = {}
    for b in p["medicalDevices"][0]["baselineReadings"]:
        by_day.setdefault(b["date"][:10], []).append(b)
    out = []
    for l in p["dailyLogs"]:
        r = {a["questionId"]: a["value"] for s in l["trackerResponses"] for a in s["responses"]}
        rd = by_day.get(l["day"], [])
        out.append((l["day"], r[q["faceScale"]], set(json.loads(r[q["checkbox"]])) - {"None of these "}, badness(rd),
                    [b for b in rd if b["accepted"]], sum(m["id"] == prn for m in l["medicationAdministrations"])))
    return out


peaks = []
for g in range(5, 20, 5):  # the rules below hold for the 3 tidy patients only
    for i, p in enumerate(db[g:g + 3]):
        rows = days_of(p)
        for day, feel, syms, bad, ok, prn in rows:
            if feel == "Great":
                assert not syms & RED_FLAGS and len(syms - {"Shakiness"}) <= 1, (day, syms)
            if i == 0:
                assert not syms & RED_FLAGS, (day, syms, "warning sign in a well patient")
        if i == 2:
            peaks.append(max((r for r in rows if r[3] is not None), key=lambda r: r[3])[0])
assert len({date.fromisoformat(d).isocalendar()[1] for d in peaks}) == len(peaks), ("flares share a week", peaks)
t1d = [days_of(p) for p in db[10:13]]
for rows in t1d:
    for day, feel, syms, bad, ok, prn in rows:
        assert prn == sum(b["glucoseResults"]["glucose"] > 250 for b in ok), (day, "one correction dose per high")
        assert ("Shakiness" in syms) == any(b["glucoseResults"]["glucose"] < 70 for b in ok), (day, "shaky = a low")
mean = lambda rows: sum(r[3] for r in rows) / len(rows)
assert mean(t1d[1][-15:]) > mean(t1d[0][-15:]) + 40, "missed insulin -> higher sugars"

messy = [p for i, p in enumerate(db) if i % 5 >= 3]
for p in messy:  # really messier: skipped days and questions
    t = trackers[next(s for l in p["dailyLogs"] for s in l["trackerResponses"])["trackerId"]]
    assert len(p["dailyLogs"]) < 88 and any(0 < len(s["responses"]) < len(t["questions"]) - 1
                                            for l in p["dailyLogs"] for s in l["trackerResponses"])
assert any(sum(b["accepted"] for b in p["medicalDevices"][0]["baselineReadings"] if b["date"][:10] == l["day"]) in (1, 2)
           for p in messy[:4] for l in p["dailyLogs"]), "some spirometry sessions stop early"

print("ok:", len(db), "patients")
for p in db:
    dev = p["medicalDevices"][0]
    print(f"  {p['medications'][0]['relatedCondition']}: {len(p['dailyLogs'])} days, adherence {adherence(p):.0%}, "
          f"{dev['name']} {len(dev['baselineReadings'])} readings, plan {(p['asthmaTreatmentPlan'] or {}).get('status', '-')}")
