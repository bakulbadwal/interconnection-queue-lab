// econ.js — what a delay costs and how the ways around the queue compare. Twin: models/econ.py.
//
// Delay cost (present value at the decision date, $M): a campus ready at T0 that gets power at T loses its
// value V ($M per MW-year) on every MW for every year between T0 and T, discounted continuously at r:
//     cost = MW · V · (e^(−r·T0) − e^(−r·T)) / r   for T > T0, else 0 (the null case).
// If the GPUs are already bought, idle years also burn straight-line depreciation (capex per MW / life).

export const N_GRID = 4000; // midpoint-rule points for integrals over a triangular range (same in Python)

export const valuePerMWyr = (campus, V = campus.valuePerMWyr, gpusBought = false) =>
  V + (gpusBought ? campus.capexPerMW / campus.lifeYears : 0);

export function delayCost(T, T0, mw, V, r) {
  if (T <= T0) return 0;
  if (r === 0) return mw * V * (T - T0);
  return mw * V * (Math.exp(-r * T0) - Math.exp(-r * T)) / r;
}

export function triPdf(x, a, c, b) {
  if (x < a || x > b) return 0;
  if (x < c) return c > a ? 2 * (x - a) / ((b - a) * (c - a)) : 0;
  return b > c ? 2 * (b - x) / ((b - a) * (b - c)) : 0;
}
export function triCdf(x, a, c, b) {
  if (x <= a) return 0;
  if (x >= b) return 1;
  if (x <= c) return (x - a) ** 2 / ((b - a) * (c - a));
  return 1 - (b - x) ** 2 / ((b - a) * (b - c));
}
export function triQuantile(p, a, c, b) {
  const fc = (c - a) / (b - a);
  return p <= fc ? a + Math.sqrt(p * (b - a) * (c - a)) : b - Math.sqrt((1 - p) * (b - a) * (b - c));
}
export function triExpectedCost([a, c, b], T0, mw, V, r) {
  const dx = (b - a) / N_GRID;
  let tot = 0;
  for (let i = 0; i < N_GRID; i++) { const x = a + (i + 0.5) * dx; tot += delayCost(x, T0, mw, V, r) * triPdf(x, a, c, b) * dx; }
  return tot;
}

/** Delay-cost summary over an empirical list of waits (years, sorted). */
export function empiricalSummary(waits, T0, mw, V, r, quantile) {
  const costs = waits.map(w => delayCost(w, T0, mw, V, r)).sort((a, b) => a - b);
  return {
    n: waits.length,
    mean: costs.length ? costs.reduce((s, v) => s + v, 0) / costs.length : 0,
    p50: quantile(costs, 0.5), p90: quantile(costs, 0.9),
    late: waits.length ? waits.filter(w => w > T0).length / waits.length : 0,
  };
}

/** Time-to-power summary and expected delay cost per MW for one option. measured = { waits, p } for the queue. */
export function optionView(opt, campus, V, r, measured, quantile) {
  const T0 = campus.readyYears;
  if (opt.time === "measured") {
    const w = measured.waits;
    return {
      id: opt.id, p: measured.p, n: w.length,
      p10: quantile(w, 0.1), p50: quantile(w, 0.5), p90: quantile(w, 0.9),
      onByDeadline: w.filter(x => x <= campus.deadlineYears).length / w.length,
      costPerMW: w.reduce((s, x) => s + delayCost(x, T0, 1, V, r), 0) / w.length,
    };
  }
  const [a, c, b] = opt.time;
  return {
    id: opt.id, p: opt.p, n: null,
    p10: triQuantile(0.1, a, c, b), p50: triQuantile(0.5, a, c, b), p90: triQuantile(0.9, a, c, b),
    onByDeadline: triCdf(campus.deadlineYears, a, c, b),
    costPerMW: triExpectedCost([a, c, b], T0, 1, V, r),
  };
}

/**
 * Exact distribution of MW online by the deadline, options succeeding independently.
 * An option is on time with probability p × P(time ≤ deadline). Its expected delay cost is
 * p × costPerMW × MW, plus (1 − p) × the cost of getting those MW at the fallback year instead.
 */
export function portfolio(views, alloc, need, fallbackYears, campus, V, r) {
  const ids = Object.keys(alloc).filter(k => alloc[k] > 0);
  const q = Object.fromEntries(ids.map(k => [k, views[k].p * views[k].onByDeadline]));
  const dist = new Map();
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    let pr = 1, mw = 0;
    ids.forEach((k, j) => { if ((mask >> j) & 1) { pr *= q[k]; mw += alloc[k]; } else pr *= 1 - q[k]; });
    dist.set(mw, (dist.get(mw) || 0) + pr);
  }
  const fb = delayCost(fallbackYears, campus.readyYears, 1, V, r);
  const cost = ids.reduce((s, k) => s + alloc[k] * (views[k].p * views[k].costPerMW + (1 - views[k].p) * fb), 0);
  let pNeed = 0;
  for (const [m, p] of dist) if (m >= need - 1e-9) pNeed += p;
  return {
    expectedMW: ids.reduce((s, k) => s + alloc[k] * q[k], 0),
    pNeed, cost, dist: [...dist.entries()].sort((a, b) => a[0] - b[0]),
  };
}
