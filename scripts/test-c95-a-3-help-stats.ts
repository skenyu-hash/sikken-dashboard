// PR c95-A-3 純関数テスト: DailyReportModal 用 HELP 派生計算 + 閾値判定 (helpStats.ts)。
//
// 単独実行: npm run test:integration:c95-a-3-help-stats (DB 不要、純関数)
//
// 検証範囲 (c95-A-3 新規面):
//   1. 閾値定数 (G14): HELP_UNIT_PRICE_THRESHOLD / CLOSE_RATE / TAKEOVER_TOTAL / CONSTRUCTION
//   2. aggregateHelpStaffByMonth: entries[] の help_staff を staff_name で SUM + asOfDay フィルタ
//   3. helpUnitPriceFromAggregate / closeRate: 件数 0 で null (divide-by-zero ガード、赤にしない)
//   4. takeoverRateByTotal / takeoverRateByConstruction / helpSalesRatio: 分母 0 で null
//   5. evaluateThresholds: 4 booleans、null inputs は false、境界値 ≤ で alert

import {
  HELP_UNIT_PRICE_THRESHOLD,
  HELP_CLOSE_RATE_THRESHOLD,
  HELP_TAKEOVER_TOTAL_THRESHOLD,
  HELP_TAKEOVER_CONSTRUCTION_THRESHOLD,
  aggregateHelpStaffByMonth,
  helpUnitPriceFromAggregate,
  closeRate,
  takeoverRateByTotal,
  takeoverRateByConstruction,
  helpSalesRatio,
  evaluateThresholds,
} from "../app/entry/lib/helpStats";
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
function eqNull(name: string, actual: unknown) {
  ok(`${name} === null`, actual === null);
  if (actual !== null) console.log(`     got ${JSON.stringify(actual)}`);
}
function approx(name: string, actual: number | null, expected: number, tol = 0.001) {
  const ok_ = actual !== null && Math.abs(actual - expected) <= tol;
  ok(`${name} ≈ ${expected}`, ok_);
  if (!ok_) console.log(`     got ${JSON.stringify(actual)}`);
}

// 各 entry に help_staff を付けた最小 DailyEntry を作る
function mkEntry(day: number, staff: Array<{ staff_name: string; help_sales: number; help_count: number; help_close_count: number }>): DailyEntry {
  const date = `2026-05-${String(day).padStart(2, "0")}`;
  return { ...emptyEntry(date), help_staff: staff };
}

console.log("🧪 PR c95-A-3: helpStats 純関数検証\n");

// ── 1. 閾値定数 (G14) ───────────────────────────────
console.log("📋 1. 閾値定数 (G14: const 公開)");
eq("HELP_UNIT_PRICE_THRESHOLD", HELP_UNIT_PRICE_THRESHOLD, 650000);
eq("HELP_CLOSE_RATE_THRESHOLD", HELP_CLOSE_RATE_THRESHOLD, 70);
eq("HELP_TAKEOVER_TOTAL_THRESHOLD", HELP_TAKEOVER_TOTAL_THRESHOLD, 5);
eq("HELP_TAKEOVER_CONSTRUCTION_THRESHOLD", HELP_TAKEOVER_CONSTRUCTION_THRESHOLD, 30);

// ── 2. aggregateHelpStaffByMonth (staff_name groupBy + asOfDay フィルタ) ──
console.log("\n📋 2. aggregateHelpStaffByMonth");
const entries1: DailyEntry[] = [
  mkEntry(5,  [{ staff_name: "田中", help_sales: 100, help_count: 1, help_close_count: 1 }]),
  mkEntry(15, [
    { staff_name: "田中", help_sales: 200, help_count: 2, help_close_count: 1 },
    { staff_name: "佐藤", help_sales: 50,  help_count: 1, help_close_count: 0 },
  ]),
  mkEntry(25, [{ staff_name: "佐藤", help_sales: 80, help_count: 1, help_close_count: 1 }]),
];

