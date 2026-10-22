// Step 1 · Odds of reaching the finish — naive share vs Kaplan–Meier that ignores withdrawals vs Aalen–Johansen.
import { h, s, predict, clicks, say, modelCard, readout, scale, niceTicks, axes, legend, css, ledger, tag, touch, plotClip } from "../ui.js";
import { durations, aalenJohansen, kaplanMeierCod, at, naiveBy, atRisk, followUp, MIN_AT_RISK } from "../stats.js";
import { fmt } from "../numbers.js";

export const SIZES = [["all", "Any size", null], ["s", "Under 20 MW", [0, 20]], ["m", "20–100 MW", [20, 100]], ["l", "100–500 MW", [100, 500]], ["xl", "500 MW and up", [500, 1e9]]];
export const ERAS = [["2010-2020", "Entered 2010–2020", [2010, 2020]], ["2010-2015", "2010–2015", [2010, 2015]], ["2016-2020", "2016–2020", [2016, 2020]], ["2021-2025", "2021–2025 (short follow-up)", [2021, 2025]], ["2010-2025", "2010–2025 (pooled)", [2010, 2025]]];

/** A <select> bound to a setter. options: [[value, label]]. */
export function pick(label, options, value, onchange) {
  const el = h("select", { class: "sel", "aria-label": label }, options.map(([v, t]) => h("option", { value: v, selected: v === value ? true : null }, t)));
  el.addEventListener("change", () => { onchange(el.value); touch(el); });
  return h("label", {}, label, el);
}

