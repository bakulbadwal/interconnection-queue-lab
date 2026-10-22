// Step 4 · The options desk — six ways to power, compared on time to power, odds, and expected delay cost.
import { h, s, slider, predict, clicks, say, modelCard, scale, legend, css, ledger, tag } from "../ui.js";
import { views } from "../numbers.js";
import { fmt } from "../numbers.js";

/** Tag(s) for an option's time range and odds. */
export const optTags = o => (o.time === "measured" ? [tag("M")] : o.timeTag === "S/T" ? [tag("S"), tag("T")] : [tag("T")]);

/** Small horizontal range bar: P10–P90 band, P50 tick, the ready date and the deadline. */
export function rangeBar(v, camp, tMax = 8) {
  const W = 400, H = 44, m = { l: 8, r: 18 };
  const x = scale(0, tMax, m.l, W - m.r);
  const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `P10 ${fmt.yr(v.p10)}, median ${fmt.yr(v.p50)}, P90 ${fmt.yr(v.p90)}` });
  svg.append(s("line", { x1: x(0), x2: x(tMax), y1: 17, y2: 17, stroke: css("--rule-strong"), "stroke-width": 1 }));
  for (let t = 0; t <= tMax; t += 2) svg.append(s("line", { x1: x(t), x2: x(t), y1: 13, y2: 21, stroke: css("--rule-strong") }), s("text", { x: x(t), y: 40, "text-anchor": "middle" }, t === tMax ? `${t} yr` : t));
  svg.append(s("rect", { x: x(Math.min(v.p10, tMax)), y: 10, width: Math.max(2, x(Math.min(v.p90, tMax)) - x(Math.min(v.p10, tMax))), height: 14, rx: 3, fill: css("--blue"), opacity: 0.35 }),
    s("line", { x1: x(v.p50), x2: x(v.p50), y1: 7, y2: 27, stroke: css("--navy"), "stroke-width": 3 }),
    s("line", { x1: x(camp.deadlineYears), x2: x(camp.deadlineYears), y1: 2, y2: 32, stroke: css("--wall"), "stroke-width": 1.6, "stroke-dasharray": "3 3" }));
  return svg;
}

