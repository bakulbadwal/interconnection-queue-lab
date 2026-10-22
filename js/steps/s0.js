// Step 0 · The line — who asks for a grid connection, and where they stood at the end of 2025.
import { h, s, slider, seg, predict, clicks, say, modelCard, readout, scale, legend, css, ledger, tag, touch, onFill } from "../ui.js";
import { select, shares } from "../stats.js";
import { fmt } from "../numbers.js";

export async function render(root, lab) {
  const { D, rows, N } = lab;
  const st = { to: 2020, w: "mw" };

  root.append(
    h("p", { class: "lede", html: `A developer who wants to build a power plant can't just plug it in. It files an <b>interconnection request</b> with the grid operator: an independent system operator or regional transmission organization (an ISO or RTO, such as PJM in the mid-Atlantic), or, outside those regions, a utility. Then it joins a public <b>queue</b> and waits while engineers study what the grid would need: new lines, transformers, breakers, and who pays for them. Only then does it sign an <b>interconnection agreement</b>, build, and reach its <b>commercial operation date (COD)</b>.` }),
    h("p", { html: `Lawrence Berkeley National Laboratory compiles every queue in the country, with GridTracker. The 2026 file holds ${N.requests} requests with a request date, from the seven ISOs and about 50 utilities: roughly all US generating capacity.` }),
    predict({
      q: "Of all the generating capacity that asked to connect from 2000 to 2020, how much was running by the end of 2025?",
      options: ["About three in four", "About half", "About one in three", "About one in eight"],
      answer: 3,
      explain: () => `${N.c2020opMW} of the capacity (${N.c2020opGW} of ${N.c2020GW}) reached commercial operation, and ${N.c2020wdMW} was withdrawn. Counted by project rather than capacity, it's ${N.c2020opN} of ${N.c2020n} requests: small projects finish more often. LBNL's own report gives the same figures, and <code>make check</code> reproduces them from this file.`,
    }));

  const chartBox = h("div", { class: "chartbox" });
  const ro = { n: readout("Requests in view", ""), op: readout("Reached commercial operation", "", { cls: "good" }), q: readout("Still in the queue", "", { cls: "brass" }), wd: readout("Withdrawn", "") };
  root.append(h("div", { class: "card" },
    h("div", { class: "card-h" }, h("h3", {}, "Where every request stood at the end of 2025"), tag("M"), h("span", { class: "sub" }, "One bar per region. Move the end year forward and watch the recent requests turn brass: they haven't finished yet, in either direction.")),
    h("div", { class: "ctrlrow" },
      h("label", {}, "Weight by", seg({ label: "Weight", value: st.w, options: [["mw", "Capacity (MW)"], ["n", "Number of requests"]], onchange: v => { st.w = v; draw(); } })),
      h("div", { style: { flex: "1 1 240px" } }, slider({ label: "Requests that entered from 2000 through", min: 2005, max: 2025, value: st.to, id: "s0to", oninput: v => { st.to = v; draw(); } }))),
    chartBox,
    legend([[css("--op"), "Reached commercial operation"], [css("--inq"), "Still in the queue (active or suspended)"], [css("--wd"), "Withdrawn"]]),
    h("div", { class: "readouts" }, ro.n, ro.op, ro.q, ro.wd)));

  function draw() {
    const order = ["All regions", ...D.regions];
    const W = 640, rowH = 26, m = { l: 92, r: 54, t: 6, b: 22 }, H = m.t + m.b + order.length * rowH;
    const x = scale(0, 1, m.l, W - m.r);
    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Outcome shares by region" });
    const cols = [css("--inq"), css("--op"), css("--wd")];
    order.forEach((name, i) => {
      const rr = select(rows, { regions: i === 0 ? null : [i - 1], years: [2000, st.to] });
      const sh = shares(rr, st.w), y0 = m.t + i * rowH;
      svg.append(s("text", { x: m.l - 8, y: y0 + rowH / 2 + 4, "text-anchor": "end", class: i === 0 ? "lbl" : null, "font-weight": i === 0 ? 600 : null }, name));
      let acc = 0;
      for (const k of [1, 0, 2]) {
        const w = sh.share[k];
        svg.append(s("rect", { x: x(acc), y: y0 + 4, width: Math.max(0, x(acc + w) - x(acc)), height: rowH - 8, fill: cols[k], rx: 2 },
          s("title", {}, `${name}: ${fmt.pct(w)} ${D.status[k]}`)));
        if (k === 1 && w >= 0.06) svg.append(s("text", { x: x(acc) + 5, y: y0 + rowH / 2 + 4, class: "val", style: `fill:${onFill(cols[1])}` }, fmt.pct(w)));
        acc += w;
      }
      svg.append(s("text", { x: W - m.r + 6, y: y0 + rowH / 2 + 4, class: "val" }, fmt.int(rr.length)));
    });
    svg.append(s("text", { x: W - m.r + 6, y: H - 6, class: "lbl" }, "n"));
    chartBox.replaceChildren(svg);
    const all = select(rows, { years: [2000, st.to] }), sh = shares(all, st.w), shn = shares(all, "n");
    ro.n.set(fmt.int(all.length), `entered 2000–${st.to}`);
    ro.op.set(fmt.pct(sh.share[1]), `${fmt.int(shn.w[1])} requests`);
    ro.q.set(fmt.pct(sh.share[0]), `${fmt.int(shn.w[0])} requests`);
    ro.wd.set(fmt.pct(sh.share[2]), `${fmt.int(shn.w[2])} requests`);
    if (st.to !== 2020 || st.w !== "mw") ledger.put("s0", { what: "Capacity that asked to connect 2000–2020 and was running by end-2025", price: `${N.c2020opMW} (${N.c2020opGW} of ${N.c2020GW})`, note: `By project count: ${N.c2020opN} of ${N.c2020n}. LBNL Queued Up 2026.` });
  }
  draw();

  root.append(
    h("div", { class: "callout", style: { marginBottom: "18px" }, html: `<b>Generators, not loads.</b> These queues are for plants that <i>produce</i> power. A data center asking to <i>draw</i> power files a separate large-load request with its utility, and far less of that is public. PJM's August 2026 filing at FERC would ask new large loads such as data centers to bring their own new capacity, or be first in line for curtailment when the grid is strained (<a href="https://virginiamercury.com/2026/08/27/new-proposal-from-grid-operator-pjm-would-require-data-centers-to-bring-their-own-power/">Virginia Mercury</a>, <a href="https://www.powermag.com/google-deal-backs-890-mw-of-constellation-nuclear-uprates-at-11-pjm-reactors/">POWER</a>). Bringing new capacity means some generator has to get through a queue like this one. That's why this queue matters to AI campuses either way.` }),
    clicks(null, h("ul", {},
      h("li", { html: `<b>Most of the line never reaches the front.</b> ${N.c2020wdMW} of 2000–2020 capacity was withdrawn. A request is an option a developer bought cheaply, not a plant.` }),
      h("li", { html: "<b>Regions differ, and the reasons are messy:</b> rules, study costs, how speculative the requests were, and how each region records outcomes." }),
      h("li", { html: "<b>Recent years look unfinished, because they are.</b> Slide the end year to 2025: the brass share balloons. Calling those projects failures would be wrong, and so would ignoring them. Step 1 is how to count them properly." }))),
    say(`Only about one in eight megawatts that asked to connect from 2000 to 2020 got built. A queue position is an option, not a power plant.`),
    modelCard({
      what: "Where did every request that entered in a range of years stand at the end of 2025?",
      formula: "Share of requests (or of requested MW) by status: operational, withdrawn, or still in the queue (active or suspended). No modeling: this is a count.",
      tags: `<span class="tag tag-M">measured</span> all ${N.requests} requests with a request date; capacity is the sum of a project's listed MW (hybrids count every component).`,
      py: "stats.py",
      extra: `Reproduces LBNL's published headline: ${N.c2020opMW} of 2000–2020 capacity operational, ${N.c2020wdMW} withdrawn (LBNL: 13% and 75%). The cleaning steps and row counts are in <a href="https://github.com/bakulbadwal/interconnection-queue-lab/blob/main/data/SNAPSHOT.md">data/SNAPSHOT.md</a>.`,
    }));
  root.querySelectorAll("input,button").forEach(el => el.addEventListener("click", () => touch(el)));
}
