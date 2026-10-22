// Field test — eight questions answered by operating the widgets. Answers are computed from the same data.
import { h, touch, ledger } from "../ui.js";
import { durations, aalenJohansen, kaplanMeierCod, at, landmark, builtWaits, quantile, shares } from "../stats.js";
import { delayCost, valuePerMWyr, portfolio } from "../econ.js";
import { views, fmt } from "../numbers.js";

export const FIELD_SLICE = { regions: ["CAISO"], types: ["Battery"], years: [2010, 2020] };

export async function render(root, lab) {
  const { D, O, cx } = lab;
  const camp = O.campus;
  // Q2–Q3 use a slice watched for at least 10 years (tests/check.mjs asserts it), so the 10-year readout is real.
  const fq = cx.sel({ ...FIELD_SLICE, timing: true });
  const fqDur = durations(fq, cx.C), fqAj = aalenJohansen(fqDur), fqKm = kaplanMeierCod(fqDur);
  const taj = aalenJohansen(durations(cx.sel({ timing: true }), cx.C));
  const w2125 = builtWaits(cx.sel({ timing: true }), [2021, 2025]);
  const vw = views(O, cx.measured);
  const best = Object.values(vw).sort((a, b) => b.p * b.onByDeadline - a.p * a.onByDeadline)[0].id;

  const Q = [
    { step: "0", q: "Step 0: what share of the capacity that entered 2000–2020 had reached commercial operation by end-2025? (percent)", unit: "%", ans: 100 * shares(cx.sel({ years: [2000, 2020] }), "mw").share[1], tol: 1 },
    { step: "1", q: "Step 1: set CAISO, Battery, any size, entered 2010–2020. What's the chance of reaching COD within 10 years? (percent)", unit: "%", ans: 100 * at(fqAj, 10, 2), tol: 1 },
    { step: "1", q: "Same slice: what does the Kaplan–Meier mistake (ignoring withdrawals) say at 10 years? (percent)", unit: "%", ans: 100 * at(fqKm, 10, 1), tol: 1 },
    { step: "2", q: "Step 2: for projects built 2021–2025 in CAISO, MISO, PJM and SPP, what's the P90 wait from request to COD? (years)", unit: "yr", ans: quantile(w2125, 0.9), tol: 0.1 },
    { step: "2", q: "Step 2: a request has already waited 4 years. What's its chance of reaching COD in the next 3 years? (percent)", unit: "%", ans: 100 * landmark(taj, 4, 3).cod, tol: 1 },
    { step: "3", q: "Step 3: turn on “GPUs already bought,” defaults otherwise. What does one year late cost? (answer in millions of dollars)", unit: "$M", ans: delayCost(camp.readyYears + 1, camp.readyYears, camp.mw, valuePerMWyr(camp, camp.valuePerMWyr, true), camp.discount), tol: 5 },
    { step: "4", q: "Step 4: with the default odds, which path has the highest chance of power by end-2029?", choices: O.options.map(o => [o.id, o.short]), ans: best },
    { step: "★", q: "Capstone: 100 MW uprate, 100 MW behind-the-meter gas, 50 MW flexible load. What's the chance of at least 200 MW by end-2029? (percent)", unit: "%",
      ans: 100 * portfolio(vw, { uprate: 100, btm: 100, flex: 50 }, camp.needMW, camp.fallbackYears, camp, camp.valuePerMWyr, camp.discount).pNeed, tol: 1 },
  ];
  let right = 0;
  const scoreEl = h("div", { class: "callout" }, "Answer each one by operating the step it names.");
  const box = h("div", { class: "quiz" });
  Q.forEach((qq, i) => {
    const out = h("div", { class: "small", style: { marginTop: "6px" } });
    let done = false;
    const mark = ok => {
      if (!done && ok) { right++; done = true; }
      out.innerHTML = ok ? `<span class="hl-green">Right.</span> ${qq.choices ? "" : `Answer: ${qq.unit === "$M" ? fmt.money(qq.ans) : qq.ans.toFixed(qq.unit === "yr" ? 1 : 0) + (qq.unit === "%" ? "%" : " yr")}.`}`
        : `<span class="hl-wall">Not yet.</span> Go back to step ${qq.step} and read it off the widget.`;
      scoreEl.textContent = `${right} of ${Q.length} right.`;
      if (right === Q.length) ledger.put("test", { what: "Field test", price: `${Q.length} of ${Q.length}`, note: "Every answer read off a widget." });
    };
    let input;
    if (qq.choices) {
      input = h("select", { class: "sel" }, h("option", { value: "" }, "Choose…"), qq.choices.map(([v, t]) => h("option", { value: v }, t)));
      input.addEventListener("change", () => { touch(input); mark(input.value === qq.ans); });
      box.append(h("div", { class: "qq" }, h("div", {}, h("b", {}, `${i + 1}. `), qq.q), h("div", { style: { marginTop: "6px" } }, input), out));
    } else {
      input = h("input", { type: "number", step: "any", "aria-label": `Answer ${i + 1}` });
      const btn = h("button", { class: "btn small", type: "button", onclick: () => { touch(btn); mark(Math.abs(+input.value - qq.ans) <= qq.tol + 1e-9 && input.value !== ""); } }, "Check");
      box.append(h("div", { class: "qq" }, h("div", {}, h("b", {}, `${i + 1}. `), qq.q), h("div", { class: "btnrow", style: { marginTop: "6px" } }, input, h("span", { class: "small muted" }, qq.unit), btn), out));
    }
  });
  root.append(h("p", { class: "lede" }, "Eight questions. Each one is answered by moving a control in the step it names, not by remembering a number."), scoreEl, box);
}