export async function render(root, lab) {
  const { O, cx, N } = lab;
  const camp = O.campus;
  const ps = Object.fromEntries(O.options.map(o => [o.id, o.time === "measured" ? cx.measured.p : o.p]));
  const names = O.options.filter(o => ["queue", "eit", "uprate", "btm"].includes(o.id));

  root.append(
    h("p", { class: "lede", html: `You need ${N.campusMW} in PJM, flowing by the end of 2029 (about ${fmt.yr(camp.deadlineYears)} from now). The queue from steps 1–3 is one road. Here are the others people are actually taking, each with what it buys in <b>time</b> and its <b>odds</b>.` }),
    predict({
      q: "Which path is most likely to have power flowing by the end of 2029?",
      options: names.map(o => o.short),
      answer: names.findIndex(o => o.id === N.bestOnTimeId),
      explain: () => `${O.options.find(o => o.id === N.bestOnTimeId).short}, at ${N[N.bestOnTimeId + "OnTime"]} with the default assumptions. It skips the generator queue entirely. A new build in the PJM queue has ${N.queueOnTime}: only ${N.qOdds} of big gas requests reach COD within ${N.qHorizon} (as far as they've been watched), and few of those that do get there by year three. The uprate's odds are high, but its timeline straddles the deadline (${N.uprateOnTime}).`,
    }));

  const rowsEl = h("div", { class: "optrows" });
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "Six ways to power, side by side"),
      h("span", { class: "sub" }, "Bar: P10–P90 years to power, from today; the dark tick is the median; the dashed line is end-2029. “On time” = odds it succeeds × chance it lands by end-2029.")),
    rowsEl,
    legend([[css("--blue"), "P10–P90 time to power"], [css("--navy"), "Median", "line"], [css("--wall"), "End of 2029", "line"]]),
    h("p", { class: "foot-note", html: `<b>Not on the desk: orbital compute.</b> Putting data centers in orbit skips the grid entirely. It's a research bet with no commercial-scale track record yet, so there's no wait or odds to put on a row.` })));

  const vw = views(O, cx.measured);
  const stat = {};
  rowsEl.append(...O.options.map(o => {
    const v = vw[o.id];
    stat[o.id] = h("div", { class: "st" });
    return h("div", { class: "optrow", "data-id": o.id },
      h("div", { class: "nm" }, o.short, ...optTags(o), h("small", {}, o.name)),
      rangeBar(v, camp),
      stat[o.id],
      h("details", {},
        h("summary", {}, "Where these numbers come from"),
        h("p", { style: { margin: "6px 0" } }, o.anchor),
        o.time === "measured" ? h("p", { class: "small" }, `Measured from ${fmt.int(v.n)} built plants. Odds = Aalen–Johansen probability of COD within ${N.qHorizon}, the end of follow-up for these ${N.qReqN} requests (step 1).`)
          : slider({ label: "Your view of the odds it succeeds", min: 0.05, max: 1, step: 0.05, value: ps[o.id], fmt: x => fmt.pct(x), id: `s4p-${o.id}`, oninput: x => { ps[o.id] = x; draw(); } }),
        h("div", { class: "cite" }, o.src.map(([t, u], i) => [i ? " · " : "Sources: ", h("a", { href: u, target: "_blank", rel: "noopener" }, t)]))));
  }));

  function draw() {
    for (const o of O.options) {
      const v = vw[o.id], p = ps[o.id];
      stat[o.id].replaceChildren(`${fmt.pct(p * v.onByDeadline)} on time`, h("small", {}, `odds ${fmt.pct(p)} · median ${fmt.yr(v.p50)}`));
    }
    const changed = O.options.some(o => o.time !== "measured" && ps[o.id] !== o.p);
    if (changed) ledger.put("s4", { what: "Chance of power by end-2029, by path (default assumptions)", price: `BTM gas ${N.btmOnTime} · flex ${N.flexOnTime} · uprate ${N.uprateOnTime} · new build in queue ${N.queueOnTime}`, note: "Queue figures measured; the others are modeled ranges around cited dates, with teaching-value odds." });
  }
  draw();

  root.append(
    clicks(null, h("ul", {},
      h("li", { html: `<b>The scarce asset is the grid connection, not the generator.</b> A plant's interconnection (or injection) rights are its permission to push a set number of megawatts onto the grid. Uprates and restarts start from rights that already exist, though added megawatts may still need PJM to raise them. Even Crane's restart ran into the queue: PJM said some upgrades would take until 2031, so Constellation asked FERC to move another plant's injection rights to it.` }),
      h("li", { html: `<b>Fast tracks still need hardware.</b> PJM's expedited track promises an agreement in about 10 months for projects that can be online within three years. But a heavy-frame gas turbine ordered today delivers in 2031. The fast lane only helps if you already hold the turbine.` }),
      h("li", { html: `<b>Behind-the-meter and flexible load trade money and risk for time.</b> On-site aeroderivative turbines cost about twice what a combined-cycle turbine costs per kW. Accepting curtailment (about 85 hours a year in Duke's 0.25% case) buys earlier access where the grid has headroom. Both skip the generator queue, and both carry risks the queue doesn't: fuel and air permits, or rules that are still being written.` }),
      h("li", { html: "<b>Your odds are a dial, not a fact.</b> Open any modeled row and move its odds. Odds for options with no public track record are teaching values. Argue with them." }))),
    say(`The scarce thing is the interconnection right, not the turbine. Uprates and restarts reuse one, behind-the-meter skips the line, and a new build in the queue is the slowest path, with about a ${N.queueOnTime} chance of power by 2029.`),
    modelCard({
      what: "For each path to power: the P10/median/P90 years from today, the chance it succeeds, and the chance it delivers by end-2029.",
      formula: `Queue: the measured waits of built PJM gas plants of 100 MW or more (empirical quantiles), with odds = Aalen–Johansen CIF<sub>COD</sub> at 10 years or at the end of follow-up, whichever comes first (here ${N.qHorizon}). Other paths: a triangular distribution (low, most likely, high) anchored on cited dates, with teaching-value odds. On time = odds × P(time ≤ end-2029). Expected delay cost per MW integrates step 3's cost curve over the range (4,000-point midpoint rule).`,
      tags: `<span class="tag tag-M">measured</span> the queue row. <span class="tag tag-S">sourced</span> the anchor dates and facts in each row's notes. <span class="tag tag-T">teaching value</span> every other row's odds and most-likely time. Dollar figures from the sources (uprate $4.3B for 890 MW; aeroderivative ≈$1,800 per kW vs ≈$950 for combined-cycle turbines) aren't comparable cost bases, so the desk doesn't rank options on them.`,
      py: "econ.py",
    }));
}
