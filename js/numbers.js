// numbers.js — every number the prose quotes, computed once from the data and formatted exactly as the page
// shows it. Steps interpolate from here (never hard-code a figure); tests/check.mjs writes the result to
// tests/numbers.json and fails on any literal % or $ in js/steps/*.js that isn't traced to it.
import * as S from "./stats.js";
import * as E from "./econ.js";

export const fmt = {
  pct: (x, d = 0) => `${(100 * x).toFixed(d)}%`,
  int: x => Math.round(x).toLocaleString("en-US"),
  yr: (x, d = 1) => `${x.toFixed(d)} yr`,
  mo: x => `${Math.round(x)} months`,
  money: x => (Math.abs(x) < 0.05 ? "$0" : Math.abs(x) >= 1000 ? `$${(x / 1000).toFixed(2)}B` : `$${x.toFixed(Math.abs(x) >= 100 ? 0 : 1)}M`),
  mwyr: x => `$${x.toFixed(2)}M`,
  mw: x => `${Math.round(x)} MW`,
};

/** The shared analysis context: indexes, the default slices, measured option inputs. */
export function context({ D, O, rows }) {
  const R = Object.fromEntries(D.regions.map((n, i) => [n, i])), T = Object.fromEntries(D.types.map((n, i) => [n, i]));
  const C = D.censor;
  const sel = spec => S.select(rows, {
    regions: spec.regions ? spec.regions.map(x => R[x]) : null, types: spec.types ? spec.types.map(x => T[x]) : null,
    years: spec.years || null, mw: spec.mw || null, timing: !!spec.timing,
  });
  const queueOpt = O.options.find(o => o.id === "queue");
  const qRows = sel({ ...queueOpt.slice, timing: true });
  const qSteps = S.aalenJohansen(S.durations(qRows, C));
  const qWaits = S.builtWaits(sel(queueOpt.slice), [queueOpt.slice.years[0], 2025]);
  const measured = { waits: qWaits, p: S.at(qSteps, queueOpt.pHorizon, 2), n: qRows.length };
  return { R, T, C, sel, measured };
}

export function views(O, measured, V = O.campus.valuePerMWyr, r = O.campus.discount) {
  return Object.fromEntries(O.options.map(o => [o.id, E.optionView(o, O.campus, V, r, measured, S.quantile)]));
}