export async function render(root, lab) {
  const { D, cx, N } = lab;
  const four = D.timingRegions;
  const st = { region: "PJM", type: "all", size: "all", era: "2010-2020" };

  root.append(
    h("p", { class: "lede", html: `You're told a project “is in the PJM queue.” What are the odds it ever runs? The tricky part: many requests haven't finished, in <i>either</i> direction. Two tempting shortcuts give badly wrong answers. The right tool is the one actuaries and clinical trials use for data shaped like this: <b>survival analysis with competing risks</b>.` }),
    predict({
      q: "Of PJM requests that entered from 2010 to 2020, what share reach commercial operation within 10 years of their request?",
      options: [N.pjmKm10, N.pjmWd10, N.pjmAj10, N.pjmNaive10],
      answer: 2,
      explain: () => `${N.pjmAj10}. Over the same 10 years, ${N.pjmWd10} withdraw. The two tempting answers are both on the chart below. ${N.pjmNaive10} counts every unfinished request as a failure. ${N.pjmKm10} treats every withdrawn project as if it might still finish.`,
    }));

  const chartBox = h("div", { class: "chartbox" });
  const ro = {
    c5: readout("", "", { cls: "good" }), c10: readout("", "", { cls: "good" }),
    w10: readout("", ""), wait: readout("", "", { cls: "brass" }), km: readout("", "", { cls: "wall" }),
  };
  const label = (r, txt) => { r.querySelector(".l").textContent = txt; };
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
    h("p", { class: "note", html: `Timing comes from the four grid operators whose files date nearly every outcome: CAISO (California), MISO (the Midwest), PJM (the mid-Atlantic, including northern Virginia's data-center cluster) and SPP (the central plains); ${N.timingN} requests entered 2010–2025. ERCOT (Texas), NYISO, ISO-NE and the non-ISO utilities appear in step 0's counts, but too many of their outcomes lack dates to time them.` })));

  function current() {
    const era = ERAS.find(e => e[0] === st.era)[2], size = SIZES.find(z => z[0] === st.size)[2];
    const regions = st.region === "four" ? four : [st.region];
    const rr = cx.sel({ regions, types: st.type === "all" ? null : [D.types[+st.type]], years: era, mw: size, timing: true });
    const dur = durations(rr, cx.C);
    const name = `${st.region === "four" ? "CAISO+MISO+PJM+SPP" : st.region}, ${st.type === "all" ? "any technology" : D.types[+st.type]}, ${SIZES.find(z => z[0] === st.size)[1].toLowerCase()}, entered ${era[0]}–${era[1]}`;
    return { rr, dur, aj: aalenJohansen(dur), km: kaplanMeierCod(dur), name };
  }

  function draw() {
    const { rr, dur, aj, km, name } = current();
    const W = 640, H = 330, m = { l: 46, r: 16, t: 12, b: 40 }, tMax = 12;
    const x = scale(0, tMax, m.l, W - m.r), y = scale(0, 1, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Odds curves for ${name}` });
    svg.append(axes({ x, y, W, H, m, xt: niceTicks(0, tMax, 6), yt: [0, .2, .4, .6, .8, 1], xfmt: v => v, yfmt: v => fmt.pct(v), xlab: "Years since the interconnection request" }));
    const tStop = followUp(dur, tMax);
    // Every readout is taken at 10 years, or at the end of follow-up if this slice hasn't been watched that long.
    const tH = Math.min(10, tStop);
    if (tStop < tMax) {
      const right = tStop > 0.7 * tMax;
      svg.append(s("rect", { x: x(tStop), y: m.t, width: x(tMax) - x(tStop), height: H - m.t - m.b, fill: css("--grey-soft"), opacity: 0.8 }),
        s("text", { x: right ? x(tStop) - 6 : x(tStop) + 6, y: m.t + 14, "text-anchor": right ? "end" : "start", class: "lbl halo" }, `fewer than ${MIN_AT_RISK} still watched →`));
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
      path(aj.map(q => [q[0], q[3]]), css("--wd"), { "stroke-width": 2 });
      path(aj.map(q => [q[0], q[2]]), css("--op"), { "stroke-width": 3.2 });
      for (const t of [...new Set([Math.min(5, tH), tH])]) {
        const v = at(aj, t, 2);
        svg.append(s("circle", { cx: x(t), cy: y(v), r: 4, fill: css("--op") }), s("text", { x: x(t) + 6, y: y(v) - 6, class: "val halo" }, fmt.pct(v)));
      }
    }
    chartBox.replaceChildren(svg);
    const short = tH < 10, at5 = Math.min(5, tH), yrs = short ? `${fmt.yr(tH)} (end of follow-up)` : "10 years";
    label(ro.c5, `Reach COD within ${short && at5 < 5 ? fmt.yr(at5) : "5 years"}`); label(ro.c10, `Reach COD within ${yrs}`);
    label(ro.w10, `Withdrawn within ${yrs}`); label(ro.wait, `Still waiting at ${yrs}`); label(ro.km, `The KM mistake says (${short ? fmt.yr(tH) : "10 years"})`);
    ro.c5.set(fmt.pct(at(aj, at5, 2)), `of ${fmt.int(rr.length)} requests`);
    ro.c10.set(fmt.pct(at(aj, tH, 2)), `of ${fmt.int(rr.length)} requests`);
    ro.w10.set(fmt.pct(at(aj, tH, 3)), "");
    ro.wait.set(fmt.pct(at(aj, tH, 1)), `${fmt.int(atRisk(dur, tH))} still being watched then`);
    ro.km.set(fmt.pct(at(km, tH, 1)), `naive share done: ${fmt.pct(naiveBy(rr, cx.C, tH))}`);
    thin.innerHTML = (rr.length < 150 ? `<b class="hl-wall">Thin slice:</b> ${fmt.int(rr.length)} requests. Read the curve's shape, not its last digit. ` : `Slice: ${name}. `)
      + (short
        ? `<b>This slice has only been watched for ${fmt.yr(tStop)}.</b> Odds beyond that are unknown, not zero, so every readout stops there.`
        : `${fmt.pct(at(aj, 10, 1))} are still unresolved at 10 years, so the green 10-year figure is mostly settled. The orange curve's late climb is the mistake in action: as the last few requests finish, each one counts for a large share.`);
    if (st.region !== "PJM" || st.type !== "all" || st.size !== "all" || st.era !== "2010-2020") {
      ledger.put("s1", { what: `Odds a request reaches COD within ${yrs} (${name})`, price: fmt.pct(at(aj, tH, 2)), note: `Withdrawn by then: ${fmt.pct(at(aj, tH, 3))}. n = ${fmt.int(rr.length)}. Ignoring withdrawals would say ${fmt.pct(at(km, tH, 1))}.` });
    }
  }
  draw();

  root.append(
    clicks(null, h("ul", {},
      h("li", { html: `<b>Mistake 1, the naive count</b> (dotted): “what share has reached COD?” Every request still in the queue counts as a failure, so it can only <i>understate</i> the odds, worst for recent years. For PJM entrants 2010–2020, it says ${N.pjmNaive10} at 10 years.` }),
      h("li", { html: `<b>Mistake 2, Kaplan–Meier ignoring withdrawals</b> (orange): the textbook survival curve, with withdrawals treated as “we stopped watching.” But a withdrawn project can never finish. KM assumes it could, so it <i>overstates</i> the odds wildly: ${N.pjmKm10} for the same requests.` }),
      h("li", { html: `<b>Right: competing risks</b> (green). Aalen–Johansen keeps unfinished requests in the count only for as long as they've been watched. It lets withdrawal and completion race, so the two curves plus “still waiting” always add to 100%. For PJM: ${N.pjmAj10} reach COD within 10 years.` }),
      h("li", { html: "<b>Compare cohorts; don't pool them blindly.</b> Pick “2021–2025”: those requests have been watched for under five years, and PJM has brought almost none of them online yet. Pooling them with older years (the “pooled” option) drags the 10-year odds down, because it assumes a request's chances don't depend on when it entered." }),
      h("li", { html: "<b>Slice it.</b> Gas finishes far more often than solar or storage, and small projects finish more often than big ones. Try PJM gas, then PJM solar." }))),
    say("The share finished so far isn't the odds. Unfinished isn't failed, and withdrawn can't finish. Count it with competing risks, and compare like with like."),
    modelCard({
      what: "For requests in a slice, what's the probability of reaching COD (or withdrawing) within <i>t</i> years of the request?",
      formula: `Sort every request by its time to an event: COD, withdrawal, or still in the queue on 2025-12-31 (censored). At each event time <i>t<sub>j</sub></i> with <i>n<sub>j</sub></i> still at risk, <i>d<sub>1j</sub></i> CODs and <i>d<sub>2j</sub></i> withdrawals: CIF<sub>COD</sub>(<i>t<sub>j</sub></i>) = CIF<sub>COD</sub>(<i>t<sub>j−1</sub></i>) + S(<i>t<sub>j−1</sub></i>)·<i>d<sub>1j</sub>/n<sub>j</sub></i>, and S(<i>t<sub>j</sub></i>) = S(<i>t<sub>j−1</sub></i>)·(1 − (<i>d<sub>1j</sub>+d<sub>2j</sub></i>)/<i>n<sub>j</sub></i>). That's the Aalen–Johansen estimator. The KM mistake is 1 − ∏(1 − <i>d<sub>1j</sub>/n<sub>j</sub></i>), with withdrawals treated as censored. Curves and readouts stop once fewer than ${MIN_AT_RISK} requests are still being watched.`,
      tags: `<span class="tag tag-M">measured</span> ${N.timingN} requests in CAISO, MISO, PJM and SPP that entered 2010–2025. Rows whose outcome has no date are dropped there (counted in <a href="https://github.com/bakulbadwal/interconnection-queue-lab/blob/main/data/SNAPSHOT.md">SNAPSHOT.md</a>). If undated outcomes differ systematically from dated ones, the curves are biased. That's flagged, not fixed. Within a slice, the estimator assumes a request's chances don't depend on its entry year, which is why the default compares 2010–2020 entrants rather than pooling 2010–2025.`,
      py: "stats.py",
    }));
}
