// Step 3 · What a year costs — delay cost for a 250 MW campus on the measured wait distribution.
import { h, s, slider, toggle, predict, clicks, say, modelCard, readout, scale, niceTicks, axes, legend, css, ledger, tag, touch } from "../ui.js";
import { quantile } from "../stats.js";
import { delayCost, valuePerMWyr, empiricalSummary } from "../econ.js";
import { fmt } from "../numbers.js";

export async function render(root, lab) {
  const { O, cx, N } = lab;
  const camp = O.campus, waits = cx.measured.waits;
  const st = { V: camp.valuePerMWyr, r: camp.discount, T0: camp.readyYears, gpus: false, T: camp.readyYears + 1 };

  root.append(
    h("p", { class: "lede", html: `Now put a price on the wait. Take the <a href="https://bakulbadwal.github.io/hyperscale-ledger/">Hyperscale Ledger</a>'s ${N.campusMW} AI campus. The building and racks can be ready ${camp.readyYears} years after you file for power. Every year the power arrives after that, each megawatt loses what it would have earned.` }),
    h("p", { html: `What's a megawatt-year worth? <a href="https://bakulbadwal.github.io/compute-deal-desk/#/s1">Compute Deal Desk</a>, step 1, solves exactly that: the shadow price of the grid connection on a campus like this one is ${N.valueMWyr} per MW-year ${tag("T").outerHTML} at its teaching prices. Real per-deal compute pricing isn't public, so treat the dollars as a scale, not a quote.` }),
    predict({
      q: `Power arrives one year after the campus is ready. At ${N.valueMWyr} per MW-year and a 10% discount rate, what does that year cost, in today's dollars?`,
      options: [fmt.money(camp.valuePerMWyr), fmt.money(camp.mw * camp.valuePerMWyr / 12), N.oneYearLate, fmt.money(camp.mw * camp.capexPerMW)],
      answer: 2,
      explain: () => `${N.oneYearLate}. That's ${camp.mw} MW × ${N.valueMWyr} = ${fmt.money(camp.mw * camp.valuePerMWyr)} a year, discounted because the lost year starts ${camp.readyYears} years out. If the GPUs are already bought and sit idle, add their depreciation (${N.depPerMWyr} per MW-year from the Ledger's $25M per MW over 5 years), and the same year costs ${N.oneYearLateGpus}.`,
    }));

  const chartBox = h("div", { class: "chartbox" });
  const ro = {
    one: readout("One year late", "", { cls: "wall" }), you: readout("Your arrival date", ""),
    mean: readout("Expected, on the measured waits", "", { cls: "brass" }), p90: readout("P90 case", "", { cls: "wall" }), late: readout("Built plants that missed the ready date", ""),
  };
  const Tsl = slider({ label: "Power arrives after (years from filing)", min: 0, max: 10, step: 0.1, value: st.T, fmt: v => fmt.yr(v), id: "s3T", oninput: v => { st.T = v; draw(); } });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "The cost of waiting, for a 250 MW campus"), tag("M"), tag("T"),
      h("span", { class: "sub", html: `The dots are the ${N.qN} PJM gas plants of 100 MW or more that entered 2010–2020 and got built (measured). The curve is the cost model (teaching values).` })),
    h("div", { class: "grid2" }, chartBox,
      h("div", { class: "ctrl" },
        h("h4", {}, "Your scenario"),
        Tsl,
        h("div", { class: "btnrow" }, h("button", { class: "btn small ghost", type: "button", onclick: e => { st.T = st.T0; Tsl.set(st.T); touch(e.target); draw(); } }, "Null case: power on the ready date")),
        h("h4", {}, "Assumptions"),
        slider({ label: "Campus ready after (years)", min: 1, max: 6, step: 0.5, value: st.T0, fmt: v => fmt.yr(v), id: "s3T0", oninput: v => { st.T0 = v; draw(); } }),
        slider({ label: "Value of a megawatt-year ($M)", min: 0.5, max: 8, step: 0.01, value: st.V, fmt: v => fmt.mwyr(v), id: "s3V", oninput: v => { st.V = v; draw(); } }),
        slider({ label: "Discount rate", min: 0, max: 0.2, step: 0.01, value: st.r, fmt: v => fmt.pct(v), id: "s3r", oninput: v => { st.r = v; draw(); } }),
        toggle({ label: "GPUs already bought (idle racks depreciate)", checked: st.gpus, onchange: v => { st.gpus = v; draw(); } }))),
    legend([[css("--brass"), "Delay cost if power arrives at year t", "line"], [css("--blue"), "Built plants (measured waits)"], [css("--wall"), "P90 wait", "line"]]),
    h("div", { class: "readouts" }, ro.one, ro.you, ro.mean, ro.p90, ro.late)));

  function draw() {
    const V = valuePerMWyr(camp, st.V, st.gpus), MW = camp.mw;
    const W = 600, H = 300, m = { l: 56, r: 14, t: 14, b: 40 }, tMax = 10;
    const cMax = Math.max(1, delayCost(tMax, st.T0, MW, V, st.r));
    const x = scale(0, tMax, m.l, W - m.r), y = scale(0, cMax, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Delay cost by arrival year" });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(0, tMax, 6), yt: niceTicks(0, cMax, 4), yfmt: v => fmt.money(v), xlab: "Years from filing until power arrives" }));
    svg.append(s("rect", { x: m.l, y: m.t, width: x(st.T0) - m.l, height: H - m.t - m.b, fill: css("--green-soft"), opacity: 0.6 }),
      s("text", { x: m.l + 6, y: m.t + 14, class: "lbl" }, "on time: $0"));
    let d = "";
    for (let i = 0; i <= 200; i++) { const t = (tMax * i) / 200; d += `${i ? "L" : "M"}${x(t)},${y(delayCost(t, st.T0, MW, V, st.r))}`; }
    svg.append(s("path", { d, fill: "none", stroke: css("--brass"), "stroke-width": 2.6 }));
    waits.forEach((w, i) => svg.append(s("circle", { cx: x(Math.min(w, tMax)), cy: H - m.b - 6 - (i % 4) * 5, r: 2.6, fill: css("--blue"), opacity: 0.8 })));
    const p90 = quantile(waits, 0.9);
    svg.append(s("line", { x1: x(p90), x2: x(p90), y1: m.t, y2: H - m.b, stroke: css("--wall"), "stroke-width": 1.8, "stroke-dasharray": "6 4" }),
      s("text", { x: x(p90) + 5, y: y(delayCost(p90, st.T0, MW, V, st.r)) - 8, class: "val halo" }, `P90 ${fmt.yr(p90)}: ${fmt.money(delayCost(p90, st.T0, MW, V, st.r))}`));
    const cY = delayCost(st.T, st.T0, MW, V, st.r);
    svg.append(s("circle", { cx: x(st.T), cy: y(cY), r: 6, fill: css("--wall"), stroke: css("--sheet"), "stroke-width": 2 }));
    chartBox.replaceChildren(svg);
    const sum = empiricalSummary(waits, st.T0, MW, V, st.r, quantile);
    ro.one.set(fmt.money(delayCost(st.T0 + 1, st.T0, MW, V, st.r)), `${MW} MW × ${fmt.mwyr(V)} per MW-year, discounted`);
    ro.you.set(fmt.money(cY), st.T <= st.T0 ? "null case: no delay, no cost" : `${fmt.yr(st.T - st.T0)} late`);
    ro.mean.set(fmt.money(sum.mean), `over ${fmt.int(sum.n)} built PJM gas plants`);
    ro.p90.set(fmt.money(sum.p90), `wait ${fmt.yr(p90)}`);
    ro.late.set(fmt.pct(sum.late), `took longer than ${fmt.yr(st.T0)}`);
    if (st.V !== camp.valuePerMWyr || st.T !== camp.readyYears + 1 || st.gpus || st.T0 !== camp.readyYears || st.r !== camp.discount) {
      ledger.put("s3", { what: "Cost of one year's delay, 250 MW campus (Compute Deal Desk price of a MW-year, 10% discount)", price: N.oneYearLate, note: `${N.oneYearLateGpus} if the GPUs are already bought. On the measured PJM gas-plant waits: expected ${N.qMean}, P90 ${N.qP90}. Teaching values.` });
    }
  }
  draw();

  root.append(
    clicks(null, h("ul", {},
      h("li", { html: `<b>The null case is $0, and it should be.</b> Press it: power on the ready date costs nothing. Every dollar on this chart comes from the gap between ready and powered.` }),
      h("li", { html: `<b>The wait is measured; the price is a lever.</b> ${N.qLate} of the built PJM gas plants (100 MW or more) took longer than ${camp.readyYears} years from request to COD. Their median was ${N.qWaitP50} and their P90 ${N.qWaitP90}. Halve the value per MW-year and the cost halves. The wait doesn't move.` }),
      h("li", { html: `<b>Idle GPUs change the scale.</b> Turn on “GPUs already bought.” Depreciation (${N.depPerMWyr} per MW-year) is larger than the ${N.valueMWyr} a megawatt-year is worth, so buying chips before the power is secured is the expensive mistake.` }),
      h("li", { html: `<b>And these are the plants that got built.</b> Only ${N.qOdds} of PJM gas requests of 100 MW or more (entered 2010–2020) reached COD within ${N.qHorizon}, as far as they've been watched (step 1). The cost of the ones that never arrive is step 4's “fallback.”` }))),
    say(`A year of waiting on a 250 MW campus costs about ${N.oneYearLate} at Compute Deal Desk's price of a megawatt-year, and more than double if the GPUs are already sitting there. Budget the P90 wait, not the median.`),
    modelCard({
      what: "What is a delay worth, in today's dollars, for a campus ready at T<sub>0</sub> that gets power at T?",
      formula: "cost = MW · V · (e<sup>−r·T<sub>0</sub></sup> − e<sup>−r·T</sup>) / r for T > T<sub>0</sub>, else 0 (V in $M per MW-year, continuous discounting). With r = 0 it's MW · V · (T − T<sub>0</sub>). Idle GPUs add capex per MW ÷ life to V. Expected and P90 costs are taken over the measured waits.",
      tags: `<span class="tag tag-M">measured</span> the waits (${N.qN} built PJM gas plants of 100 MW or more, entered 2010–2020). <span class="tag tag-S">sourced</span> 250 MW, $25M per MW and 5-year GPU life (Hyperscale Ledger). <span class="tag tag-T">teaching value</span> ${N.valueMWyr} per MW-year (Compute Deal Desk), 10% discount, ready at ${camp.readyYears} years.`,
      py: "econ.py",
    }));
}
