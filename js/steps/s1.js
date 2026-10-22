// Step 1 · Odds of reaching the finish — naive share vs Kaplan–Meier that ignores withdrawals vs Aalen–Johansen.
import { h, s, predict, clicks, say, modelCard, readout, scale, niceTicks, axes, legend, css, ledger, tag, touch, plotClip } from "../ui.js";
import { durations, aalenJohansen, kaplanMeierCod, at, naiveBy, atRisk } from "../stats.js";
import { fmt } from "../numbers.js";

const MIN_AT_RISK = 10;
export const SIZES = [["all", "Any size", null], ["s", "Under 20 MW", [0, 20]], ["m", "20–100 MW", [20, 100]], ["l", "100–500 MW", [100, 500]], ["xl", "500 MW and up", [500, 1e9]]];
export const ERAS = [["2010-2025", "Entered 2010–2025", [2010, 2025]], ["2010-2015", "2010–2015", [2010, 2015]], ["2016-2020", "2016–2020", [2016, 2020]], ["2021-2025", "2021–2025", [2021, 2025]]];

/** A <select> bound to a setter. options: [[value, label]]. */
export function pick(label, options, value, onchange) {
  const el = h("select", { class: "sel", "aria-label": label }, options.map(([v, t]) => h("option", { value: v, selected: v === value ? true : null }, t)));
  el.addEventListener("change", () => { onchange(el.value); touch(el); });
  return h("label", {}, label, el);
}

