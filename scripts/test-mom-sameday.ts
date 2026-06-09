/**
 * 前月同日比機能の純関数テスト
 * テスト対象: filterEntriesByDay / aggregatePrevSameDay / momLabel
 */
import {
  filterEntriesByDay,
  aggregatePrevSameDay,
  momLabel,
  type DailyEntry,
} from "../app/lib/calculations";

let passed = 0;
let failed = 0;

function assert(desc: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ ${desc}`);
    console.error(`     expected: ${JSON.stringify(expected)}`);
    console.error(`     actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ===== filterEntriesByDay =====
console.log("\n--- filterEntriesByDay ---");

const makeEntry = (date: string, rev: number = 0): DailyEntry => ({
  date,
  totalCount: 0, constructionCount: 0,
  selfRevenue: 0, selfProfit: 0, selfCount: 0,
  newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
  addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
  outsourced_sales_revenue: rev,
  internal_staff_revenue: 0,
});

const entries = [
  makeEntry("2026-05-01", 100),
  makeEntry("2026-05-05", 200),
  makeEntry("2026-05-09", 300),
  makeEntry("2026-05-10", 400),
  makeEntry("2026-05-15", 500),
];

assert(
  "maxDay=9 → day≤9 の 3 件のみ返す",
  filterEntriesByDay(entries, 9).map(e => e.date),
  ["2026-05-01", "2026-05-05", "2026-05-09"]
);
assert(
  "maxDay=10 → 4 件",
  filterEntriesByDay(entries, 10).length,
  4
);
assert(
  "maxDay=1 → day=1 のみ",
  filterEntriesByDay(entries, 1).length,
  1
);
assert(
  "maxDay=31 → 全件",
  filterEntriesByDay(entries, 31).length,
  5
);
assert(
  "空配列 → 空配列",
  filterEntriesByDay([], 9).length,
  0
);

// ===== aggregatePrevSameDay =====
console.log("\n--- aggregatePrevSameDay ---");

const waterEntries: DailyEntry[] = [
  {
    date: "2026-05-01",
    totalCount: 0, constructionCount: 0,
    selfRevenue: 0, selfProfit: 0, selfCount: 0,
    newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
    addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
    outsourced_sales_revenue: 1_000_000,
    internal_staff_revenue:    500_000,
    total_labor_cost:          300_000,
    material_cost:              50_000,
    ad_cost:                   100_000,
    sales_outsourcing_cost:     20_000,
    card_processing_fee:        10_000,
    consultant_fee:             80_000,
    outsourced_response_count:       5,
    internal_staff_response_count:   2,
    call_count:                     20,
    acquisition_count:               7,
    help_revenue:               50_000,
    help_count:                      2,
    repeat_count:                    3,
    revisit_count:                   1,
    review_count:                    2,
  },
];

// water 2026/05 → consultant_fee を控除
const waterResult = aggregatePrevSameDay(waterEntries, "water", 2026, 5);
assert("water: total_revenue = 1500000", waterResult.total_revenue, 1_500_000);
assert("water: total_count = 7", waterResult.total_count, 7);
assert("water: ad_cost = 100000", waterResult.ad_cost, 100_000);
assert("water: consultant_fee = 80000", waterResult.consultant_fee, 80_000);
// profit = 1500000 - 300000 - 50000 - 100000 - 20000 - 10000 - 80000 = 940000
assert("water ≥202605: total_profit (consultant_fee 控除済)", waterResult.total_profit, 940_000);
assert("water: call_count = 20", waterResult.call_count, 20);
assert("water: help_revenue = 50000", waterResult.help_revenue, 50_000);
assert("water: repeat_count = 3", waterResult.repeat_count, 3);

// water 2026/04 → consultant_fee 控除なし
const waterResultApr = aggregatePrevSameDay(waterEntries, "water", 2026, 4);
// profit = 1500000 - 300000 - 50000 - 100000 - 20000 - 10000 = 1020000 (控除なし)
assert("water <202605: total_profit (consultant_fee 控除なし)", waterResultApr.total_profit, 1_020_000);

// locksmith profit formula
const locksmithEntries: DailyEntry[] = [
  {
    date: "2026-05-01",
    totalCount: 0, constructionCount: 0,
    selfRevenue: 0, selfProfit: 0, selfCount: 0,
    newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
    addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
    outsourced_sales_revenue: 2_000_000,
    internal_staff_revenue:           0,
    locksmith_construction_cost:  800_000,
    material_cost:                 50_000,
    ad_cost:                      200_000,
    locksmith_commission_fee:      100_000,
    outsourced_response_count:         10,
    internal_staff_response_count:      0,
    locksmith_repeat_count:             3,
    locksmith_revisit_count:            2,
  },
];
const lockResult = aggregatePrevSameDay(locksmithEntries, "locksmith", 2026, 5);
// profit = 2000000 - 800000 - 50000 - 200000 - 100000 = 850000
assert("locksmith: total_revenue = 2000000", lockResult.total_revenue, 2_000_000);
assert("locksmith: profit = 850000 (locksmith formula)", lockResult.total_profit, 850_000);
assert("locksmith: locksmith_repeat_count = 3", lockResult.locksmith_repeat_count, 3);
assert("locksmith: locksmith_revisit_count = 2", lockResult.locksmith_revisit_count, 2);

// 空配列 → ゼロ埋め
const emptyResult = aggregatePrevSameDay([], "water", 2026, 5);
assert("空配列 → total_revenue = 0", emptyResult.total_revenue, 0);
assert("空配列 → total_profit = 0", emptyResult.total_profit, 0);

// ===== momLabel =====
console.log("\n--- momLabel ---");

// prev=0 → null
assert("prev=0 → null (yen)", momLabel(100, 0, "yen"), null);
assert("prev=0 → null (count)", momLabel(5, 0, "count"), null);
assert("prev=0 → null (pct)", momLabel(50, 0, "pct"), null);

// yen: 10000 以上の差 → 万円表示
assert("yen +増加 (万円)", momLabel(1_200_000, 1_000_000, "yen"), "↑+20% (+¥20万)");
assert("yen -減少 (万円)", momLabel(800_000, 1_000_000, "yen"), "↓-20% (-¥20万)");
// yen: 差が 10000 未満 → 円表示
assert("yen +増加 (円)", momLabel(5000, 4000, "yen"), "↑+25% (+¥1,000)");
// count
assert("count +増加", momLabel(22, 20, "count"), "↑+10% (+2件)");
assert("count -減少", momLabel(18, 20, "count"), "↓-10% (-2件)");
// pct: percentage point
assert("pct +増加", momLabel(32.5, 30, "pct"), "+2.5pt");
assert("pct -減少", momLabel(27.5, 30, "pct"), "-2.5pt");
// 変化なし
assert("yen 変化なし (0%)", momLabel(1_000_000, 1_000_000, "yen"), "↑+0% (+¥0)");

// ===== 結果 =====
console.log(`\n${"=".repeat(40)}`);
if (failed === 0) {
  console.log(`✅ ${passed}/${passed + failed} passed`);
} else {
  console.error(`❌ ${failed} failed, ${passed} passed`);
  process.exit(1);
}
