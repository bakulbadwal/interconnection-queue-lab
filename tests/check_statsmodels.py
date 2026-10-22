"""Cross-check models/stats.py against statsmodels, an implementation we didn't write.

    uv run --with statsmodels python3 tests/check_statsmodels.py

statsmodels.duration.survfunc.CumIncidenceRight estimates Aalen–Johansen cumulative incidence;
SurvfuncRight estimates Kaplan–Meier. Both must match our estimators to 1e-9 at every battery time.
"""
import json, os, sys, warnings

import numpy as np
from statsmodels.duration.survfunc import CumIncidenceRight, SurvfuncRight

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "models"))
from stats import load, select, durations, aalen_johansen, kaplan_meier_cod, at, YEAR


def step_at(times, vals, t):
    """Right-continuous step function from statsmodels' (times, values) at t."""
    i = np.searchsorted(times, t + 1e-12, side="right") - 1
    return 0.0 if i < 0 else float(vals[i])


def main():
    warnings.simplefilter("ignore", RuntimeWarning)  # statsmodels' variance terms; we only compare point estimates
    d, rows = load()
    B = json.load(open(os.path.join(HERE, "battery.json")))
    R = {n: i for i, n in enumerate(d["regions"])}
    T = {n: i for i, n in enumerate(d["types"])}
    fails, n = 0, 0
    for spec in [s for s in B["slices"] if s.get("timing")]:
        rr = select(rows, regions=[R[x] for x in spec["regions"]] if "regions" in spec else None,
                    types=[T[x] for x in spec["types"]] if "types" in spec else None,
                    years=spec.get("years"), mw=spec.get("mw"), timing=True)
        dur = durations(rr, d["censor"])
        t = np.array([x[0] for x in dur], float) / YEAR
        k = np.array([x[1] for x in dur], int)
        ci = CumIncidenceRight(t, k)
        km = SurvfuncRight(t, (k == 1).astype(int))
        aj, ours_km = aalen_johansen(dur), kaplan_meier_cod(dur)
        for tt in B["times"]:
            pairs = [(at(aj, tt, 2), step_at(ci.times, ci.cinc[0], tt), "CIF_cod"),
                     (at(aj, tt, 3), step_at(ci.times, ci.cinc[1], tt), "CIF_wd"),
                     (at(ours_km, tt, 1), 1 - step_at(km.surv_times, km.surv_prob, tt) if len(km.surv_times) and tt >= km.surv_times[0] else 0.0, "KM")]
            for ours, theirs, what in pairs:
                n += 1
                if abs(ours - theirs) > 1e-9:
                    fails += 1
                    print(f"FAIL {spec['name']} {what} @ {tt}y: ours {ours:.12f} statsmodels {theirs:.12f}")
    print(f"statsmodels cross-check: {n - fails}/{n} agree to 1e-9")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
