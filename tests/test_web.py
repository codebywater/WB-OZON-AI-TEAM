"""Тесты веб-калькулятора docs/: те же числа, что у calc.py, страница не ходит в сеть."""
import importlib.util
import json
import random
import re
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
spec = importlib.util.spec_from_file_location("calc", ROOT / "skills" / "unit-economics" / "calc.py")
calc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(calc)

NODE = """
const U = require(process.argv[1]);
const cases = JSON.parse(require("fs").readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(cases.map(({ input, target }) => {
  const r = U.unitEconomics(input, input.price);
  return { profit: r.profit, tax: r.tax, vat: r.vat, logistics: r.logistics, margin: U.margin(r),
           breakeven: U.solvePrice(input, 0), target: U.solvePrice(input, target) };
})));
"""


def random_case(rng):
    return {
        "price": round(rng.uniform(50, 20000), 2), "cost": round(rng.uniform(0, 15000), 2),
        "commission": round(rng.uniform(0, 45), 1), "logistics": round(rng.uniform(0, 500), 1),
        "returnLogistics": round(rng.uniform(0, 300), 1), "buyout": round(rng.uniform(5, 100), 1),
        "storage": round(rng.uniform(0, 100), 1), "acquiring": rng.choice([0, 1.5, 2.5]),
        "ads": rng.choice([0, 25, 120]), "adsPct": round(rng.uniform(0, 30), 1), "other": rng.choice([0, 15, 60]),
        "tax": rng.choice(["usn6", "usn15", "none"]), "taxRateUsn6": rng.choice([6, 4, 1]),
        "taxRateUsn15": rng.choice([15, 10, 5]), "vat": rng.choice([0, 5, 7, 22]),
    }


def to_args(c):
    return calc.build_parser().parse_args([
        "--price", str(c["price"]), "--cost", str(c["cost"]), "--commission", str(c["commission"]),
        "--logistics", str(c["logistics"]), "--return-logistics", str(c["returnLogistics"]),
        "--buyout", str(c["buyout"]), "--storage", str(c["storage"]), "--acquiring", str(c["acquiring"]),
        "--ads", str(c["ads"]), "--ads-pct", str(c["adsPct"]), "--other", str(c["other"]), "--tax", c["tax"],
        "--tax-rate-usn6", str(c["taxRateUsn6"]), "--tax-rate-usn15", str(c["taxRateUsn15"]), "--vat", str(c["vat"]),
    ])


@unittest.skipUnless(shutil.which("node"), "нужен Node.js")
class ParityTest(unittest.TestCase):
    def run_js(self, cases):
        out = subprocess.run(["node", "-e", NODE, str(DOCS / "unit.js")], input=json.dumps(cases),
                             capture_output=True, text=True, check=True)
        return json.loads(out.stdout)

    def test_page_counts_like_calc_py(self):
        rng = random.Random(20261102)
        cases = [{"input": random_case(rng), "target": rng.choice([0, 10, 20, 35, 60])} for _ in range(500)]
        for case, js in zip(cases, self.run_js(cases)):
            args = to_args(case["input"])
            r = calc.unit_economics(args, args.price)
            py = {"profit": r["Прибыль"], "tax": r["Налог"], "vat": r["НДС"],
                  "logistics": r["Логистика на выкуп (с учётом невыкупов)"], "margin": calc.margin(r),
                  "breakeven": calc.solve_price(args, 0), "target": calc.solve_price(args, case["target"])}
            for key, value in py.items():
                with self.subTest(key=key, case=case):
                    if value is None:
                        self.assertIsNone(js[key])
                    else:
                        self.assertAlmostEqual(js[key], value, places=6)

    def test_readme_example(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("Прибыль с единицы: 447 ₽ · маржа 22,5% · ROI 69%", readme)
        code = """
const U = require(process.argv[1]);
const s = U.summary({ price: 1990, cost: 650, commission: 24.5, logistics: 90, returnLogistics: 50,
  buyout: 85, storage: 12, adsPct: 8, tax: "usn6" });
const by = Object.fromEntries(s.scenarios.map((x) => [x.label, Math.round(x.profit)]));
console.log(JSON.stringify([Math.round(s.result.profit), +s.margin.toFixed(1), Math.round(s.roi),
  Math.round(s.breakeven), by["Выкуп 70%"], by["Скидка 15%"]]));
"""
        out = subprocess.run(["node", "-e", code, str(DOCS / "unit.js")], capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(out.stdout), [447, 22.5, 69, 1263, 412, 264])

    def test_validate_and_parse_number(self):
        code = """
const U = require(process.argv[1]);
console.log(JSON.stringify({
  nums: ["1 990,50", "1990.5", "8 %", "12 ₽", "", "abc"].map((s) => { const n = U.parseNumber(s); return Number.isNaN(n) ? null : n; }),
  ok: U.validate({ price: 100, buyout: 85, cost: 0, commission: 0, logistics: 0, returnLogistics: 0, storage: 0, acquiring: 0, ads: 0, adsPct: 0, other: 0, vat: 0 }).length,
  noPrice: U.validate({ price: 0, buyout: 85 }).length > 0,
  badBuyout: U.validate({ price: 1, buyout: 0 }).some((e) => e.includes("выкупа")),
  badPct: U.validate({ price: 1, buyout: 85, cost: 0, commission: 1990.5, logistics: 0, returnLogistics: 0, storage: 0, acquiring: 0, ads: 0, adsPct: 0, other: 0, vat: 0 }).some((e) => e.includes("100%")),
}));
"""
        out = subprocess.run(["node", "-e", code, str(DOCS / "unit.js")], capture_output=True, text=True, check=True)
        data = json.loads(out.stdout)
        self.assertEqual(data["nums"], [1990.5, 1990.5, 8, 12, None, None])
        self.assertEqual(data["ok"], 0)
        self.assertTrue(data["noPrice"] and data["badBuyout"] and data["badPct"])


class PrivacyTest(unittest.TestCase):
    def setUp(self):
        self.html = (DOCS / "index.html").read_text(encoding="utf-8")

    def test_csp_forbids_network(self):
        csp = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', self.html).group(1)
        for rule in ("default-src 'none'", "connect-src 'none'", "form-action 'none'", "script-src 'self'"):
            self.assertIn(rule, csp)

    def test_scripts_are_local(self):
        sources = re.findall(r'<script[^>]*src="([^"]+)"', self.html)
        self.assertEqual(sources, ["unit.js", "app.js"])
        for src in sources:
            self.assertTrue((DOCS / src).is_file())

    def test_no_network_or_html_injection_in_code(self):
        for name in ("unit.js", "app.js"):
            code = (DOCS / name).read_text(encoding="utf-8")
            with self.subTest(file=name):
                self.assertNotRegex(code, r"\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|innerHTML")


if __name__ == "__main__":
    unittest.main()
