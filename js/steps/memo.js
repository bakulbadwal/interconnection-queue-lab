// Capstone · The power memo — build a portfolio of paths to 250 MW, score it, write the six-sentence memo.
import { h, s, slider, clicks, say, modelCard, readout, scale, niceTicks, axes, css, ledger, tag, touch } from "../ui.js";
import { portfolio } from "../econ.js";
import { views, fmt } from "../numbers.js";
import { optTags } from "./s4.js";

const RISK = {
  queue: "the request withdraws or stalls in study, as most big gas requests in PJM do",
  eit: "the track is capped at 10 requests a year and closes at the end of 2027, and the 3-year promise needs a turbine we don't yet hold",
  uprate: "the uprate's timing straddles the deadline, and the added megawatts may still need PJM to raise the plant's interconnection rights",
  restart: "almost no retired plants can be restarted, and even Crane needed borrowed injection rights to beat PJM's 2031 upgrades",
  btm: "fuel supply, air permits and turbine delivery, at roughly twice the per-kW turbine cost of combined cycle",
  flex: "the rules for curtailable large loads are still being written, and we'd have to live with curtailment",
};

export async function render(root, lab) {
  const { O, cx, N } = lab;
  const camp = O.campus, V = camp.valuePerMWyr, r = camp.discount;
  const vw = views(O, cx.measured, V, r);
  const alloc = Object.fromEntries(O.options.map(o => [o.id, o.id === "queue" ? camp.mw : 0]));
  const sliders = {};

  root.append(
    h("p", { class: "lede", html: `The brief: <b>${N.campusMW} for an AI campus in PJM, with at least ${N.needMW} flowing by the end of 2029.</b> Split the megawatts across the paths from step 4. The desk scores your plan on the chance it meets the brief and on its expected delay cost (step 3's model), counting the megawatts from a failed path as arriving at a fallback in year ${camp.fallbackYears} ${tag("T").outerHTML}. Then write the memo.` }));

  const total = h("div", { class: "note" });
  const distBox = h("div", { class: "chartbox" });
  const ro = { p: readout(`Chance of ${N.needMW} or more by end-2029`, "", { cls: "good" }), mw: readout("Expected MW on time", ""), cost: readout("Expected delay cost", "", { cls: "brass" }) };
  const allocEl = h("div", { class: "alloc" });
  for (const o of O.options) {
    sliders[o.id] = slider({ label: `${o.short} (max ${o.maxMW} MW)`, min: 0, max: o.maxMW, step: 25, value: alloc[o.id], fmt: v => fmt.mw(v), id: `cap-${o.id}`,
      oninput: v => {
        const others = Object.entries(alloc).reduce((sum, [k, x]) => sum + (k === o.id ? 0 : x), 0);
        alloc[o.id] = Math.min(v, camp.mw - others);
        sliders[o.id].set(alloc[o.id]);
        draw();
      } });
    allocEl.append(h("div", {}, sliders[o.id], h("div", { class: "small muted" }, ...optTags(o))));
  }
  const preset = (label, a) => h("button", { class: "btn small ghost", type: "button", onclick: e => { for (const k in alloc) { alloc[k] = a[k] || 0; sliders[k].set(alloc[k]); } touch(e.target); draw(); } }, label);
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "Your power plan"), h("span", { class: "sub" }, `Up to ${N.campusMW} in total, in 25 MW blocks. Paths are assumed to succeed or fail independently.`)),
    h("div", { class: "grid2" },
      h("div", {}, distBox, h("div", { class: "readouts" }, ro.p, ro.mw, ro.cost)),
      h("div", { class: "ctrl" }, h("h4", {}, "Megawatts by path"), allocEl, total,
        h("div", { class: "btnrow" }, preset("All in the queue", { queue: 250 }), preset("Reference mix", { uprate: 100, btm: 100, flex: 50 }), preset("Spread thin", { queue: 50, eit: 50, uprate: 50, btm: 50, flex: 50 }))))));

  function score() { return portfolio(vw, alloc, camp.needMW, camp.fallbackYears, camp, V, r); }
  function draw() {
    const res = score();
    const sum = Object.values(alloc).reduce((a, b) => a + b, 0);
    total.innerHTML = `Allocated: <b>${fmt.mw(sum)}</b> of ${N.campusMW}${sum < camp.needMW ? ` <span class="hl-wall">(below the ${N.needMW} brief even if every path delivers)</span>` : ""}`;
    const W = 420, H = 210, m = { l: 40, r: 10, t: 12, b: 38 };
    const x = scale(0, camp.mw, m.l, W - m.r), y = scale(0, 1, H - m.b, m.t);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Distribution of megawatts online by end-2029" });
    svg.append(axes({ x, y, W, H, m, xt: [0, 50, 100, 150, 200, 250], yt: [0, .25, .5, .75, 1], yfmt: v => fmt.pct(v), xlab: "MW online by end-2029" }));
    svg.append(s("line", { x1: x(camp.needMW), x2: x(camp.needMW), y1: m.t, y2: H - m.b, stroke: css("--wall"), "stroke-dasharray": "4 3", "stroke-width": 1.6 }),
      s("text", { x: x(camp.needMW) - 4, y: m.t + 10, "text-anchor": "end", class: "val halo" }, "brief"));
    for (const [mw, p] of res.dist) svg.append(s("rect", { x: x(mw) - 7, y: y(p), width: 14, height: y(0) - y(p), rx: 2, fill: mw >= camp.needMW ? css("--op") : css("--wd") }));
    distBox.replaceChildren(svg);
    ro.p.set(fmt.pct(res.pNeed), `all in the queue: ${N.allQueuePNeed}`);
    ro.mw.set(fmt.mw(res.expectedMW));
    ro.cost.set(fmt.money(res.cost), `all in the queue: ${N.allQueueCost}`);
    ledger.put("memo", { what: "Your plan: chance of 200 MW+ by end-2029 and expected delay cost", price: `${fmt.pct(res.pNeed)} · ${fmt.money(res.cost)}`, note: Object.entries(alloc).filter(([, v]) => v).map(([k, v]) => `${O.options.find(o => o.id === k).short} ${v} MW`).join(", ") });
  }
  draw();

  const memo = h("textarea", { class: "memo", "aria-label": "Your memo" });
  function draft() {
    const res = score();
    const parts = Object.entries(alloc).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
    const nm = k => O.options.find(o => o.id === k).prose;
    const allQueue = parts.length === 1 && parts[0][0] === "queue";
    const lead = parts[0]?.[0];
    memo.value = [
      `Recommendation: power the ${camp.mw} MW campus with ${parts.map(([k, v]) => `${v} MW from ${nm(k)}`).join(", ") || "nothing yet"}.`,
      allQueue ? `This plan has a ${fmt.pct(res.pNeed)} chance of at least ${camp.needMW} MW by the end of 2029.`
        : `This plan has a ${fmt.pct(res.pNeed)} chance of at least ${camp.needMW} MW by the end of 2029, against ${N.allQueuePNeed} if we rely on a new build in the PJM queue.`,
      `The queue is the slow road: only ${N.qOdds} of PJM gas requests of 100 MW or more (entered 2010–2020) reached commercial operation within ${N.qHorizon}, as far as they've been watched, and those that do took a median ${N.qWaitP50} (P90 ${N.qWaitP90}).`,
      `Expected delay cost is ${fmt.money(res.cost)}${allQueue ? "" : ` versus ${N.allQueueCost} all-in-queue`}, at Compute Deal Desk's price of a megawatt-year (a teaching value, so read it as a scale, not a quote).`,
      lead ? `The main risk sits in ${nm(lead)}: ${RISK[lead]}.` : "The main risk: we haven't secured any path yet.",
      lead === "queue"
        ? "Next step: file the request now, and start a faster path in parallel, because the queue alone almost never meets the date."
        : `Next step: lock terms on ${lead ? nm(lead) : "the fastest path"} this quarter, and keep a queue request on file as a cheap, long-dated option.`,
    ].join(" ");
  }
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "The memo"), h("span", { class: "sub" }, "Six sentences: the call, the odds, the queue fact, the cost, the risk, the next step. Draft from your plan, then make it yours.")),
    memo,
    h("div", { class: "btnrow", style: { marginTop: "8px" } },
      h("button", { class: "btn", type: "button", onclick: e => { draft(); touch(e.target); } }, "Draft from my plan"),
      h("button", { class: "btn ghost", type: "button", onclick: async e => { try { await navigator.clipboard.writeText(memo.value); e.target.textContent = "Copied"; } catch { memo.select(); } } }, "Copy"))));
  draft();

  root.append(
    clicks(null, h("ul", {},
      h("li", { html: `<b>All in the queue almost never meets the brief</b> (${N.allQueuePNeed}). That verdict rests on the measured odds and waits alone.` }),
      h("li", { html: `<b>The reference mix</b> (100 MW uprate, 100 MW behind-the-meter gas, 50 MW flexible load) lifts the chance to ${N.mixedPNeed} and cuts expected delay cost to ${N.mixedCost}. Most of its remaining risk is the uprate's timeline straddling the deadline.` }),
      h("li", { html: `<b>Under the default odds, all behind-the-meter gas wins</b> (${N.allBtmPNeed}). That's the teaching values talking. What would stop you? Fuel supply, an air permit for 250 MW of on-site turbines, roughly twice the per-kW turbine cost, and a campus that never joins the grid. At even odds instead of the default, all behind-the-meter gas lands on time only ${N.allBtmEven} of the time.` }),
      h("li", { html: "<b>Spreading thin isn't hedging.</b> With a 200 MW floor on 250 MW, every block has to land. More paths means more ways to miss." }))),
    say("Don't bet the campus on the queue. Buy time with paths that reuse or skip a grid connection, keep a queue request as a cheap option, and quote the odds of power by the deadline, not a date."),
    modelCard({
      what: "For an allocation of megawatts across paths, what's the chance of at least 200 MW by end-2029, and the expected delay cost?",
      formula: "Each path delivers its block by the deadline with probability q = odds × P(time ≤ end-2029), independently. The distribution of MW on time is enumerated exactly over all 2<sup>k</sup> outcomes. Expected delay cost = Σ MW · (odds · E[cost per MW] + (1 − odds) · cost per MW at the fallback year).",
      tags: `<span class="tag tag-M">measured</span> the queue path. <span class="tag tag-S">sourced</span> anchor dates. <span class="tag tag-T">teaching value</span> other odds, the ${camp.fallbackYears}-year fallback, the ${N.needMW} brief and the price of a megawatt-year. Independence is a simplification: a PJM-wide rule change would move several paths at once.`,
      py: "econ.py",
    }));
}
