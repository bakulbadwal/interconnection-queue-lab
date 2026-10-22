// check.mjs — the acceptance gate. `make check` runs it.
//  1. Computes every case in tests/battery.json with js/stats.js + js/econ.js, and with the Python twins
//     (models/run_checks.py), and requires agreement to 1e-9.
//  2. Null cases and identities (no delay ⇒ $0; S + CIF_cod + CIF_wd = 1; KM = AJ without competing events; …).
//  3. Reproduces LBNL's published headline from the snapshot (13% of 2000–2020 capacity reached COD).
//  4. Writes tests/numbers.json (every number the copy quotes, formatted as the page shows it) and fails if a
//     hard-coded percentage or dollar figure in js/steps/*.js is not in it or in the sourced-constants list.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as S from "../js/stats.js";
import * as E from "../js/econ.js";
import { computeNumbers } from "../js/numbers.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const D = read("data/queue.json"), B = read("tests/battery.json"), O = read("data/options.json");
const rows = S.rowsOf(D), C = D.censor;
const R = Object.fromEntries(D.regions.map((n, i) => [n, i])), T = Object.fromEntries(D.types.map((n, i) => [n, i]));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("FAIL  " + msg); } };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

// ── 1. JS battery, same keys as models/run_checks.py
const sl = spec => S.select(rows, {
  regions: spec.regions ? spec.regions.map(x => R[x]) : null, types: spec.types ? spec.types.map(x => T[x]) : null,
  years: spec.years || null, mw: spec.mw || null, timing: !!spec.timing,
});
const js = {}, stepsBy = {}, durBy = {}, built = {};
for (const spec of B.slices) {
  const rr = sl(spec), k = "slice:" + spec.name;
  for (const w of ["n", "mw"]) {
    const sh = S.shares(rr, w);
    js[`${k}:${w}:total`] = sh.total;
    sh.share.forEach((v, i) => { js[`${k}:${w}:share${i}`] = v; });
  }
  if (spec.timing) {
    const dur = S.durations(rr, C), aj = S.aalenJohansen(dur), km = S.kaplanMeierCod(dur);
    stepsBy[spec.name] = aj; durBy[spec.name] = dur;
    for (const t of B.times) {
      js[`${k}:aj:S:${t}`] = S.at(aj, t, 1); js[`${k}:aj:cod:${t}`] = S.at(aj, t, 2); js[`${k}:aj:wd:${t}`] = S.at(aj, t, 3);
      js[`${k}:km:${t}`] = S.at(km, t, 1); js[`${k}:naive:${t}`] = S.naiveBy(rr, C, t);
    }
  }
}
for (const L of B.landmark.L) {
  const v = S.landmark(stepsBy[B.landmark.slice], L, B.landmark.h);
  js[`landmark:${L}:cod`] = v.cod; js[`landmark:${L}:wd`] = v.wd; js[`landmark:${L}:wait`] = v.wait; js[`landmark:${L}:S_L`] = v.SL;
  js[`landmark:${L}:atRisk`] = S.atRisk(durBy[B.landmark.slice], L);
}
for (const spec of B.built) {
  const w = S.builtWaits(sl(spec), spec.cod);
  built[spec.name] = w;
  js[`built:${spec.name}:n`] = w.length;
  for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) js[`built:${spec.name}:q${p}`] = S.quantile(w, p);
}
B.delay.forEach((c, i) => { js[`delay:${i}`] = E.delayCost(c.T, c.T0, c.mw, c.V, c.r); });
const camp = O.campus, V = camp.valuePerMWyr, r = camp.discount;
const measured = { waits: built["pjm-gas-big"], p: S.at(stepsBy["pjm-gas-big"], 10, 2) };
const views = Object.fromEntries(O.options.map(o => [o.id, E.optionView(o, camp, V, r, measured, S.quantile)]));
for (const [k, v] of Object.entries(views)) for (const kk of ["p", "p10", "p50", "p90", "onByDeadline", "costPerMW"]) js[`option:${k}:${kk}`] = v[kk];
for (const pf of B.portfolios) {
  const res = E.portfolio(views, pf.alloc, camp.needMW, camp.fallbackYears, camp, V, r);
  for (const kk of ["expectedMW", "pNeed", "cost"]) js[`portfolio:${pf.name}:${kk}`] = res[kk];
}

const py = JSON.parse(execFileSync("python3", [join(ROOT, "models/run_checks.py")], { encoding: "utf8", maxBuffer: 1 << 26 }));
const keys = new Set([...Object.keys(js), ...Object.keys(py)]);
let worst = 0;
for (const k of keys) {
  if (!(k in js) || !(k in py)) { ok(false, `key only on one side: ${k}`); continue; }
  const d = Math.abs(js[k] - py[k]);
  worst = Math.max(worst, d);
  ok(near(js[k], py[k]), `JS vs Python ${k}: ${js[k]} vs ${py[k]}`);
}
console.log(`JS vs Python: ${keys.size} values, worst |Δ| = ${worst.toExponential(2)}`);

