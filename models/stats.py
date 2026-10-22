"""stats.py — the Python twin of js/stats.js. Pure standard library.

Every estimator the page runs is restated here so `make check` can compare the two to 1e-9,
and tests/check_lifelines.py compares this file to statsmodels (an independent implementation).

Conventions (same as the page):
  rows are dicts with r (region index), t (type index), mw, q (request date, days since 2000-01-01),
  s (0 in queue, 1 operational, 2 withdrawn), e (event date or None), tm (1 = in the timing sample).
  Durations are in years = days / 365.25.
"""
import json, math, os

YEAR = 365.25
HERE = os.path.dirname(os.path.abspath(__file__))


def load(path=os.path.join(HERE, "..", "data", "queue.json")):
    d = json.load(open(path))
    keys = ["r", "t", "mw", "q", "s", "e", "tm"]
    rows = [dict(zip(keys, v)) for v in zip(*(d[k] for k in keys))]
    for x in rows:
        x["y"] = year_of(x["q"])
    return d, rows


def year_of(days):
    """Calendar year of a day offset from 2000-01-01 (proleptic Gregorian)."""
    import datetime
    return (datetime.date(2000, 1, 1) + datetime.timedelta(days=days)).year


def select(rows, regions=None, types=None, years=None, mw=None, timing=False):
    out = []
    for x in rows:
        if timing and not x["tm"]:
            continue
        if regions is not None and x["r"] not in regions:
            continue
        if types is not None and x["t"] not in types:
            continue
        if years is not None and not (years[0] <= x["y"] <= years[1]):
            continue
        if mw is not None and not (mw[0] <= x["mw"] < mw[1]):
            continue
        out.append(x)
    return out


def shares(rows, weight="n"):
    """Status as of the end of 2025: share in queue / operational / withdrawn, by count or by MW."""
    w = [0.0, 0.0, 0.0]
    for x in rows:
        w[x["s"]] += 1 if weight == "n" else x["mw"]
    tot = sum(w)
    return {"n": len(rows), "total": tot, "share": [v / tot if tot else 0.0 for v in w]}


def durations(rows, censor):
    """(time in days, cause) with cause 0 = censored (still in queue), 1 = COD, 2 = withdrawn."""
    out = []
    for x in rows:
        if x["s"] == 0 or x["e"] is None:
            out.append((censor - x["q"], 0))
        else:
            out.append((x["e"] - x["q"], x["s"]))
    return out


def aalen_johansen(dur):
    """Cumulative incidence of COD and of withdrawal, plus overall survival, at each distinct event time.

    Returns a list of steps (t_years, S, CIF_cod, CIF_wd) starting at (0, 1, 0, 0). Events at a time are
    processed before censorings at that time (the usual convention).
    """
    dur = sorted(dur)
    n = len(dur)
    S, F1, F2 = 1.0, 0.0, 0.0
    steps = [(0.0, 1.0, 0.0, 0.0)]
    i = 0
    while i < len(dur):
        t = dur[i][0]
        d1 = d2 = c = 0
        while i < len(dur) and dur[i][0] == t:
            k = dur[i][1]
            if k == 1: d1 += 1
            elif k == 2: d2 += 1
            else: c += 1
            i += 1
        if d1 or d2:
            F1 += S * d1 / n
            F2 += S * d2 / n
            S *= 1 - (d1 + d2) / n
            steps.append((t / YEAR, S, F1, F2))
        n -= d1 + d2 + c
    return steps


def kaplan_meier_cod(dur):
    """The tempting mistake: Kaplan–Meier for COD with withdrawals treated as censored. Returns 1 − KM."""
    dur = sorted(dur)
    n, S, i = len(dur), 1.0, 0
    steps = [(0.0, 0.0)]
    while i < len(dur):
        t = dur[i][0]
        d = m = 0
        while i < len(dur) and dur[i][0] == t:
            d += dur[i][1] == 1
            m += 1
            i += 1
        if d:
            S *= 1 - d / n
            steps.append((t / YEAR, 1 - S))
        n -= m
    return steps


def at(steps, t, col):
    """Right-continuous step function value at time t (years)."""
    v = steps[0][col]
    for s in steps:
        if s[0] <= t + 1e-12:
            v = s[col]
        else:
            break
    return v


def naive_by(rows, censor, t_years):
    """Share of requests that reached COD within t years, counting unfinished requests as not-yet (the naive count)."""
    lim = t_years * YEAR
    hit = sum(1 for x in rows if x["s"] == 1 and x["e"] is not None and x["e"] - x["q"] <= lim)
    return hit / len(rows) if rows else 0.0


def landmark(steps, L, h):
    """Given still in queue at L years: P(COD by L+h), P(withdrawn by L+h), P(still waiting)."""
    S_L = at(steps, L, 1)
    if S_L <= 0:
        return None
    f1 = (at(steps, L + h, 2) - at(steps, L, 2)) / S_L
    f2 = (at(steps, L + h, 3) - at(steps, L, 3)) / S_L
    return {"cod": f1, "wd": f2, "wait": 1 - f1 - f2, "S_L": S_L}


def quantile(sorted_vals, p):
    """Type-7 (linear interpolation) quantile, the same rule as numpy's default and js/stats.js."""
    if not sorted_vals:
        return None
    h = (len(sorted_vals) - 1) * p
    lo = math.floor(h)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (h - lo) * (sorted_vals[hi] - sorted_vals[lo])


def built_waits(rows, cod_years):
    """Request→COD waits (years), sorted, for projects that reached COD in the given calendar years."""
    w = [(x["e"] - x["q"]) / YEAR for x in rows
         if x["s"] == 1 and x["e"] is not None and cod_years[0] <= year_of(x["e"]) <= cod_years[1]]
    return sorted(w)


def at_risk(dur, L):
    """How many requests were still in the queue (no event, not yet censored) at L years."""
    lim = L * YEAR
    return sum(1 for t, _ in dur if t > lim)
