// PR c95-B-3 → c95-D-5 純関数テスト: day-level コンサル費控除 (water + 5月以降 + 手入力)。
//
// 単独実行: npm run test:integration:c95-b-3-day-level-deduction (DB 不要、純関数)
//
// c95-D-5 (slice 5) で day-level 控除を「自動 7.7%」から「手入力 e.consultant_fee 直接控除」
// に切替済。本テストも新仕様に合わせて期待値を更新:
//   1. computeKpiToday (kpiCompute.ts):
//      - water + 2026/5+ + e.consultant_fee 指定 → 直接控除
//      - water + 2026/5+ + e.consultant_fee 未指定 (=0) → 控除なし
//      - water + 2026/4 以前 → e.consultant_fee 指定でも月境界ガードで控除なし (絶対不変)
//      - electric/locksmith/road/detective → 控除なし (water 限定ガード)
//   2. 日次の足し上げ = 月次 (整合検証、手入力 SUM ベース)
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
//   consultant_fee は任意 (デフォルト 0、c95-D-5 仕様)
function mkWaterEntry(date: string, consultantFee = 0): DailyEntry {
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
    ad_cost: 150000,                         // costs = 1,000,000 → 旧 c93-1 式 profit = 3,897,700
    consultant_fee: consultantFee,           // c95-D-5: 手入力ベース
  };
}

console.log("🧪 PR c95-D-5: day-level コンサル費控除 (手入力ベース + water/月境界ガード) 検証\n");

// ── 1. computeKpiToday: water + 2026/5 + 手入力 → 直接控除 ─────────────
console.log("📋 1. computeKpiToday: water + 2026-05 + consultant_fee=377123 (手入力控除あり)");
const eWater05 = mkWaterEntry("2026-05-30", 377123);
const kWater05 = computeKpiToday("water", eWater05);
eq("sales", kWater05?.sales, 4897700);
eq("count", kWater05?.count, 24);
// c93-1 式: 4897700 - 1000000 = 3897700
// c95-D-5 控除: -377,123 (手入力)
// 控除後 profit: 3897700 - 377123 = 3520577
eq("profit (控除後 = 3897700 - 377123)", kWater05?.profit, 3520577);
// profitRate = 3520577 / 4897700 * 100 ≈ 71.87% → Math.round(*10)/10 で 71.9
approx("profitRate (控除後ベース)", kWater05?.profitRate ?? null, 71.9, 0.2);

// ── 1b. computeKpiToday: water + 2026/5 + consultant_fee=0 → 控除なし ──
console.log("\n📋 1b. computeKpiToday: water + 2026-05 + consultant_fee=0 (手入力未入力で控除 0)");
const eWater05Zero = mkWaterEntry("2026-05-30", 0);
const kWater05Zero = computeKpiToday("water", eWater05Zero);
eq("profit (consultant_fee=0 → 控除 0、profit = 3897700)", kWater05Zero?.profit, 3897700);
approx("profitRate (控除なしベース ≈ 79.6%)", kWater05Zero?.profitRate ?? null, 79.6, 0.1);

// ── 2. water + 2026/4 → 手入力指定でも月境界ガードで控除なし (絶対不変) ─
console.log("\n📋 2. computeKpiToday: water + 2026-04 + consultant_fee=9999999 (境界外、ガード発火)");
const eWater04 = mkWaterEntry("2026-04-30", 9999999);
const kWater04 = computeKpiToday("water", eWater04);
eq("sales", kWater04?.sales, 4897700);
eq("profit (月境界ガード発火、手入力無視 = 3897700)", kWater04?.profit, 3897700);
approx("profitRate (控除なしベース ≈ 79.6%)", kWater04?.profitRate ?? null, 79.6, 0.1);

// ── 3. water + 2025-12 (前年、ガード発火) ────────────────────────
console.log("\n📋 3. computeKpiToday: water + 2025-12 + 手入力 9999999 (前年、ガード)");
const eWater2512 = mkWaterEntry("2025-12-15", 9999999);
const kWater2512 = computeKpiToday("water", eWater2512);
eq("profit (2025/12 ガード、手入力無視 = 3897700)", kWater2512?.profit, 3897700);

// ── 4. electric + 2026/5 + 手入力 → 控除なし (water 限定ガード) ───────
console.log("\n📋 4. computeKpiToday: electric + 2026-05 + 手入力 → water 限定ガードで控除なし");
const eElectric = mkWaterEntry("2026-05-30", 9999999);
const kElectric = computeKpiToday("electric", eElectric);
eq("profit (electric 控除なし = 3897700、手入力無視)", kElectric?.profit, 3897700);

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
  consultant_fee: 9999999, // 鍵には影響しない
};
const kLock = computeKpiToday("locksmith", eLock);
// 鍵粗利式: 1000000 - 200000 - 100000 - 50000 - 30000 = 620000
eq("locksmith profit (専用式、控除なし)", kLock?.profit, 620000);

// ── 6. 日次足し上げ = 月次 整合 (手入力 SUM ベース) ─────────────
console.log("\n📋 6. 日次足し上げ = 月次 (water 3 日分、各日 consultant_fee=100000 で SUM 整合)");
const days = [
  mkWaterEntry("2026-05-10", 100000),
  mkWaterEntry("2026-05-20", 100000),
  mkWaterEntry("2026-05-30", 100000),
];
// 各日: sales=4,897,700、profit (控除後) = 3,797,700 (= 3897700 - 100000)
// 3 日合計: sales=14,693,100、profit=11,393,100、controle sum=300,000
const sumSales = days.reduce((s, d) => s + (computeKpiToday("water", d)?.sales ?? 0), 0);
const sumProfit = days.reduce((s, d) => s + (computeKpiToday("water", d)?.profit ?? 0), 0);
eq("3 日合計 sales = 14,693,100", sumSales, 14693100);
// 月次相当 (D-4 SQL 式): monthSales - monthCosts - SUM(consultant_fee)
const monthSales = 4897700 * 3;
const monthCosts = 1000000 * 3;
const monthCfSum = 100000 * 3;
const monthProfit = monthSales - monthCosts - monthCfSum; // = 11,393,100
eq("月次相当 profit (D-4 SQL 式: revenue - costs - SUM(cf))", monthProfit, 11393100);
eq("日次足し上げ = 月次 (整数一致)", sumProfit, monthProfit);

// ── 7. computeKpiMonthly は無変更 (summary 直読、D-4 で aggregation 経由切替済) ─
console.log("\n📋 7. computeKpiMonthly: summary 直読 (D-5 で touch なし、無変動 regression)");
const summary = { total_revenue: 88857300, total_profit: 23618681, total_count: 623, unit_price: 142628 };
const mk = computeKpiMonthly(summary);
eq("monthly sales", mk.sales, 88857300);
eq("monthly profit (aggregation 経由保存値そのまま)", mk.profit, 23618681);

// ── 8. 売上 0 → 控除も 0 (異常値ガード) ───────────────────────
console.log("\n📋 8. water 売上 0 + consultant_fee=0 → profit = -costs");
const eZero = { ...emptyEntry("2026-05-30"), total_labor_cost: 100000 };
const kZero = computeKpiToday("water", eZero);
eq("sales = 0", kZero?.sales, 0);
eq("profit = -costs (控除 0、consultant_fee 未指定)", kZero?.profit, -100000);
eq("profitRate = null (divide-by-zero)", kZero?.profitRate, null);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
