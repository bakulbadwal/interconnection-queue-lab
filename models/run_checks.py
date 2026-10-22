"""Compute every battery case in Python and print it as JSON (read by tests/check.mjs).

    python3 models/run_checks.py > tests/out/py.json
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stats import (load, select, shares, durations, aalen_johansen, kaplan_meier_cod, at, naive_by,
                   landmark, quantile, built_waits, at_risk)
from econ import load_options, delay_cost, option_view, portfolio

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    d, rows = load()
    B = json.load(open(os.path.join(HERE, "..", "tests", "battery.json")))
    O = load_options()
    C = d["censor"]
    R = {n: i for i, n in enumerate(d["regions"])}
    T = {n: i for i, n in enumerate(d["types"])}
    out = {}

    def sl(spec):
        return select(rows, regions=[R[x] for x in spec["regions"]] if "regions" in spec else None,
                      types=[T[x] for x in spec["types"]] if "types" in spec else None,
                      years=spec.get("years"), mw=spec.get("mw"), timing=spec.get("timing", False))

    steps_by, dur_by = {}, {}
    for spec in B["slices"]:
        rr = sl(spec); k = "slice:" + spec["name"]
        for w in ["n", "mw"]:
            s = shares(rr, w)
            out[f"{k}:{w}:total"] = s["total"]
            for i, v in enumerate(s["share"]):
                out[f"{k}:{w}:share{i}"] = v
        if spec.get("timing"):
            dur = durations(rr, C)
            aj, km = aalen_johansen(dur), kaplan_meier_cod(dur)
            steps_by[spec["name"]] = aj
            dur_by[spec["name"]] = dur
            for t in B["times"]:
                out[f"{k}:aj:S:{t}"] = at(aj, t, 1)
                out[f"{k}:aj:cod:{t}"] = at(aj, t, 2)
                out[f"{k}:aj:wd:{t}"] = at(aj, t, 3)
                out[f"{k}:km:{t}"] = at(km, t, 1)
                out[f"{k}:naive:{t}"] = naive_by(rr, C, t)

    lm = B["landmark"]
    for L in lm["L"]:
        v = landmark(steps_by[lm["slice"]], L, lm["h"])
        for kk in ["cod", "wd", "wait", "S_L"]:
            out[f"landmark:{L}:{kk}"] = v[kk]
        out[f"landmark:{L}:atRisk"] = at_risk(dur_by[lm["slice"]], L)

    built = {}
    for spec in B["built"]:
        w = built_waits(sl(spec), spec["cod"])
        built[spec["name"]] = w
        out[f"built:{spec['name']}:n"] = len(w)
        for p in [0.1, 0.25, 0.5, 0.75, 0.9]:
            out[f"built:{spec['name']}:q{p}"] = quantile(w, p)

    for i, c in enumerate(B["delay"]):
        out[f"delay:{i}"] = delay_cost(c["T"], c["T0"], c["mw"], c["V"], c["r"])

    camp = O["campus"]
    V, r = camp["valuePerMWyr"], camp["discount"]
    measured = {"waits": built["pjm-gas-big"], "p": at(steps_by["pjm-gas-big"], 10, 2)}
    views = {o["id"]: option_view(o, camp, V, r, measured, quantile) for o in O["options"]}
    for k, v in views.items():
        for kk in ["p", "p10", "p50", "p90", "onByDeadline", "costPerMW"]:
            out[f"option:{k}:{kk}"] = v[kk]
    for pf in B["portfolios"]:
        res = portfolio(views, pf["alloc"], camp["needMW"], camp["fallbackYears"], camp, V, r)
        for kk in ["expectedMW", "pNeed", "cost"]:
            out[f"portfolio:{pf['name']}:{kk}"] = res[kk]

    json.dump(out, sys.stdout, indent=0, sort_keys=True)


if __name__ == "__main__":
    main()
