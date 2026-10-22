// Step 2 · How long the wait is — the distribution of request→COD for built projects, and landmark odds.
import { h, s, slider, predict, clicks, say, modelCard, readout, scale, niceTicks, axes, legend, css, ledger, tag } from "../ui.js";
import { durations, aalenJohansen, landmark, atRisk, builtWaits, quantile } from "../stats.js";
import { fmt } from "../numbers.js";
import { pick } from "./s1.js";

const ERAS = [["2021-2025", "Reached COD 2021–2025", [2021, 2025]], ["2015-2019", "Reached COD 2015–2019", [2015, 2019]], ["2025", "Reached COD in 2025", [2025, 2025]]];

export async function render(root, lab) {
  const { D, cx, rows, N } = lab;
  const st = { set: "four", era: "2021-2025", type: "all", L: 6 };

  root.append(
    h("p", { class: "lede", html: `If a project <i>does</i> get built, how long did it wait? Reports usually quote the median. A schedule, a financing plan or a customer promise has to survive the slow cases, so it should carry the <b>P90</b>: the wait that 9 in 10 built projects beat.` }));

  // ── Panel A: the distribution
  const chartBox = h("div", { class: "chartbox" });
  const ro = { n: readout("Built projects in view", ""), p10: readout("P10 wait", ""), p50: readout("Median wait", "", { cls: "brass" }), p90: readout("P90 wait", "", { cls: "wall" }) };
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "Request to commercial operation, for projects that got built"), tag("M")),
    h("div", { class: "ctrlrow" },
      pick("Regions", [["four", "CAISO, MISO, PJM, SPP"], ["all", "All nine regions (dated rows)"]], st.set, v => { st.set = v; drawA(); }),
      pick("When built", ERAS.map(([v, t]) => [v, t]), st.era, v => { st.era = v; drawA(); }),
      pick("Technology", [["all", "Any technology"], ...D.types.map((t, i) => [String(i), t])], st.type, v => { st.type = v; drawA(); })),
    chartBox,
    legend([[css("--blue"), "Built projects, by years waited"], [css("--brass"), "Median", "line"], [css("--wall"), "P90", "line"]]),
    h("div", { class: "readouts" }, ro.n, ro.p10, ro.p50, ro.p90),
    h("p", { class: "note", html: `<b>Two ways to count the same year.</b> LBNL's report gives a ${N.lbnlMo} median for projects online in 2025, across ${N.lbnlN} rows with a 2025 online date. ${N.lbnlNotOp} of those rows aren't marked operational, ${N.lbnlSppWd} of them SPP requests marked withdrawn. Counting only operational projects, across all nine regions, the median is ${N.b25allMo} (${N.b25allN} projects). Both are honest. They answer slightly different questions.` })));

  function drawA() {
    const era = ERAS.find(e => e[0] === st.era)[2];
    const rr = cx.sel({ regions: st.set === "four" ? D.timingRegions : null, types: st.type === "all" ? null : [D.types[+st.type]] });
    const w = builtWaits(rr, era);
    const W = 640, H = 260, m = { l: 40, r: 14, t: 12, b: 40 }, tMax = 14, bin = 0.5;
    const bins = new Array(Math.ceil(tMax / bin)).fill(0);
    for (const v of w) bins[Math.min(bins.length - 1, Math.floor(v / bin))]++;
    const yMax = Math.max(4, ...bins);
    const x = scale(0, tMax, m.l, W - m.r), y = scale(0, yMax, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Histogram of waits" });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(0, tMax, 7), yt: niceTicks(0, yMax, 4), xlab: "Years from request to commercial operation" }));
    bins.forEach((c, i) => { if (c) svg.append(s("rect", { x: x(i * bin) + 1, y: y(c), width: x(bin) - x(0) - 2, height: y(0) - y(c), fill: css("--blue"), rx: 1.5 })); });
    if (w.length) {
      for (const [p, col, lab2] of [[0.5, css("--brass"), "median"], [0.9, css("--wall"), "P90"]]) {
        const v = quantile(w, p);
        svg.append(s("line", { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b, stroke: col, "stroke-width": 2.2, "stroke-dasharray": p === 0.9 ? "6 4" : null }),
          s("text", { x: x(v) + 5, y: m.t + 12, class: "val halo" }, `${lab2} ${fmt.yr(v)}`));
      }
    }
    chartBox.replaceChildren(svg);
    ro.n.set(fmt.int(w.length), w.length < 40 ? "thin: read the shape, not the decimals" : "");
    ro.p10.set(w.length ? fmt.yr(quantile(w, 0.1)) : "–"); ro.p50.set(w.length ? fmt.yr(quantile(w, 0.5)) : "–"); ro.p90.set(w.length ? fmt.yr(quantile(w, 0.9)) : "–");
    if (st.era !== "2021-2025" || st.set !== "four" || st.type !== "all") {
      ledger.put("s2a", { what: "Request→COD for projects built 2021–2025 (CAISO, MISO, PJM, SPP)", price: `median ${N.b2125p50}, P90 ${N.b2125p90}`, note: `${N.b2125n} projects. Built 2015–2019: median ${N.b1519p50}, P90 ${N.b1519p90}.` });
    }
  }
  drawA();

  // ── Panel B: already waited L years
  root.append(predict({
    q: "A request has already survived six years in the queue: not built, not withdrawn. Compared with a brand-new request, its odds of reaching COD in the next three years are…",
    options: ["Lower: it's clearly stuck", "About the same", "Several times higher"],
    answer: 2,
    explain: () => `A new request has a ${N.lm0cod} chance of reaching COD within three years; ${N.lm0wd} withdraw in that time. A six-year survivor has ${N.lm6cod}, with ${N.lm6wd} withdrawing. Withdrawals come early, so the survivors are the serious projects. But ${N.lm6wait} of six-year survivors are <i>still</i> waiting three years later.`,
  }));
  const bars = h("div", {}), curve = h("div", { class: "chartbox" });
  const roB = { cod: readout("Reach COD in the next 3 years", "", { cls: "good" }), wd: readout("Withdraw in the next 3 years", ""), wait: readout("Still waiting 3 years later", "", { cls: "brass" }), n: readout("Requests still in line at this age", "") };
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "If a project has already waited, what now?"), tag("M"), h("span", { class: "sub" }, "Landmark odds: condition on still being in the queue at a given age. CAISO, MISO, PJM and SPP, entered 2010–2025.")),
    slider({ label: "Already waited (years)", min: 0, max: 10, value: st.L, id: "s2L", oninput: v => { st.L = v; drawB(); } }),
    h("div", { class: "grid2" }, bars, curve),
    h("div", { class: "readouts" }, roB.cod, roB.wd, roB.wait, roB.n)));

  const tdur = durations(cx.sel({ timing: true }), cx.C), taj = aalenJohansen(tdur);
  function drawB() {
    const lm = landmark(taj, st.L, 3), n = atRisk(tdur, st.L);
    const W = 360, H = 120, m = { l: 8, r: 8, t: 8, b: 8 };
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Three-year outcome for survivors" });
    let acc = 0;
    for (const [v, col, t] of [[lm.cod, css("--op"), "COD"], [lm.wait, css("--inq"), "waiting"], [lm.wd, css("--wd"), "withdrawn"]]) {
      const x0 = m.l + acc * (W - m.l - m.r), wpx = v * (W - m.l - m.r);
      svg.append(s("rect", { x: x0, y: 30, width: wpx, height: 44, fill: col, rx: 2 }));
      if (v > 0.1) svg.append(s("text", { x: x0 + 6, y: 96, class: "val" }, `${t} ${fmt.pct(v)}`));
      acc += v;
    }
    svg.append(s("text", { x: m.l, y: 20, class: "lbl" }, `After ${st.L} year${st.L === 1 ? "" : "s"} in line, the next 3 years:`));
    bars.replaceChildren(svg);
    // odds-by-age curve
    const W2 = 360, H2 = 170, m2 = { l: 40, r: 10, t: 10, b: 34 };
    const x = scale(0, 10, m2.l, W2 - m2.r), y = scale(0, 0.5, H2 - m2.b, m2.t);
    const c = s("svg", { class: "chart", viewBox: `0 0 ${W2} ${H2}`, role: "img", "aria-label": "Three-year COD odds by age" });
    c.append(axes({ x, y, W: W2, H: H2, m: m2, xt: [0, 2, 4, 6, 8, 10], yt: [0, .1, .2, .3, .4, .5], yfmt: v => fmt.pct(v), xlab: "Years already waited" }));
    let d = "";
    for (let L = 0; L <= 10; L++) { const v = landmark(taj, L, 3).cod; d += `${L ? "L" : "M"}${x(L)},${y(v)}`; }
    c.append(s("path", { d, fill: "none", stroke: css("--op"), "stroke-width": 2.4 }), s("circle", { cx: x(st.L), cy: y(lm.cod), r: 5, fill: css("--op") }));
    curve.replaceChildren(c);
    roB.cod.set(fmt.pct(lm.cod)); roB.wd.set(fmt.pct(lm.wd)); roB.wait.set(fmt.pct(lm.wait)); roB.n.set(fmt.int(n), n < 300 ? "thinning: fewer old requests" : "");
    if (st.L !== 6) ledger.put("s2b", { what: "Odds of COD within the next 3 years: brand-new request vs six-year survivor", price: `${N.lm0cod} → ${N.lm6cod}`, note: `${N.lm6wait} of six-year survivors are still waiting 3 years later (${N.lm6n} requests in line at 6 years).` });
  }
  drawB();

  root.append(
    clicks(null, h("ul", {},
      h("li", { html: `<b>The wait is getting longer.</b> In CAISO, MISO, PJM and SPP, projects built 2015–2019 took a median ${N.b1519p50} (P90 ${N.b1519p90}). Those built 2021–2025 took ${N.b2125p50} (P90 ${N.b2125p90}).` }),
      h("li", { html: "<b>Plan on the P90.</b> The median is the coin flip. A campus that must be energized on a date needs the wait it beats 9 times in 10, and step 3 prices the gap." }),
      h("li", { html: `<b>Survivors get better odds, but not a fast lane.</b> Three-year odds of COD rise from ${N.lm0cod} for a new request to ${N.lm6cod} at six years, yet most survivors are still waiting three years on. Ask how long a project has been in line, and what phase it's in, before you count on it.` }))),
    say("Quote the P90, not the median. And when someone says their project is far along, ask how long it's been waiting. Survivors are better bets, but they're still slow."),
    modelCard({
      what: "How long did built projects wait from request to COD, and given a request is still in line at age <i>L</i>, what happens over the next three years?",
      formula: "Waits: type-7 quantiles (linear interpolation, numpy's default) of (COD date − request date) for projects marked operational with a COD in the chosen years. Landmark: P(COD in (L, L+3] | still in line at L) = (CIF<sub>COD</sub>(L+3) − CIF<sub>COD</sub>(L)) / S(L), from step 1's Aalen–Johansen fit.",
      tags: `<span class="tag tag-M">measured</span> The built-project view conditions on success: it says nothing about the requests that never finished (that's step 1). “All nine regions” includes regions where many COD dates are missing, so it's biased toward whichever projects got dated.`,
      py: "stats.py",
    }));
}
