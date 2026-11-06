"""Checks for data/synthetic_db.json. Run from the repo root: python data/test_synthetic_db.py"""
import json

db = json.load(open("data/synthetic_db.json", encoding="utf-8"))
tracker = json.load(open("data/synthetic_tracker_definition.json", encoding="utf-8"))
ref = json.load(open("data/sample_db.json", encoding="utf-8"))[0]  # structure reference only

TOP = set(ref)
LOG_KEYS = {"day", "allMedicationsAdministered", "trackerResponses", "medicationAdministrations"}
BLOW_KEYS = set(ref["medicalDevices"][0]["baselineReadings"][0]["fvcPlusResults"])
DEVICE_KEYS = set(ref["medicalDevices"][0])
MED_KEYS = set(ref["medications"][0])
qtypes = {q["id"]: q for q in tracker["questions"]}


def check_patient(p):
    assert set(p) == TOP, set(p) ^ TOP
    med_ids = {m["id"] for m in p["medications"]}
    controller = next(m["id"] for m in p["medications"] if m["howOften"] == "Daily")
    assert all(set(m) == MED_KEYS for m in p["medications"])

    days = [l["day"] for l in p["dailyLogs"]]
    assert days == sorted(days) and len(days) == len(set(days)), "one entry per day, sorted"
    for l in p["dailyLogs"]:
        assert set(l) == LOG_KEYS
        for tr in l["trackerResponses"]:
            assert set(tr) == {"trackerId", "date", "responses"} and tr["trackerId"] == tracker["id"]
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
                    assert {"fev1", "fvc", "pef"} <= set(json.loads(v))
        doses = [m for m in l["medicationAdministrations"] if m["id"] == controller]
        assert l["allMedicationsAdministered"] == (len(doses) == 2)
        for m in l["medicationAdministrations"]:
            assert m["id"] in med_ids and set(m) == {"id", "time", "name", "value"}

    dev = p["medicalDevices"][0]
    assert set(dev) == DEVICE_KEYS
    br = dev["baselineReadings"]
    assert [b["date"] for b in br] == sorted(b["date"] for b in br)
    by_day = {}
    for b in br:
        r = b["fvcPlusResults"]
        assert set(r) == BLOW_KEYS
        assert b["accepted"] == (b["qualityReport"]["quality"] == "Acceptable")
        assert b["accepted"] == (not b["qualityReport"]["qualityIndications"])
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
        assert len(top) >= 3 and top[0] - top[1] <= 0.15, (day, top)

    plan = p["asthmaTreatmentPlan"]
    assert plan["status"] in ("Green", "Yellow", "Red")
    assert (plan["retestTime"] is None) == (plan["status"] == "Green")


def adherence(p):
    controller = next(m["id"] for m in p["medications"] if m["howOften"] == "Daily")
    n = sum(1 for l in p["dailyLogs"] for m in l["medicationAdministrations"] if m["id"] == controller)
    return n / (2 * len(p["dailyLogs"]))


for p in db:
    check_patient(p)

a = [adherence(p) for p in db]
assert a[0] > 0.85 and a[1] < 0.6, a  # profiles really differ
assert db[0]["asthmaTreatmentPlan"]["status"] == "Green"
assert db[1]["asthmaTreatmentPlan"]["status"] != "Green"  # untreated drift shows up
assert len({p["_id"] for p in db}) == len(db)
print("ok:", len(db), "patients |", ", ".join(
    f"{len(p['dailyLogs'])} days, {len(p['medicalDevices'][0]['baselineReadings'])} blows, "
    f"adherence {adherence(p):.0%}, plan {p['asthmaTreatmentPlan']['status']}" for p in db))
