/*
 * Юнит-экономика товара на маркетплейсе — браузерная версия skills/unit-economics/calc.py.
 * Считает так же; tests/test_web.py сверяет обе версии на случайных данных.
 * Работает в браузере и в Node. Ничего никуда не отправляет.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.UnitEconomics = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULTS = {
    price: 0, cost: 0, commission: 0, logistics: 0, returnLogistics: 0, buyout: 100, storage: 0,
    acquiring: 0, ads: 0, adsPct: 0, other: 0, tax: "usn6", taxRateUsn6: 6, taxRateUsn15: 15, vat: 0,
  };

  function unitEconomics(input, price) {
    const a = { ...DEFAULTS, ...input };
    const buyout = a.buyout / 100;
    const vat = a.vat ? price * a.vat / (100 + a.vat) : 0;

    const commission = price * a.commission / 100;
    const acquiring = price * a.acquiring / 100;
    // На каждый выкуп приходится 1/buyout заказов; невыкупленные едут туда и обратно.
    const logistics = (a.logistics + (1 - buyout) * a.returnLogistics) / buyout;
    const ads = a.ads + price * a.adsPct / 100;
    const expenses = a.cost + commission + acquiring + logistics + a.storage + ads + a.other;

    const baseIncome = price - vat;
    let tax = 0;
    // Доход по УСН — цена продажи покупателю, а не сумма к перечислению.
    if (a.tax === "usn6") tax = baseIncome * a.taxRateUsn6 / 100;
    else if (a.tax === "usn15") tax = Math.max(baseIncome - expenses, 0) * a.taxRateUsn15 / 100;

    return {
      price, vat, cost: a.cost, commission, acquiring, logistics, storage: a.storage, ads, other: a.other, tax,
      profit: price - vat - expenses - tax,
    };
  }

  const margin = (r) => r.profit / r.price * 100;

  // Минимальная цена, при которой маржа не ниже target (%); null — недостижимо.
  function solvePrice(input, target) {
    const a = { ...DEFAULTS, ...input };
    let lo = 0.01, hi = Math.max(a.price, a.cost) * 20;
    if (margin(unitEconomics(a, hi)) < target) return null;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (margin(unitEconomics(a, mid)) >= target) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  // Что не даёт посчитать; пустой список — всё в порядке.
  function validate(a) {
    const errors = [];
    if (!(a.price > 0)) errors.push("Цена продажи должна быть больше нуля.");
    if (!(a.buyout > 0 && a.buyout <= 100)) errors.push("Процент выкупа должен быть больше 0 и не больше 100.");
    for (const key of ["cost", "commission", "logistics", "returnLogistics", "storage", "acquiring", "ads", "adsPct", "other", "vat"]) {
      if (!(a[key] >= 0)) errors.push("Суммы и проценты не могут быть отрицательными или пустыми.");
    }
    for (const key of ["commission", "acquiring", "adsPct"]) {
      if (a[key] > 100) errors.push("Комиссия, эквайринг и ДРР не могут быть больше 100%.");
    }
    return [...new Set(errors)];
  }

  // Части цены для графика: сумма всех частей без прибыли — расходы на единицу.
  function parts(r) {
    return [
      { key: "cost", label: "Себестоимость", value: r.cost },
      { key: "marketplace", label: "Комиссия и эквайринг", value: r.commission + r.acquiring },
      { key: "logistics", label: "Логистика и хранение", value: r.logistics + r.storage },
      { key: "ads", label: "Реклама", value: r.ads },
      { key: "taxes", label: "Налог и НДС", value: r.tax + r.vat },
      { key: "other", label: "Прочее", value: r.other },
    ];
  }

  // Что будет, если цена, выкуп или реклама изменятся.
  function scenarios(input) {
    const a = { ...DEFAULTS, ...input };
    const row = (label, change, price = a.price) => {
      const r = unitEconomics({ ...a, ...change }, price);
      return { label, price, profit: r.profit, margin: margin(r) };
    };
    const out = [row("Как сейчас", {})];
    for (const d of [10, 15, 25]) out.push(row(`Скидка ${d}%`, {}, a.price * (1 - d / 100)));
    for (const b of [70, 50]) if (b < a.buyout) out.push(row(`Выкуп ${b}%`, { buyout: b }));
    out.push(row("Реклама +5% от цены", { adsPct: a.adsPct + 5 }));
    return out;
  }

  function summary(input, targetMargin) {
    const a = { ...DEFAULTS, ...input };
    const result = unitEconomics(a, a.price);
    return {
      result,
      parts: parts(result),
      margin: margin(result),
      roi: a.cost ? result.profit / a.cost * 100 : null,
      breakeven: solvePrice(a, 0),
      target: targetMargin == null ? null : solvePrice(a, targetMargin),
      scenarios: scenarios(a),
    };
  }

  // «1 990,50», «1990.5», «8 %» → число; пустая строка и мусор → NaN.
  function parseNumber(s) {
    const t = String(s).replace(/[\s  ₽%]/g, "").replace(",", ".");
    return t === "" ? NaN : Number(t);
  }

  return { DEFAULTS, unitEconomics, margin, solvePrice, validate, parts, scenarios, summary, parseNumber };
});
