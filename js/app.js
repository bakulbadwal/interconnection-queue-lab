// app.js — shell, data load, router, landing page, takeaways list.
import { h, $, ledger, progress, css } from "./ui.js";
import { rowsOf, select, shares } from "./stats.js";
import { computeNumbers, context } from "./numbers.js";

export const STEPS = [
  { id: "s0", k: "0", title: "The line", short: "Who asks, who gets through", mod: "./steps/s0.js",
    blurb: "Every generator that wants grid power files a request and waits in a public queue. Most never get built." },
  { id: "s1", k: "1", title: "Odds of reaching the finish", short: "Counting correctly when most aren't done", mod: "./steps/s1.js",
    blurb: "Three ways to count a project's odds. Two are tempting and wrong. Slice by region, technology, size and year." },
  { id: "s2", k: "2", title: "How long the wait is", short: "The distribution, not the median", mod: "./steps/s2.js",
    blurb: "The P90 is the number a schedule should carry. And what a project's odds look like after it has already waited years." },
  { id: "s3", k: "3", title: "What a year costs", short: "Delay, in dollars, for a 250 MW campus", mod: "./steps/s3.js",
    blurb: "Turn the measured wait into money for an AI campus, using Compute Deal Desk's price of a megawatt-year." },
  { id: "s4", k: "4", title: "The options desk", short: "Ways around the queue", mod: "./steps/s4.js",
    blurb: "Expedited track, uprate, restart, behind-the-meter gas, flexible load. What each buys in time, and at what odds." },
  { id: "memo", k: "★", title: "The power memo", short: "Capstone", mod: "./steps/memo.js",
    blurb: "Power 250 MW in PJM by end-2029. Build a portfolio, read its odds, write the six-sentence memo." },
  { id: "test", k: "✓", title: "Field test", short: "Eight questions", mod: "./steps/test.js",
    blurb: "Eight questions you answer by operating the widgets." },
];

const main = $("#main"), tabs = $("#tabs"), wrap = $("#wrap"), side = $("#ledger");
let LAB = null;

async function loadLab() {
  const [D, O] = await Promise.all(["data/queue.json", "data/options.json"].map(p => fetch(p).then(r => {
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return r.json();
  })));
  const rows = rowsOf(D);
  return { D, O, rows, cx: context({ D, O, rows }), N: computeNumbers({ D, O, rows }) };
}

function renderTabs(cur) {
  tabs.innerHTML = "";
  tabs.append(h("a", { class: "tab", href: "#/", "aria-current": cur === "home" ? "page" : null }, h("span", { class: "k" }, "◆"), "Start"));
  for (const st of STEPS) {
    tabs.append(h("a", { class: `tab ${progress.done.has(st.id) ? "done" : ""}`, href: `#/${st.id}`, "aria-current": cur === st.id ? "page" : null, title: st.short },
      h("span", { class: "k" }, st.k), st.title, h("span", { class: "dot", "aria-hidden": "true" })));
  }
  const on = tabs.querySelector('[aria-current="page"]');
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
}
progress.listeners.push(() => renderTabs(current));

function renderLedger() {
  const items = Object.entries(ledger.items).sort((a, b) => a[1].at - b[1].at);
  $("#ledgerCount").textContent = items.length;
  side.innerHTML = "";
  side.append(h("div", { class: "card" },
    h("h3", {}, "Takeaways"),
    h("div", { class: "intro" }, "What the wait means, in numbers you can say in a meeting. Each step adds a line as you work through it."),
    h("ul", {}, items.length ? items.map(([, it]) => h("li", {}, h("div", { class: "what" }, it.what), h("div", { class: "price" }, it.price), it.note ? h("div", { class: "note" }, it.note) : null))
      : h("li", { class: "empty" }, "Nothing yet. Start with step 0.")),
    h("div", { class: "foot" },
      h("button", { class: "btn small ghost", type: "button", onclick: () => window.print() }, "Print / PDF"),
      h("button", { class: "btn small ghost", type: "button", onclick: () => { if (confirm("Clear the takeaways?")) ledger.clear(); } }, "Clear"))));
}
ledger.listeners.push(renderLedger);

