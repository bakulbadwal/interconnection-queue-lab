# Acceptance

`make check` must pass before every push. It runs:

1. **`node tests/check.mjs`**
   - **Twin agreement.** Every case in [`tests/battery.json`](tests/battery.json) (17 slices × outcome shares, Aalen–Johansen, Kaplan–Meier and naive curves at 1, 2, 3, 5, 7 and 10 years; landmark odds for 0–10 years; five built-wait distributions; six delay-cost cases; six option views; three portfolios) is computed in JavaScript and in the stdlib Python twins (`models/run_checks.py`). All 736 values must agree to 1e-9 (worst observed: 1.2e-10).
   - **Null cases and identities.** No delay ⇒ $0. Early power ⇒ $0. With r = 0, cost = MW × V × years late. An option that always lands by the ready date ⇒ $0. S + CIF<sub>COD</sub> + CIF<sub>withdrawn</sub> = 1 at every step. The CIFs never decrease. KM-of-COD ≥ AJ in every slice. No competing events ⇒ KM = AJ. No censoring ⇒ AJ = the naive share. A certain, on-time portfolio ⇒ P(need) = 1 and $0 cost. Each portfolio distribution sums to 1. Landmark shares sum to 1.
   - **LBNL headline.** From the snapshot: 13% of 2000–2020 capacity operational, 75% withdrawn, 19% of projects operational.
   - **Copy trace.** [`js/numbers.js`](js/numbers.js) computes every number the prose quotes and writes [`tests/numbers.json`](tests/numbers.json). Any literal percentage or dollar figure in `js/steps/*.js` or `README.md` must appear there, or in the cited-sources list in `data/options.json`.
2. **`tests/check_statsmodels.py`** (via `uv run --with statsmodels`): our Aalen–Johansen CIFs and Kaplan–Meier curves match `statsmodels.duration.survfunc` to 1e-9 in every timed slice (270 values).

`make smoke` loads every route in headless Chrome and fails on an error callout or an unfinished render. Phone layout is checked in the Browser pane at 375 px (`scrollWidth ≤ clientWidth` on every route).

## Numbers the copy quotes (default settings)

Regenerated on every run. See `tests/numbers.json`. The headline figures:

| Figure | Value |
|---|---|
| Requests in the snapshot / timing sample | 37,527 / 14,951 |
| 2000–2020 capacity operational / withdrawn; projects operational | 13% / 75%; 19% |
| PJM since 2010, COD within 10 years: naive / KM mistake / Aalen–Johansen | 11% / 69% / 18% |
| Median (P90) wait, built 2015–2019 vs 2021–2025, four timed regions | 3.6 yr (7.5) vs 5.7 yr (8.9) |
| 3-year COD odds: new request vs six-year survivor | 3% vs 26% |
| One year late, 250 MW campus (idle GPUs) | $613M ($1.49B) |
| Capstone, chance of ≥200 MW by end-2029: all in the queue vs reference mix | 2% vs 26% |
