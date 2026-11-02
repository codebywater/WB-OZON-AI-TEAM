(function () {
  "use strict";
  const U = window.UnitEconomics;
  const $ = (id) => document.getElementById(id);

  // Пример из README: понятные цифры вместо пустой страницы.
  const EXAMPLE = {
    price: "1990", cost: "650", commission: "24,5", acquiring: "0", logistics: "90", returnLogistics: "50",
    buyout: "85", storage: "12", adsPct: "8", ads: "0", other: "0", tax: "usn6", taxRate: "6", vat: "0", target: "20",
  };
  const NUMBER_FIELDS = ["price", "cost", "commission", "acquiring", "logistics", "returnLogistics", "buyout", "storage", "adsPct", "ads", "other"];
  const ALL_FIELDS = Object.keys(EXAMPLE);
  // Постоянный цвет у каждой статьи, что бы ни случилось с остальными.
  const COLORS = { cost: "--s1", marketplace: "--s2", logistics: "--s3", ads: "--s4", taxes: "--s5", other: "--s6", profit: "--s7" };

  const rub = (n) => `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ").replace("-", "−")} ₽`;
  const pct = (n) => `${n.toFixed(1).replace(".", ",").replace("-", "−")}%`;

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function fill(fields) {
    for (const key of ALL_FIELDS) $(key).value = fields[key];
  }

  function readInput() {
    const v = {};
    for (const key of NUMBER_FIELDS) {
      // Пустое необязательное поле — ноль; цена и выкуп проверяются отдельно.
      const raw = $(key).value;
      v[key] = raw.trim() === "" && key !== "price" && key !== "buyout" ? 0 : U.parseNumber(raw);
      $(key).setAttribute("aria-invalid", String(!(v[key] >= 0)));
    }
    v.tax = $("tax").value;
    v.vat = Number($("vat").value);
    const rate = $("taxRate").value.trim() === "" ? (v.tax === "usn15" ? 15 : 6) : U.parseNumber($("taxRate").value);
    v.taxRateUsn6 = rate;
    v.taxRateUsn15 = rate;
    return v;
  }

  function renderBar(s) {
    const { price, profit } = s.result;
    const pieces = s.parts.filter((p) => p.value > 0);
    if (profit > 0) pieces.push({ key: "profit", label: "Прибыль", value: profit });
    $("bar").replaceChildren(...pieces.map((p) => {
      const seg = el("div", { className: "bar__seg" });
      seg.style.flexGrow = p.value;
      seg.style.flexBasis = 0;
      seg.style.background = `var(${COLORS[p.key]})`;
      seg.dataset.tip = `${p.label}: ${rub(p.value)} · ${pct(p.value / price * 100)}`;
      return seg;
    }));
    $("bar").setAttribute("aria-label", `Структура цены: ${pieces.map((p) => `${p.label} ${rub(p.value)}`).join(", ")}`);
    const over = profit < 0;
    $("bar-note").hidden = !over;
    if (over) $("bar-note").textContent = `Расходы больше цены на ${rub(-profit)}: полоса показывает только расходы.`;

    const rows = s.parts.filter((p) => p.value > 0).map((p) => el("tr", {},
      el("td", {}, el("span", { className: "name" }, dot(p.key), p.label)),
      el("td", { className: "r", textContent: rub(p.value) }),
      el("td", { className: "r", textContent: pct(p.value / price * 100) })));
    rows.push(el("tr", { className: "is-total" },
      el("td", {}, el("span", { className: "name" }, profit > 0 ? dot("profit") : "", profit < 0 ? "Убыток" : "Прибыль")),
      el("td", { className: "r", textContent: rub(profit) }),
      el("td", { className: "r", textContent: pct(s.margin) })));
    $("parts").replaceChildren(...rows);
  }

  function dot(key) {
    const d = el("span", { className: "dot" });
    d.style.background = `var(${COLORS[key]})`;
    return d;
  }

  function renderScenarios(s) {
    $("scenarios").replaceChildren(...s.scenarios.map((row, i) => el("tr", { className: i === 0 ? "is-hot" : "" },
      el("td", { textContent: row.label }),
      el("td", { className: "r", textContent: rub(row.price) }),
      el("td", { className: `r${row.profit < 0 ? " neg" : ""}`, textContent: rub(row.profit) }),
      el("td", { className: "r", textContent: pct(row.margin) }))));
  }

  function renderTarget(input) {
    const t = U.parseNumber($("target").value);
    if (!Number.isFinite(t)) { $("target-out").textContent = "Укажите маржу, например 20"; return; }
    const price = t >= 100 ? null : U.solvePrice(input, t);
    $("target-out").textContent = price === null
      ? `Маржа ${pct(t)} недостижима при этих ставках: процентные расходы съедают цену`
      : `Цена ${rub(price)} даст маржу ${pct(t)}`;
  }

  function saveToHash() {
    const params = new URLSearchParams();
    for (const key of ALL_FIELDS) params.set(key, $(key).value);
    // replaceState: цифры живут только в адресе этой вкладки и на сервер не уходят.
    history.replaceState(null, "", `#${params}`);
  }

  function render() {
    const input = readInput();
    const errors = U.validate(input);
    if ($("tax").value !== "none" && !(input.taxRateUsn6 >= 0 && input.taxRateUsn6 <= 100)) errors.push("Ставка налога должна быть от 0 до 100%.");
    $("rate-field").hidden = input.tax === "none";
    $("errors").hidden = !errors.length;
    $("errors").textContent = errors.join(" ");
    for (const id of ["main", "where", "price-for", "what-if"]) $(id).hidden = errors.length > 0;
    saveToHash();
    if (errors.length) return;

    const s = U.summary(input);
    const good = s.result.profit > 0;
    const zero = s.result.profit === 0;
    $("verdict").className = `verdict verdict--${good ? "good" : "bad"}`;
    $("verdict").textContent = good ? "✓ В прибыли" : zero ? "В ноль" : "! В убытке";
    $("profit").textContent = rub(s.result.profit);
    $("margin").textContent = pct(s.margin);
    $("roi").textContent = s.roi === null ? "—" : `${Math.round(s.roi)}%`.replace("-", "−");
    $("breakeven").textContent = s.breakeven === null ? "нет" : rub(s.breakeven);
    renderBar(s);
    renderTarget(input);
    renderScenarios(s);
  }

  function loadFromHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const out = { ...EXAMPLE };
    for (const key of ALL_FIELDS) if (params.has(key)) out[key] = params.get(key);
    if (![...$("tax").options].some((o) => o.value === out.tax)) out.tax = EXAMPLE.tax;
    if (![...$("vat").options].some((o) => o.value === out.vat)) out.vat = EXAMPLE.vat;
    return out;
  }

  // При смене режима меняется и обычная ставка, если её не правили руками.
  $("tax").addEventListener("change", () => {
    const rate = $("taxRate").value.trim();
    if ($("tax").value === "usn15" && (rate === "6" || rate === "")) $("taxRate").value = "15";
    if ($("tax").value === "usn6" && (rate === "15" || rate === "")) $("taxRate").value = "6";
    render();
  });
  $("form").addEventListener("input", render);
  $("form").addEventListener("submit", (e) => e.preventDefault());
  $("target").addEventListener("input", render);
  $("reset").addEventListener("click", () => { fill(EXAMPLE); render(); });
  $("copy").addEventListener("click", async () => {
    saveToHash();
    try {
      await navigator.clipboard.writeText(location.href);
      $("copy-note").textContent = "Ссылка скопирована. Цифры — в самой ссылке.";
    } catch (e) {
      $("copy-note").textContent = "Не удалось скопировать: возьмите адрес из строки браузера.";
    }
  });

  // Подсказка над частями полосы.
  const tooltip = $("tooltip");
  $("bar").addEventListener("mousemove", (e) => {
    const tip = e.target.dataset && e.target.dataset.tip;
    tooltip.hidden = !tip;
    if (!tip) return;
    tooltip.textContent = tip;
    const x = Math.min(e.clientX + 12, window.innerWidth - tooltip.offsetWidth - 8);
    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${e.clientY - 38}px`;
  });
  $("bar").addEventListener("mouseleave", () => { tooltip.hidden = true; });

  fill(loadFromHash());
  render();
})();
