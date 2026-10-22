// stats.js — every estimator the page runs. Pure functions, shared by the page and tests/check.mjs.
// Twin: models/stats.py (stdlib). Cross-check: tests/check_statsmodels.py (an independent implementation).
//
// Rows come from data/queue.json as columns: r region, t type, mw, q request date and e event date
// (days since 2000-01-01), s status (0 in queue, 1 operational, 2 withdrawn), tm (1 = timing sample).
// Durations are in years = days / 365.25.

export const YEAR = 365.25;

/** Columns → row objects, plus the request year (computed once). */
export function rowsOf(d) {
  const out = new Array(d.r.length);
  for (let i = 0; i < d.r.length; i++) {
    out[i] = { r: d.r[i], t: d.t[i], mw: d.mw[i], q: d.q[i], s: d.s[i], e: d.e[i], tm: d.tm[i], y: yearOf(d.q[i]) };
  }
  return out;
}

const EPOCH = Date.UTC(2000, 0, 1);
export const yearOf = days => new Date(EPOCH + days * 86400000).getUTCFullYear();

/** Filter rows. Any criterion left null means "all". mw is [lo, hi). */
export function select(rows, { regions = null, types = null, years = null, mw = null, timing = false } = {}) {
  return rows.filter(x =>
    (!timing || x.tm) &&
    (!regions || regions.includes(x.r)) &&
    (!types || types.includes(x.t)) &&
    (!years || (x.y >= years[0] && x.y <= years[1])) &&
    (!mw || (x.mw >= mw[0] && x.mw < mw[1])));
}

/** Status as of the end of 2025, by count ("n") or by capacity ("mw"). share = [in queue, operational, withdrawn]. */
export function shares(rows, weight = "n") {
  const w = [0, 0, 0];
  for (const x of rows) w[x.s] += weight === "n" ? 1 : x.mw;
  const total = w[0] + w[1] + w[2];
  return { n: rows.length, total, w, share: w.map(v => (total ? v / total : 0)) };
}

/** [time in days, cause] pairs; cause 0 = censored (still in queue at the censor date), 1 = COD, 2 = withdrawn. */
export function durations(rows, censor) {
  return rows.map(x => (x.s === 0 || x.e === null ? [censor - x.q, 0] : [x.e - x.q, x.s]));
}

const byTime = (a, b) => a[0] - b[0] || a[1] - b[1];

/**
 * Aalen–Johansen cumulative incidence with two competing events.
 * Returns steps [tYears, S, CIF_cod, CIF_wd], starting at [0, 1, 0, 0].
 * Events at a time are processed before censorings at that time.
 */
export function aalenJohansen(dur) {
  const d = [...dur].sort(byTime);
  let n = d.length, S = 1, F1 = 0, F2 = 0, i = 0;
  const steps = [[0, 1, 0, 0]];
  while (i < d.length) {
    const t = d[i][0];
    let d1 = 0, d2 = 0, c = 0;
    while (i < d.length && d[i][0] === t) { const k = d[i][1]; if (k === 1) d1++; else if (k === 2) d2++; else c++; i++; }
    if (d1 || d2) {
      F1 += S * d1 / n;
      F2 += S * d2 / n;
      S *= 1 - (d1 + d2) / n;
      steps.push([t / YEAR, S, F1, F2]);
    }
    n -= d1 + d2 + c;
  }
  return steps;
}

/** The tempting mistake: Kaplan–Meier for COD with withdrawals treated as censored. Returns steps [t, 1 − KM]. */
export function kaplanMeierCod(dur) {
  const d = [...dur].sort(byTime);
  let n = d.length, S = 1, i = 0;
  const steps = [[0, 0]];
  while (i < d.length) {
    const t = d[i][0];
    let ev = 0, m = 0;
    while (i < d.length && d[i][0] === t) { if (d[i][1] === 1) ev++; m++; i++; }
    if (ev) { S *= 1 - ev / n; steps.push([t / YEAR, 1 - S]); }
    n -= m;
  }
  return steps;
}

/** Right-continuous step value at time t (years); col indexes the step tuple. */
export function at(steps, t, col) {
  let lo = 0, hi = steps.length - 1;
  if (steps[0][0] > t + 1e-12) return steps[0][col];
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (steps[mid][0] <= t + 1e-12) lo = mid; else hi = mid - 1; }
  return steps[lo][col];
}

/** The naive count: share of requests that reached COD within t years, unfinished ones counted as "not yet". */
export function naiveBy(rows, censor, tYears) {
  const lim = tYears * YEAR;
  let hit = 0;
  for (const x of rows) if (x.s === 1 && x.e !== null && x.e - x.q <= lim) hit++;
  return rows.length ? hit / rows.length : 0;
}

/** Given still in the queue at L years: P(COD by L+h), P(withdrawn by L+h), P(still waiting). */
export function landmark(steps, L, h) {
  const SL = at(steps, L, 1);
  if (SL <= 0) return null;
  const cod = (at(steps, L + h, 2) - at(steps, L, 2)) / SL;
  const wd = (at(steps, L + h, 3) - at(steps, L, 3)) / SL;
  return { cod, wd, wait: 1 - cod - wd, SL };
}

/** Type-7 quantile (linear interpolation), the same rule as numpy's default and models/stats.py. */
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const hh = (sorted.length - 1) * p, lo = Math.floor(hh), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (hh - lo) * (sorted[hi] - sorted[lo]);
}

/** Request→COD waits (years, sorted) for projects that reached COD in the given calendar years. */
export function builtWaits(rows, codYears) {
  const w = [];
  for (const x of rows) {
    if (x.s !== 1 || x.e === null) continue;
    const y = yearOf(x.e);
    if (y >= codYears[0] && y <= codYears[1]) w.push((x.e - x.q) / YEAR);
  }
  return w.sort((a, b) => a - b);
}

/** How many requests were still in the queue (no event, not yet censored) at L years. */
export function atRisk(dur, L) {
  const lim = L * YEAR;
  let n = 0;
  for (const [t] of dur) if (t > lim) n++;
  return n;
}

/** Curves stop once fewer than this many requests are still being watched: past that, one project moves the curve. */
export const MIN_AT_RISK = 10;

/** Last time (years, on a 0.1 grid, ≤ tMax) at which at least MIN_AT_RISK requests are still being watched. */
export function followUp(dur, tMax = 12) {
  let tStop = 0;
  for (let i = 0; i <= Math.round(tMax * 10); i++) if (atRisk(dur, i / 10) >= MIN_AT_RISK) tStop = i / 10;
  return tStop;
}