const aggFull = aggregateHelpStaffByMonth(entries1, 2026, 5, 31);
eq("担当者数 (田中 + 佐藤)", aggFull.length, 2);
const tanaka = aggFull.find((s) => s.staff_name === "田中");
const sato = aggFull.find((s) => s.staff_name === "佐藤");
eq("田中 sales (100 + 200)", tanaka?.help_sales, 300);
eq("田中 count (1 + 2)", tanaka?.help_count, 3);
eq("田中 close (1 + 1)", tanaka?.help_close_count, 2);
eq("佐藤 sales (50 + 80)", sato?.help_sales, 130);
eq("佐藤 count (1 + 1)", sato?.help_count, 2);

// asOfDay フィルタ: 上旬 (1..10) のみ → 田中 day5 のみ
const aggUpper = aggregateHelpStaffByMonth(entries1, 2026, 5, 10);
eq("asOfDay=10 で 担当者数 (田中 day5 のみ)", aggUpper.length, 1);
eq("田中 sales (day 5 のみ = 100)", aggUpper[0]?.help_sales, 100);

// 空入力
eq("空 entries → []", aggregateHelpStaffByMonth([], 2026, 5, 31).length, 0);

// help_staff 空配列 entry → スキップ
const entryNoHelp = mkEntry(10, []);
eq("help_staff 空配列で 0", aggregateHelpStaffByMonth([entryNoHelp], 2026, 5, 31).length, 0);

// ── 3. helpUnitPriceFromAggregate (count===0 → null) ─────
console.log("\n📋 3. helpUnitPriceFromAggregate (件数 0 で null)");
approx("100000 / 2", helpUnitPriceFromAggregate(100000, 2), 50000);
eqNull("count=0 (赤にしない)", helpUnitPriceFromAggregate(100, 0));

// ── 4. closeRate (count===0 → null) ──────────────────────
console.log("\n📋 4. closeRate");
approx("3 / 4 * 100", closeRate(3, 4), 75);
eqNull("count=0", closeRate(0, 0));
approx("0 / 5 * 100", closeRate(0, 5), 0); // 件数あり成約 0 → 0% (alert 対象)

// ── 5. takeoverRate / helpSalesRatio (分母 0 → null) ────
console.log("\n📋 5. takeoverRate / helpSalesRatio");
approx("takeoverByTotal 3/100", takeoverRateByTotal(3, 100), 3);
eqNull("takeoverByTotal total=0", takeoverRateByTotal(3, 0));
approx("takeoverByConstruction 9/30", takeoverRateByConstruction(9, 30), 30);
eqNull("takeoverByConstruction construction=0", takeoverRateByConstruction(3, 0));
approx("helpSalesRatio 100/1000", helpSalesRatio(100, 1000), 10);
eqNull("helpSalesRatio revenue=0", helpSalesRatio(100, 0));

// ── 6. evaluateThresholds (≤ で alert、null は false) ─────
console.log("\n📋 6. evaluateThresholds");
const aboveAll = evaluateThresholds(700000, 80, 6, 35);
ok("全て閾値超 → all false",
  !aboveAll.unitPriceAlert && !aboveAll.closeRateAlert
  && !aboveAll.takeoverTotalAlert && !aboveAll.takeoverConstructionAlert);

const boundary = evaluateThresholds(650000, 70, 5, 30);
ok("境界値ちょうど → all true (≤ なので alert)",
  boundary.unitPriceAlert && boundary.closeRateAlert
  && boundary.takeoverTotalAlert && boundary.takeoverConstructionAlert);

const below = evaluateThresholds(640000, 69, 4, 29);
ok("全て閾値未満 → all true",
  below.unitPriceAlert && below.closeRateAlert
  && below.takeoverTotalAlert && below.takeoverConstructionAlert);

const nullAll = evaluateThresholds(null, null, null, null);
ok("全 null → all false (赤にしない、spec)",
  !nullAll.unitPriceAlert && !nullAll.closeRateAlert
  && !nullAll.takeoverTotalAlert && !nullAll.takeoverConstructionAlert);

// 混在ケース: unitPrice null + closeRate 低 → unitPriceAlert false / closeRateAlert true
const mixed = evaluateThresholds(null, 50, null, null);
ok("混在: unitPrice=null は false、closeRate=50≤70 は true",
  !mixed.unitPriceAlert && mixed.closeRateAlert
  && !mixed.takeoverTotalAlert && !mixed.takeoverConstructionAlert);

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);