$("#ledgerBtn").addEventListener("click", () => {
  const open = side.classList.toggle("open");
  $("#ledgerBtn").setAttribute("aria-expanded", String(open));
  if (open && (window.innerWidth <= 1180 || current === "home")) side.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
$("#themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("iql.theme", root.dataset.theme); } catch {}
  route(); // charts read colours at draw time
});

/** One dot per 50 requests that entered 2000–2020, coloured by where they stood at the end of 2025. */
function heroDots(lab) {
  const c = select(lab.rows, { years: [2000, 2020] }), sh = shares(c, "n");
  const per = 50, n = Math.round(c.length / per);
  const counts = [Math.round(n * sh.share[1]), Math.round(n * sh.share[0])];
  counts.push(n - counts[0] - counts[1]);
  const colors = [css("--op"), css("--inq"), css("--wd")];
  const dots = h("div", { class: "dots", role: "img", "aria-label": `${lab.N.c2020n} requests from 2000 to 2020: ${lab.N.c2020opN} reached commercial operation` });
  counts.forEach((k, i) => { for (let j = 0; j < k; j++) dots.append(h("i", { style: { background: colors[i] } })); });
  return h("figure", { class: "hero-dots", style: { margin: 0 } }, dots,
    h("div", { class: "legend" }, [[colors[0], "Reached commercial operation"], [colors[1], "Still in the queue"], [colors[2], "Withdrawn"]].map(([col, t]) => h("span", {}, h("i", { style: { background: col } }), t))),
    h("figcaption", { class: "hero-cap", html: `Each dot is ${per} of the ${lab.N.c2020n} requests that entered US queues from 2000 to 2020, coloured by their status at the end of 2025. ${lab.N.c2020opN} of requests (${lab.N.c2020opMW} of the capacity) became running power plants. Source: LBNL <i>Queued Up</i> 2026.` }));
}

function landing(lab) {
  const N = lab.N;
  return h("div", {},
    h("section", { class: "hero" },
      h("div", {},
        h("h1", { html: "Power, not chips, sets the pace. <em>What does the wait mean?</em>" }),
        h("p", { class: "lede", html: `Every new power plant in the US asks its grid operator for a connection and waits in a public <b>interconnection queue</b> while engineers study what the grid needs. Queue trackers show you <i>who</i> is waiting. This lab answers <b>what the wait means</b>: the odds a project ever connects, how long it really takes, what a year of delay costs an AI campus, and which ways around the line buy time.` }),
        h("p", { class: "lede small muted", html: `Built on all ${N.requests} requests in Lawrence Berkeley National Laboratory's <a href="https://emp.lbl.gov/queues"><i>Queued Up</i></a> data (2026 edition, through 2025). Every statistic is computed in your browser from that file, and checked against an independent implementation.` }),
        h("div", { class: "btnrow" }, h("a", { class: "btn", href: "#/s0" }, "Start with step 0 →"), h("a", { class: "btn ghost", href: "#/s1" }, "Jump to the keystone: step 1"))),
      heroDots(lab)),
    h("div", { class: "card flat" },
      h("h3", {}, "Why now"),
      h("p", { html: `On Oct 6, 2026, Google signed a 20-year deal for 890 MW of <b>uprates</b> at 11 existing Constellation reactors in PJM, plus 2.7 GW from Constellation's existing PJM fleet. The companies called it a response to PJM's “Bring Your Own” proposal for large loads (<a href="https://www.powermag.com/google-deal-backs-890-mw-of-constellation-nuclear-uprates-at-11-pjm-reactors/">POWER</a>). The deal buys new megawatts behind a grid connection that already exists. Step 4 shows why that's worth so much.` })),
    h("div", { class: "card flat" },
      h("h3", {}, "Part of a set"),
      h("div", { class: "trilogy" },
        h("div", {}, h("b", {}, "Hyperscale Ledger"), "The campus: audited GPU specs, rack power, the 250 MW scenario this lab borrows. ", h("a", { href: "https://bakulbadwal.github.io/hyperscale-ledger/" }, "Open")),
        h("div", {}, h("b", {}, "Compute Deal Desk"), "What a megawatt is worth: the shadow price of the grid wall, which step 3 multiplies by time. ", h("a", { href: "https://bakulbadwal.github.io/compute-deal-desk/" }, "Open")),
        h("div", { class: "me" }, h("b", {}, "Interconnection Queue Lab"), "How long until the megawatt arrives, how likely, and what the wait costs."))),
    h("h2", { style: { marginTop: "26px" } }, "The seven stops"),
    h("div", { class: "map" }, STEPS.map(st => h("a", { href: `#/${st.id}`, "data-k": st.k, class: progress.done.has(st.id) ? "done" : null },
      h("div", { class: "k" }, `STEP ${st.k}`), h("b", {}, st.title), h("span", {}, st.blurb), h("div", { class: "sess" }, st.short)))),
    h("div", { class: "card flat", style: { marginTop: "22px" } },
      h("h3", {}, "Honest about what's measured"),
      h("p", { html: `<span class="tag tag-M">measured</span> Odds, waits and shares come straight from the ${N.requests} requests at run time, with a <a href="https://github.com/bakulbadwal/interconnection-queue-lab/tree/main/models">Python twin</a> and a cross-check against <code>statsmodels</code>. <span class="tag tag-S">sourced</span> Deal terms, dates and equipment prices are cited where they appear. <span class="tag tag-T">teaching value</span> What a megawatt-year is worth, discount rates, and the odds and ranges for options with no public track record are labelled assumptions. Quote the mechanics and the measured numbers, not the dollars.` }),
      h("p", { class: "small muted", html: `What the data is not: these are <b>generator</b> queues. A data center's own request to connect as a large <b>load</b> is a separate process with much less public data. And the timing statistics come from the four regions whose files date nearly every outcome (CAISO, MISO, PJM, SPP; ${N.timingN} requests entered 2010–2025). The README and <a href="https://github.com/bakulbadwal/interconnection-queue-lab/blob/main/DATA.md">DATA.md</a> list every rule.` })));
}

let current = null;
const cache = new Map();
async function route() {
  const m = location.hash.match(/^#\/(\w+)/);
  const id = m && STEPS.some(s => s.id === m[1]) ? m[1] : "home";
  current = id;
  renderTabs(id);
  main.innerHTML = "";
  wrap.classList.toggle("full", id === "home");
  side.classList.remove("open"); $("#ledgerBtn").setAttribute("aria-expanded", "false");
  try {
    if (!LAB) { main.append(h("div", { class: "loading" }, "Loading 37,527 interconnection requests…")); LAB = await loadLab(); main.innerHTML = ""; }
    if (id === "home") { main.append(landing(LAB)); document.title = "Interconnection Queue Lab"; window.scrollTo(0, 0); return; }
    const st = STEPS.find(s => s.id === id);
    document.title = `${st.k} · ${st.title} — Interconnection Queue Lab`;
    const sec = h("section", { "data-step": id });
    main.append(sec);
    window.scrollTo(0, 0);
    let mod = cache.get(st.mod);
    if (!mod) { mod = await import(st.mod); cache.set(st.mod, mod); }
    const i = STEPS.indexOf(st);
    sec.append(h("header", { class: "step-head" },
      h("div", { class: "chips" }, h("span", { class: "chip" }, `Step ${st.k}`), h("span", { class: "chip seat" }, st.short)),
      h("h2", {}, st.title)));
    await mod.render(sec, LAB);
    sec.append(h("nav", { class: "stepnav", "aria-label": "Step navigation" },
      i > 0 ? h("a", { class: "btn ghost", href: `#/${STEPS[i - 1].id}` }, `← ${STEPS[i - 1].title}`) : h("a", { class: "btn ghost", href: "#/" }, "← Start"),
      i < STEPS.length - 1 ? h("a", { class: "btn", href: `#/${STEPS[i + 1].id}` }, `${STEPS[i + 1].title} →`) : h("span")));
  } catch (e) {
    console.error(e);
    main.innerHTML = "";
    main.append(h("div", { class: "callout warn" }, "Something went wrong loading this step: " + e.message + ". If you opened the file directly, serve the folder over http (see the README)."));
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("load", () => window.scrollTo(0, 0));
renderLedger();
route();