export function computeNumbers({ D, O, rows }) {
  const cx = context({ D, O, rows });
  const { sel, C, measured } = cx;
  const N = {};
  const camp = O.campus, V = camp.valuePerMWyr, r = camp.discount;

  // Step 0 — the line
  N.requests = fmt.int(rows.length);
  N.timingN = fmt.int(rows.filter(x => x.tm).length);
  const c = sel({ years: [2000, 2020] });
  const cn = S.shares(c, "n"), cm = S.shares(c, "mw");
  N.c2020n = fmt.int(c.length);
  N.c2020opMW = fmt.pct(cm.share[1]); N.c2020wdMW = fmt.pct(cm.share[2]); N.c2020qMW = fmt.pct(cm.share[0]);
  N.c2020opN = fmt.pct(cn.share[1]);
  N.c2020GW = fmt.int(cm.total / 1000) + " GW";
  N.c2020opGW = fmt.int(cm.w[1] / 1000) + " GW";

  // Step 1 — odds (default slice: PJM, all types, timing sample)
  const pjm = sel({ regions: ["PJM"], timing: true });
  const pdur = S.durations(pjm, C), paj = S.aalenJohansen(pdur), pkm = S.kaplanMeierCod(pdur);
  N.pjmN = fmt.int(pjm.length);
  N.pjmAj5 = fmt.pct(S.at(paj, 5, 2)); N.pjmAj10 = fmt.pct(S.at(paj, 10, 2));
  N.pjmKm10 = fmt.pct(S.at(pkm, 10, 1)); N.pjmWd10 = fmt.pct(S.at(paj, 10, 3));
  N.pjmNaive10 = fmt.pct(S.naiveBy(pjm, C, 10));
  N.pjmAj10Count = fmt.int(S.at(paj, 10, 2) * pjm.length);

  // Step 2 — the wait
  const four = ["CAISO", "MISO", "PJM", "SPP"];
  const w1519 = S.builtWaits(sel({ regions: four }), [2015, 2019]), w2125 = S.builtWaits(sel({ regions: four }), [2021, 2025]);
  N.b1519n = fmt.int(w1519.length); N.b1519p50 = fmt.yr(S.quantile(w1519, 0.5)); N.b1519p90 = fmt.yr(S.quantile(w1519, 0.9));
  N.b2125n = fmt.int(w2125.length); N.b2125p50 = fmt.yr(S.quantile(w2125, 0.5)); N.b2125p90 = fmt.yr(S.quantile(w2125, 0.9));
  const w25 = S.builtWaits(rows, [2025, 2025]);
  N.b25allN = fmt.int(w25.length); N.b25allMo = fmt.mo(S.quantile(w25, 0.5) * 12);
  N.lbnlMo = fmt.mo(D.lbnlStyle.medianMonths2025); N.lbnlN = fmt.int(D.lbnlStyle.n);
  N.lbnlNotOp = fmt.int(D.lbnlStyle.nNotOperational); N.lbnlSppWd = fmt.int(D.lbnlStyle.nWithdrawnSPP);
  const tdur = S.durations(sel({ timing: true }), C), taj = S.aalenJohansen(tdur);
  for (const L of [0, 6]) {
    const lm = S.landmark(taj, L, 3);
    N[`lm${L}cod`] = fmt.pct(lm.cod); N[`lm${L}wd`] = fmt.pct(lm.wd); N[`lm${L}wait`] = fmt.pct(lm.wait);
    N[`lm${L}n`] = fmt.int(S.atRisk(tdur, L));
  }

  // Step 3 — what a year costs
  N.campusMW = fmt.mw(camp.mw); N.valueMWyr = fmt.mwyr(V); N.discount = fmt.pct(r);
  N.oneYearLate = fmt.money(E.delayCost(camp.readyYears + 1, camp.readyYears, camp.mw, V, r));
  N.depPerMWyr = fmt.mwyr(camp.capexPerMW / camp.lifeYears);
  const Vg = E.valuePerMWyr(camp, V, true);
  N.oneYearLateGpus = fmt.money(E.delayCost(camp.readyYears + 1, camp.readyYears, camp.mw, Vg, r));
  const qs = E.empiricalSummary(measured.waits, camp.readyYears, camp.mw, V, r, S.quantile);
  N.qN = fmt.int(qs.n); N.qMean = fmt.money(qs.mean); N.qP50 = fmt.money(qs.p50); N.qP90 = fmt.money(qs.p90); N.qLate = fmt.pct(qs.late);
  N.qWaitP50 = fmt.yr(S.quantile(measured.waits, 0.5)); N.qWaitP90 = fmt.yr(S.quantile(measured.waits, 0.9));
  N.qOdds = fmt.pct(measured.p); N.qReqN = fmt.int(measured.n);

  // Step 4 + capstone — the options
  const vw = views(O, measured, V, r);
  for (const [k, v] of Object.entries(vw)) {
    N[`${k}OnTime`] = fmt.pct(v.p * v.onByDeadline);
    N[`${k}P50`] = fmt.yr(v.p50);
  }
  const best = Object.values(vw).sort((a, b) => b.p * b.onByDeadline - a.p * a.onByDeadline)[0];
  N.bestOnTimeId = best.id;
  for (const [name, alloc] of Object.entries({ allQueue: { queue: 250 }, mixed: { uprate: 100, btm: 100, flex: 50 } })) {
    const pf = E.portfolio(vw, alloc, camp.needMW, camp.fallbackYears, camp, V, r);
    N[`${name}PNeed`] = fmt.pct(pf.pNeed); N[`${name}Cost`] = fmt.money(pf.cost); N[`${name}ExpMW`] = fmt.mw(pf.expectedMW);
  }
  N.needMW = fmt.mw(camp.needMW);
  return N;
}
