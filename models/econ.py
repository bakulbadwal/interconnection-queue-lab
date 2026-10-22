"""econ.py — the Python twin of js/econ.js: what a delay costs and how the options compare. Pure stdlib.

Delay cost (present value at the decision date, $M):
    a campus ready at T0 that gets power at T loses its value V ($M per MW-year) on every MW,
    for every year between T0 and T, discounted continuously at r:
        cost = MW · V · (e^(−r·T0) − e^(−r·T)) / r     for T > T0, else 0  (the null case).
    If the GPUs are already bought, idle years also burn their straight-line depreciation,
    capex per MW / life, which is added to V.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
N_GRID = 4000  # midpoint-rule points for integrals over a triangular range (same in JS)


def load_options(path=os.path.join(HERE, "..", "data", "options.json")):
    return json.load(open(path))


def value_per_mw_yr(campus, V=None, gpus_bought=False):
    v = campus["valuePerMWyr"] if V is None else V
    return v + (campus["capexPerMW"] / campus["lifeYears"] if gpus_bought else 0.0)


def delay_cost(T, T0, mw, V, r):
    if T <= T0:
        return 0.0
    if r == 0:
        return mw * V * (T - T0)
    return mw * V * (math.exp(-r * T0) - math.exp(-r * T)) / r


def tri_pdf(x, a, c, b):
    if x < a or x > b:
        return 0.0
    if x < c:
        return 2 * (x - a) / ((b - a) * (c - a)) if c > a else 0.0
    return 2 * (b - x) / ((b - a) * (b - c)) if b > c else 0.0


def tri_cdf(x, a, c, b):
    if x <= a:
        return 0.0
    if x >= b:
        return 1.0
    if x <= c:
        return (x - a) ** 2 / ((b - a) * (c - a))
    return 1 - (b - x) ** 2 / ((b - a) * (b - c))


def tri_quantile(p, a, c, b):
    fc = (c - a) / (b - a)
    if p <= fc:
        return a + math.sqrt(p * (b - a) * (c - a))
    return b - math.sqrt((1 - p) * (b - a) * (b - c))


def tri_expected_cost(tri, T0, mw, V, r):
    a, c, b = tri
    dx = (b - a) / N_GRID
    tot = 0.0
    for i in range(N_GRID):
        x = a + (i + 0.5) * dx
        tot += delay_cost(x, T0, mw, V, r) * tri_pdf(x, a, c, b) * dx
    return tot


def empirical_summary(waits, T0, mw, V, r, quantile):
    """Delay-cost summary over an empirical list of waits (years, sorted)."""
    costs = sorted(delay_cost(w, T0, mw, V, r) for w in waits)
    return {"n": len(waits), "mean": sum(costs) / len(costs) if costs else 0.0,
            "p50": quantile(costs, 0.5), "p90": quantile(costs, 0.9),
            "late": sum(1 for w in waits if w > T0) / len(waits) if waits else 0.0}


def option_view(opt, campus, V, r, measured=None, quantile=None):
    """Time-to-power summary and expected delay cost (per MW) for one option.

    measured = {"waits": sorted list, "p": odds} for the queue option.
    """
    T0 = campus["readyYears"]
    if opt["time"] == "measured":
        w = measured["waits"]
        return {"id": opt["id"], "p": measured["p"], "n": len(w),
                "p10": quantile(w, 0.1), "p50": quantile(w, 0.5), "p90": quantile(w, 0.9),
                "onByDeadline": sum(1 for x in w if x <= campus["deadlineYears"]) / len(w),
                "costPerMW": sum(delay_cost(x, T0, 1, V, r) for x in w) / len(w)}
    a, c, b = opt["time"]
    return {"id": opt["id"], "p": opt["p"], "n": None,
            "p10": tri_quantile(0.1, a, c, b), "p50": tri_quantile(0.5, a, c, b), "p90": tri_quantile(0.9, a, c, b),
            "onByDeadline": tri_cdf(campus["deadlineYears"], a, c, b),
            "costPerMW": tri_expected_cost((a, c, b), T0, 1, V, r)}


def portfolio(views, alloc, need, fallback_years, campus, V, r):
    """Exact distribution of MW online by the deadline, assuming options succeed independently.

    views: option_view() results by id; alloc: MW per id. An option is on time with probability
    p × P(time ≤ deadline). Its expected delay cost is p × costPerMW × MW plus, if it fails, the
    cost of getting those MW at the fallback year instead.
    """
    ids = [k for k in alloc if alloc[k] > 0]
    q = {k: views[k]["p"] * views[k]["onByDeadline"] for k in ids}
    dist = {}
    for mask in range(1 << len(ids)):
        pr, mw = 1.0, 0.0
        for j, k in enumerate(ids):
            if mask >> j & 1:
                pr *= q[k]; mw += alloc[k]
            else:
                pr *= 1 - q[k]
        dist[mw] = dist.get(mw, 0.0) + pr
    T0 = campus["readyYears"]
    fb = delay_cost(fallback_years, T0, 1, V, r)
    cost = sum(alloc[k] * (views[k]["p"] * views[k]["costPerMW"] + (1 - views[k]["p"]) * fb) for k in ids)
    return {"expectedMW": sum(alloc[k] * q[k] for k in ids),
            "pNeed": sum(p for m, p in dist.items() if m >= need - 1e-9),
            "cost": cost, "dist": sorted(dist.items())}