// ── 2. Null cases and identities
ok(js["delay:0"] === 0, "no delay ⇒ $0 delay cost");
ok(js["delay:1"] === 0, "early power ⇒ $0 delay cost");
ok(near(js["delay:4"], 250 * 3.48 * 1), "r = 0 ⇒ cost = MW × V × years late");
ok(views.flex.costPerMW === 0, "an option that always lands by the ready date costs $0 in delay");
for (const [name, aj] of Object.entries(stepsBy)) {
  ok(aj.every(([, s1, f1, f2]) => near(s1 + f1 + f2, 1, 1e-12)), `S + CIF_cod + CIF_wd = 1 (${name})`);
  ok(aj.every((st, i) => i === 0 || (st[2] >= aj[i - 1][2] - 1e-15 && st[3] >= aj[i - 1][3] - 1e-15)), `CIFs never decrease (${name})`);
}
for (const spec of B.slices.filter(s => s.timing)) {
  for (const t of B.times) ok(js[`slice:${spec.name}:km:${t}`] >= js[`slice:${spec.name}:aj:cod:${t}`] - 1e-12, `KM-of-COD ≥ AJ (${spec.name}, ${t}y)`);
}
{ // synthetic: no withdrawals ⇒ KM and AJ agree; no censoring ⇒ AJ = naive share
  const syn = [[100, 1], [200, 1], [200, 0], [400, 1], [800, 0], [900, 1]];
  const aj = S.aalenJohansen(syn), km = S.kaplanMeierCod(syn);
  for (const t of [0.3, 0.6, 1.2, 2.5]) ok(near(S.at(aj, t, 2), S.at(km, t, 1), 1e-12), `no competing events ⇒ KM = AJ at ${t}y`);
  const rowsU = [{ q: 0, s: 1, e: 365 }, { q: 0, s: 2, e: 500 }, { q: 0, s: 1, e: 1000 }, { q: 0, s: 2, e: 2000 }];
  const ajU = S.aalenJohansen(S.durations(rowsU, 5000));
  for (const t of [1, 2, 3, 6]) ok(near(S.at(ajU, t, 2), S.naiveBy(rowsU, 5000, t), 1e-12), `no censoring ⇒ AJ = naive at ${t}y`);
}
{ // portfolio null: certain, on-time options deliver everything
  const v = { a: { p: 1, onByDeadline: 1, costPerMW: 0 }, b: { p: 1, onByDeadline: 1, costPerMW: 0 } };
  const res = E.portfolio(v, { a: 120, b: 130 }, 250, 8, { readyYears: 3 }, 3.48, 0.1);
  ok(near(res.pNeed, 1) && near(res.expectedMW, 250) && res.cost === 0, "certain on-time portfolio ⇒ P(need) = 1, cost $0");
  ok(near(res.dist.reduce((s, [, p]) => s + p, 0), 1), "portfolio distribution sums to 1");
}
for (const L of B.landmark.L) ok(near(js[`landmark:${L}:cod`] + js[`landmark:${L}:wd`] + js[`landmark:${L}:wait`], 1, 1e-12), `landmark ${L}: shares sum to 1`);
ok(near(js["landmark:0:cod"], (js["slice:timing-all:aj:cod:3"] - S.at(stepsBy["timing-all"], 0, 2)) / js["landmark:0:S_L"]), "landmark at 0 = AJ at h (after same-day events)");

// ── 3. LBNL headline (Queued Up 2026: 13% of 2000–2020 capacity and 19% of projects reached COD; 75% of capacity withdrawn)
ok(Math.round(100 * js["slice:all-2000-2020:mw:share1"]) === 13, `LBNL: 13% of capacity operational (got ${(100 * js["slice:all-2000-2020:mw:share1"]).toFixed(2)}%)`);
ok(Math.round(100 * js["slice:all-2000-2020:n:share1"]) === 19, `LBNL: 19% of projects operational (got ${(100 * js["slice:all-2000-2020:n:share1"]).toFixed(2)}%)`);
ok(Math.round(100 * js["slice:all-2000-2020:mw:share2"]) === 75, `LBNL: 75% of capacity withdrawn (got ${(100 * js["slice:all-2000-2020:mw:share2"]).toFixed(2)}%)`);

// ── 4. numbers.json + copy grep
mkdirSync(join(ROOT, "tests/out"), { recursive: true });
const numbers = computeNumbers({ D, O, rows });
writeFileSync(join(ROOT, "tests/numbers.json"), JSON.stringify(numbers, null, 1) + "\n");
const allowed = new Set(Object.values(numbers).flatMap(v => (typeof v === "string" ? [v] : [])));
for (const s of O.sourced || []) allowed.add(s);
allowed.add("100%"); allowed.add("$0"); // identities ("the curves add to 100%", "no delay costs $0"), not data
const copyFiles = [...readdirSync(join(ROOT, "js/steps")).map(f => `js/steps/${f}`), "README.md"];
for (const f of copyFiles) {
  const src = readFileSync(join(ROOT, f), "utf8").replace(/\$\{[^}]*\}/g, "");     // drop live interpolations
  for (const m of src.matchAll(/(?<![\w.])(\d+(?:\.\d+)?%|\$\d+(?:[,.]\d+)*(?:[MBK]\b)?)/g)) {
    ok(allowed.has(m[1]), `copy number not traced to numbers.json or sourced list: "${m[1]}" in ${f}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
