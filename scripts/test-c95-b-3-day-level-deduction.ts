// PR c95-B-3 純関数テスト: day-level コンサル費控除 (water + 5月以降のみ)。
//
// 単独実行: npm run test:integration:c95-b-3-day-level-deduction (DB 不要、純関数)
//
// 検証範囲 (c95-B-3 の新規面):
//   1. computeKpiToday (kpiCompute.ts):
//      - water + 2026/5+ → 控除あり (profit と profitRate が下がる)
//      - water + 2026/4 以前 → 控除なし (yyyymm 境界ガード)
//      - electric/locksmith/road/detective → 控除なし (consultantFee で 0)
//   2. 日次の足し上げ = 月次 (整合検証、§3 の数式を 1 月分 entries で検証)
//   3. profitRate が「当日粗利 (控除後) ÷ 当日売上」で正しく出る
//
// 注: useFormCalculations は React hook で純関数テスト困難 → 同じ式 (f30 = sales - costs - fee)
//   なので kpiCompute テストでカバー。WaterDailyReportSection の inline 計算も同式。

import { computeKpiToday, computeKpiMonthly } from "../app/entry/components/dailyReport/kpiCompute";
import { emptyEntry, type DailyEntry } from "../app/lib/calculations";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`); failed++; }
}
function eq(name: string, actual: unknown, expected: unknown) {
  ok(`${name} (= ${JSON.stringify(expected)})`, actual === expected);
  if (actual !== expected) console.log(`     got ${JSON.stringify(actual)}`);
}
function approx(name: string, actual: number | null, expected: number, tol = 0.05) {
  const okay = actual !== null && Math.abs(actual - expected) <= tol;
  ok(`${name} ≈ ${expected}`, okay);
  if (!okay) console.log(`     got ${JSON.stringify(actual)}`);
}

// water 用最小入力: f1=4,897,700 (outsourced 3M + internal 1,897,700)、costs = 1M
function mkWaterEntry(date: string): DailyEntry {
  return {
    ...emptyEntry(date),
    outsourced_sales_revenue: 3000000,
    internal_staff_revenue: 1897700,        // sales = 4,897,700
    outsourced_response_count: 20,
    internal_staff_response_count: 4,       // count = 24
    total_labor_cost: 400000,
    material_cost: 300000,
    sales_outsourcing_cost: 100000,
    card_processing_fee: 50000,
    ad_cost: 150000,                         // costs = 1,000,000 → c93-1 式 profit = 3,897,700
  };
}

console.log("🧪 PR c95-B-3: day-level コンサル費控除 (water 7.7% + 5月以降ガード) 検証\n");

// ── 1. computeKpiToday: water + 2026/5 → 控除あり ─────────────────
console.log("📋 1. computeKpiToday: water + 2026-05 (yyyymm 202605、控除あり)");
const eWater05 = mkWaterEntry("2026-05-30");
const kWater05 = computeKpiToday("water", eWater05);
eq("sales", kWater05?.sales, 4897700);
eq("count", kWater05?.count, 24);
// c93-1 式: 4897700 - 1000000 = 3897700
// c95-B-3 控除: -4897700 * 0.077 = -377122.9
// 控除後 profit: 3897700 - 377122.9 = 3520577.1
approx("profit (控除後 = 3897700 - 4897700*0.077)", kWater05?.profit ?? null, 3520577.1, 0.5);
// profitRate = 3520577.1 / 4897700 * 100 ≈ 71.9% → Math.round(*10)/10 で 71.9
// 元: 3897700/4897700*100 = 79.6%、控除後 = 71.9% (約 7.7pt 低い)
approx("profitRate (控除後ベース)", kWater05?.profitRate ?? null, 71.9, 0.2);

// ── 2. water + 2026/4 → 控除なし (yyyymm 境界ガード) ────────────
console.log("\n📋 2. computeKpiToday: water + 2026-04 (yyyymm 202604、境界外、控除なし)");
const eWater04 = mkWaterEntry("2026-04-30");
const kWater04 = computeKpiToday("water", eWater04);
eq("sales", kWater04?.sales, 4897700);
// 控除なしで c93-1 式そのまま
eq("profit (控除なし = 3897700)", kWater04?.profit, 3897700);
approx("profitRate (控除なしベース ≈ 79.6%)", kWater04?.profitRate ?? null, 79.6, 0.1);

// ── 3. water + 2025-12 (前年、控除なし) ────────────────────────
console.log("\n📋 3. computeKpiToday: water + 2025-12 (前年、控除なし)");
const eWater2512 = mkWaterEntry("2025-12-15");
const kWater2512 = computeKpiToday("water", eWater2512);
eq("profit (2025/12 控除なし = 3897700)", kWater2512?.profit, 3897700);

// ── 4. electric + 2026/5 → 控除なし (water 専用) ───────────────
console.log("\n📋 4. computeKpiToday: electric + 2026-05 (water 専用機能、控除なし)");
const eElectric = mkWaterEntry("2026-05-30");
const kElectric = computeKpiToday("electric", eElectric);
eq("profit (electric 控除なし = 3897700)", kElectric?.profit, 3897700);

// ── 5. locksmith/road/detective: 別式 + 控除対象外 ─────────────
console.log("\n📋 5. computeKpiToday: 他業態 (water 以外) 5月以降でも控除なし");
const eLock = {
  ...emptyEntry("2026-05-30"),
  outsourced_sales_revenue: 1000000,
  locksmith_construction_cost: 200000,
  material_cost: 100000,
  ad_cost: 50000,
  locksmith_commission_fee: 30000,
  acquisition_count: 10,
};
const kLock = computeKpiToday("locksmith", eLock);
// 鍵粗利式: 1000000 - 200000 - 100000 - 50000 - 30000 = 620000
eq("locksmith profit (専用式、控除なし)", kLock?.profit, 620000);

// ── 6. 日次足し上げ = 月次 整合 (§3 の数式検証) ──────────────────
console.log("\n📋 6. 日次足し上げ = 月次 (water 3 日分 + 月次相当の集計を比較)");
const days = [mkWaterEntry("2026-05-10"), mkWaterEntry("2026-05-20"), mkWaterEntry("2026-05-30")];
// 各日: sales=4,897,700、profit (控除後) ≈ 3,520,577.1
// 3 日合計: sales=14,693,100、profit ≈ 10,561,731.3
const sumSales = days.reduce((s, d) => s + (computeKpiToday("water", d)?.sales ?? 0), 0);
const sumProfit = days.reduce((s, d) => s + (computeKpiToday("water", d)?.profit ?? 0), 0);
eq("3 日合計 sales = 14,693,100", sumSales, 14693100);
// 月次相当 (B-2 SQL 式): monthSales - monthCosts - monthSales * 0.077
const monthSales = 4897700 * 3;
const monthCosts = 1000000 * 3;
const monthProfit = monthSales - monthCosts - monthSales * 0.077;
approx("月次相当 profit (B-2 SQL 式)", monthProfit, 10561731.3, 0.5);
approx("日次足し上げ ≈ 月次", sumProfit, monthProfit, 0.5);

// ── 7. computeKpiMonthly は無変更 (summary 直読、B-2 で control 済) ─
console.log("\n📋 7. computeKpiMonthly: summary 直読 (B-3 で touch なし、無変動 regression)");
const summary = { total_revenue: 88857300, total_profit: 23618681, total_count: 623, unit_price: 142628 };
const mk = computeKpiMonthly(summary);
eq("monthly sales", mk.sales, 88857300);
eq("monthly profit (B-2 控除済値そのまま)", mk.profit, 23618681);

// ── 8. 売上 0 → 控除も 0 (異常値ガード) ───────────────────────
console.log("\n📋 8. water 売上 0 → 控除も 0、profit = -costs");
const eZero = { ...emptyEntry("2026-05-30"), total_labor_cost: 100000 };
const kZero = computeKpiToday("water", eZero);
eq("sales = 0", kZero?.sales, 0);
eq("profit = -costs (控除なし、consultantFee 異常値ガード)", kZero?.profit, -100000);
eq("profitRate = null (divide-by-zero)", kZero?.profitRate, null);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