export async function render(root, lab) {
  const { D, cx, N } = lab;
  const four = D.timingRegions;
  const st = { region: "PJM", type: "all", size: "all", era: "2010-2025" };

  root.append(
    h("p", { class: "lede", html: `You're told a project “is in the PJM queue.” What are the odds it ever runs? The tricky part: most recent requests haven't finished, in <i>either</i> direction. Two tempting shortcuts give badly wrong answers. The right tool is the one actuaries and clinical trials use for exactly this shape of data: <b>survival analysis with competing risks</b>.` }),
    predict({
      q: "Of PJM requests that entered from 2010 to 2025, what share reach commercial operation within 10 years of their request?",
      options: [N.pjmKm10, N.pjmWd10, N.pjmAj10, N.pjmNaive10],
      answer: 2,
      explain: () => `${N.pjmAj10}. Over the same 10 years, ${N.pjmWd10} withdraw. The tempting answers are both on the chart below. ${N.pjmNaive10} counts every unfinished request as a failure. ${N.pjmKm10} treats every withdrawn project as if it might still finish. Each is a different mistake.`,
    }));

  const chartBox = h("div", { class: "chartbox" });
  const ro = {
    c5: readout("Reach COD within 5 years", "", { cls: "good" }), c10: readout("Reach COD within 10 years", "", { cls: "good" }),
    w10: readout("Withdrawn within 10 years", ""), wait: readout("Still waiting at 10 years", "", { cls: "brass" }),
    km: readout("The KM mistake says (10 years)", "", { cls: "wall" }),
  };
  const thin = h("div", { class: "note", style: { marginTop: "6px" } });
  const types = [["all", "Any technology"], ...D.types.map((t, i) => [String(i), t])];
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "Odds of reaching commercial operation, by years since the request"), tag("M")),
    h("div", { class: "ctrlrow" },
      pick("Region", [["four", "All four timed regions"], ...four.map(r => [r, r])], st.region, v => { st.region = v; draw(); }),
      pick("Technology", types, st.type, v => { st.type = v; draw(); }),
      pick("Size", SIZES.map(([v, t]) => [v, t]), st.size, v => { st.size = v; draw(); }),
      pick("Entry years", ERAS.map(([v, t]) => [v, t]), st.era, v => { st.era = v; draw(); })),
    chartBox,
    legend([[css("--op"), "Right: reached COD (Aalen–Johansen)", "line"], [css("--wd"), "Withdrawn (Aalen–Johansen)", "line"], [css("--wrong"), "Mistake 1: Kaplan–Meier ignoring withdrawals", "line"], [css("--ink-3"), "Mistake 2: naive share done", "line"]]),
    h("div", { class: "readouts" }, ro.c5, ro.c10, ro.w10, ro.wait, ro.km), thin,
    h("p", { class: "note", html: `Timing comes from the four regions whose files date nearly every outcome (CAISO, MISO, PJM, SPP; ${N.timingN} requests entered 2010–2025). ERCOT, NYISO, ISO-NE and the non-ISO utilities appear in step 0's counts, but too many of their outcomes lack dates to time them.` })));

  function current() {
    const era = ERAS.find(e => e[0] === st.era)[2], size = SIZES.find(z => z[0] === st.size)[2];
    const regions = st.region === "four" ? four : [st.region];
    const spec = { regions, types: st.type === "all" ? null : [D.types[+st.type]], years: era, mw: size, timing: true };
    const rr = cx.sel(spec);
    const dur = durations(rr, cx.C);
    const label = `${st.region === "four" ? "CAISO+MISO+PJM+SPP" : st.region}, ${st.type === "all" ? "any technology" : D.types[+st.type]}, ${SIZES.find(z => z[0] === st.size)[1].toLowerCase()}, entered ${era[0]}–${era[1]}`;
    return { rr, dur, aj: aalenJohansen(dur), km: kaplanMeierCod(dur), label };
  }

  function draw() {
    const { rr, dur, aj, km, label } = current();
    const W = 640, H = 330, m = { l: 46, r: 16, t: 12, b: 40 }, tMax = 12;
    const x = scale(0, tMax, m.l, W - m.r), y = scale(0, 1, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Odds curves for ${label}` });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(0, tMax, 6), yt: [0, .2, .4, .6, .8, 1], xfmt: v => v, yfmt: v => fmt.pct(v), xlab: "Years since the interconnection request" }));
    // Stop every curve once fewer than MIN_AT_RISK requests are still being watched: past that, one project moves the curve.
    let tStop = 0;
    for (let t = 0; t <= tMax; t += 0.1) if (atRisk(dur, t) >= MIN_AT_RISK) tStop = t;
    if (tStop < tMax) {
      svg.append(s("rect", { x: x(tStop), y: m.t, width: x(tMax) - x(tStop), height: H - m.t - m.b, fill: css("--grey-soft"), opacity: 0.8 }),
        s("text", { x: x(tStop) + 6, y: m.t + 14, class: "lbl" }, `fewer than ${MIN_AT_RISK} still watched`));
    }
    const g = plotClip(svg, W, H, m);
    const path = (pts, col, extra = {}) => {
      let d = "";
      pts.filter(([t]) => t <= tStop).forEach(([t, v], i) => { const X = x(t), Y = y(v); d += i === 0 ? `M${X},${Y}` : `H${X}V${Y}`; });
      d += `H${x(tStop)}`;
      g.append(s("path", { d, fill: "none", stroke: col, "stroke-width": 2.4, ...extra }));
    };
    if (rr.length) {
      const naive = [];
      for (let t = 0; t <= tStop + 1e-9; t += 0.25) naive.push([t, naiveBy(rr, cx.C, t)]);
      let dn = ""; naive.forEach(([t, v], i) => { dn += `${i ? "L" : "M"}${x(t)},${y(v)}`; });
      g.append(s("path", { d: dn, fill: "none", stroke: css("--ink-3"), "stroke-width": 1.6, "stroke-dasharray": "2 4" }));
      path(km.map(([t, v]) => [t, v]), css("--wrong"), { "stroke-dasharray": "7 5", "stroke-width": 2 });
      path(aj.map(st2 => [st2[0], st2[3]]), css("--wd"), { "stroke-width": 2 });
      path(aj.map(st2 => [st2[0], st2[2]]), css("--op"), { "stroke-width": 3.2 });
      for (const t of [5, 10].filter(t => t <= tStop)) {
        const v = at(aj, t, 2);
        svg.append(s("circle", { cx: x(t), cy: y(v), r: 4, fill: css("--op") }), s("text", { x: x(t) + 6, y: y(v) - 6, class: "val halo" }, fmt.pct(v)));
      }
    }
    chartBox.replaceChildren(svg);
    const n10 = atRisk(dur, 10);
    ro.c5.set(fmt.pct(at(aj, 5, 2)), `of ${fmt.int(rr.length)} requests`);
    ro.c10.set(fmt.pct(at(aj, 10, 2)), `≈ ${fmt.int(at(aj, 10, 2) * rr.length)} of ${fmt.int(rr.length)}`);
    ro.w10.set(fmt.pct(at(aj, 10, 3)), "");
    ro.wait.set(fmt.pct(at(aj, 10, 1)), `${fmt.int(n10)} still under observation at 10 years`);
    ro.km.set(fmt.pct(at(km, 10, 1)), `naive share done: ${fmt.pct(naiveBy(rr, cx.C, 10))}`);
    thin.innerHTML = (rr.length < 150
      ? `<b class="hl-wall">Thin slice:</b> ${fmt.int(rr.length)} requests. Read the curve's shape, not its last digit. `
      : `Slice: ${label}. `) + `${fmt.pct(at(aj, 10, 1))} are still unresolved at 10 years, so the green 10-year figure is mostly settled. The orange curve's late climb is the mistake in action: as the last few requests finish, each one counts for a large share.`;
    if (st.region !== "PJM" || st.type !== "all" || st.size !== "all" || st.era !== "2010-2025") {
      ledger.put("s1", { what: `Odds a request reaches COD within 10 years (${label})`, price: fmt.pct(at(aj, 10, 2)), note: `Withdrawn within 10 years: ${fmt.pct(at(aj, 10, 3))}. n = ${fmt.int(rr.length)}. Ignoring withdrawals would say ${fmt.pct(at(km, 10, 1))}.` });
    }
  }
  draw();

  root.append(
    clicks(null, h("ul", {},
      h("li", { html: `<b>Mistake 1, the naive count</b> (dotted): “what share has reached COD?” Every request still in the queue counts as a failure, so it can only <i>understate</i> the odds, worst for recent years. For PJM since 2010, it says ${N.pjmNaive10} at 10 years.` }),
      h("li", { html: `<b>Mistake 2, Kaplan–Meier ignoring withdrawals</b> (orange): the textbook survival curve, with withdrawals treated as “we stopped watching.” But a withdrawn project can never finish. KM assumes it could, so it <i>overstates</i> the odds wildly: ${N.pjmKm10} for PJM at 10 years.` }),
      h("li", { html: `<b>Right: competing risks</b> (green). Aalen–Johansen keeps unfinished requests in the denominator only for as long as they've been watched. It lets withdrawal and completion race, so the two curves plus “still waiting” always add to 100%. For PJM: ${N.pjmAj10} reach COD within 10 years.` }),
      h("li", { html: "<b>Slice it.</b> Gas finishes far more often than solar or storage. Size matters too. Small projects finish more often, and a 500 MW plant is a different animal. Try PJM gas at 100–500 MW, then MISO batteries." }))),
    say("A queue position isn't a coin flip, and the share finished so far isn't the odds. Unfinished isn't failed, and withdrawn can't finish. Count it with competing risks."),
    modelCard({
      what: "For requests in a slice, what's the probability of reaching COD (or withdrawing) within <i>t</i> years of the request?",
      formula: `Sort every request by its time to an event: COD, withdrawal, or still in the queue on 2025-12-31 (censored). At each event time <i>t<sub>j</sub></i> with <i>n<sub>j</sub></i> still at risk, <i>d<sub>1j</sub></i> CODs and <i>d<sub>2j</sub></i> withdrawals: CIF<sub>COD</sub>(<i>t<sub>j</sub></i>) = CIF<sub>COD</sub>(<i>t<sub>j−1</sub></i>) + S(<i>t<sub>j−1</sub></i>)·<i>d<sub>1j</sub>/n<sub>j</sub></i>, and S(<i>t<sub>j</sub></i>) = S(<i>t<sub>j−1</sub></i>)·(1 − (<i>d<sub>1j</sub>+d<sub>2j</sub></i>)/<i>n<sub>j</sub></i>). That's the Aalen–Johansen estimator. The KM mistake is 1 − ∏(1 − <i>d<sub>1j</sub>/n<sub>j</sub></i>), with withdrawals treated as censored.`,
      tags: `<span class="tag tag-M">measured</span> ${N.timingN} requests in CAISO, MISO, PJM and SPP that entered 2010–2025. Rows whose outcome has no date are dropped there (counted in <a href="https://github.com/bakulbadwal/interconnection-queue-lab/blob/main/data/SNAPSHOT.md">SNAPSHOT.md</a>). If undated outcomes differ systematically from dated ones, the curves are biased. That's flagged, not fixed.`,
      py: "stats.py",
    }));
}
