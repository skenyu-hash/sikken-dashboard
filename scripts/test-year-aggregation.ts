// 単独実行: npm run test:year-aggregation
// year-view スライス1: aggregateYearlyActuals / aggregateYearlyTargets の検算テスト。
//
// Gemini 独立レビュー (2026-06-20) で発見した致命的盲点の回帰封じ:
//   #2 損失消去 / #3 真の負値 / #4 率の総額再計算 / #5 スナップショット MAX 月 /
//   #6 件数 fallback / #7 コンサル費 1 回控除 / #8 BIGINT 文字列 / #1 4月以前ガード /
//   #9 elapsedCap / #10 日割り按分 / #11 目標ガード / #12 ペース vs 年間の二系統。

import { aggregateYearlyActuals, aggregateYearlyTargets } from "../app/lib/yearAggregation";
import { emptyTargets, type Targets } from "../app/lib/calculations";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; failures.push(`❌ ${msg}`); console.error(`❌ ${msg}`); }
}
function eq(actual: unknown, expected: unknown, msg: string) {
  assert(actual === expected, `${msg} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

const T = (fields: Partial<Targets>): Targets => ({ ...emptyTargets(), ...fields });

// ===== #1: 4月以前 (yyyymm < 202605) は合算に入らない =====
{
  const r = aggregateYearlyActuals([
    { category: "water", summary: { year: 2026, month: 4, total_revenue: 9_999_999, total_labor_cost: 0 } },
    { category: "water", summary: { year: 2026, month: 5, total_revenue: 1_000_000, total_labor_cost: 0 } },
  ]);
  eq(r.water?.total_revenue, 1_000_000, "#1 4月行は除外され5月のみ合算される");
}

// ===== #2 損失相殺 + #4 profit_rate 総額再計算 =====
{
  const r = aggregateYearlyActuals([
    // 5月: 売上50万 / 職人費100万 → 粗利 -50万
    { category: "water", summary: { year: 2026, month: 5, total_revenue: 500_000, total_labor_cost: 1_000_000 } },
    // 6月: 売上200万 / 職人費120万 → 粗利 +80万
    { category: "water", summary: { year: 2026, month: 6, total_revenue: 2_000_000, total_labor_cost: 1_200_000 } },
  ]);
  eq(r.water?.total_profit, 300_000, "#2 損失消去なし: YTD粗利 = +30万 (バグ時 +80万)");
  eq(r.water?.total_revenue, 2_500_000, "#2 売上合算 = 250万");
  eq(r.water?.profit_rate, 12.0, "#4 profit_rate = 30万/250万 = 12.0% (月率の和でない)");
}

// ===== #3: 全月赤字 → 真の負値を返す (0 底打ちしない) =====
{
  const r = aggregateYearlyActuals([
    { category: "water", summary: { year: 2026, month: 5, total_revenue: 100_000, total_labor_cost: 500_000 } },
  ]);
  eq(r.water?.total_profit, -400_000, "#3 赤字は真の負値 -40万 (0 でない)");
  eq(r.water?.profit_rate, -400.0, "#3 赤字粗利率も負値");
}

// ===== #5: スナップショット (vehicle_count) は最新月 (MAX) 採用、合算しない =====
{
  const r = aggregateYearlyActuals([
    { category: "water", summary: { year: 2026, month: 5, total_revenue: 1_000_000, vehicle_count: 10, trainee_count: 3 } },
    { category: "water", summary: { year: 2026, month: 6, total_revenue: 1_000_000, vehicle_count: 12, trainee_count: 4 } },
  ]);
  eq(r.water?.vehicle_count, 12, "#5 vehicle_count = MAX月(6月)の12 (合算22でない)");
  eq(r.water?.trainee_count, 4, "#5 trainee_count = MAX月の4");
}

// ===== #6: total_count=0 の業態は acquisition_count を実効件数に (PR #177) =====
{
  const r = aggregateYearlyActuals([
    { category: "locksmith", summary: { year: 2026, month: 5, total_revenue: 700_000, total_count: 0, acquisition_count: 7 } },
  ]);
  eq(r.locksmith?.total_count, 7, "#6 鍵: total_count=0 → acquisition_count=7 を採用");
  eq(r.locksmith?.unit_price, 100_000, "#6 客単価 = 70万/7 = 10万 (0除算でない)");
}

// ===== #7: water コンサル費は合算後に 1 回だけ控除 (二重控除なし) =====
{
  const r = aggregateYearlyActuals([
    { category: "water", summary: { year: 2026, month: 5, total_revenue: 1_000_000, consultant_fee: 50_000 } },
    { category: "water", summary: { year: 2026, month: 6, total_revenue: 1_000_000, consultant_fee: 50_000 } },
  ]);
  // 粗利 = 売上200万 - コンサル費10万 = 190万 (二重控除なら 180万)
  eq(r.water?.total_profit, 1_900_000, "#7 コンサル費 合算10万を1回控除 = 190万 (二重控除180万でない)");
}
// 非 water はコンサル費を控除しない
{
  const r = aggregateYearlyActuals([
    { category: "electric", summary: { year: 2026, month: 5, total_revenue: 1_000_000, consultant_fee: 50_000 } },
  ]);
  eq(r.electric?.total_profit, 1_000_000, "#7b 電気: consultant_fee があっても控除しない");
}

// ===== #8: BIGINT/NUMERIC が文字列で来ても Number 化 (連結しない) =====
{
  const r = aggregateYearlyActuals([
    { category: "water", summary: { year: "2026", month: "5", total_revenue: "1000000", total_labor_cost: "200000" } },
    { category: "water", summary: { year: "2026", month: "6", total_revenue: "1000000", total_labor_cost: "200000" } },
  ]);
  eq(r.water?.total_revenue, 2_000_000, "#8 文字列売上を数値合算 = 200万 (連結 '10000001000000' でない)");
  eq(typeof r.water?.total_revenue, "number", "#8 結果は number 型");
  eq(r.water?.total_profit, 1_600_000, "#8 粗利 = 200万 - 職人費40万 = 160万");
}

// ===== #9: elapsedCap (過去年閲覧は12、当年は当月) =====
{
  const rows = [5, 6, 7, 8].map((m) => ({ year: 2026, month: m, targets: T({ targetSales: 1000 }) })); // 1000万円=1000(man)
  // 過去年から2026を閲覧 → 全月経過済み
  const past = aggregateYearlyTargets(rows, { viewYear: 2026, currentYear: 2027, currentMonth: 3, asOfDay: 15, daysInMonth: 31 });
  eq(past.pacing.targetSales, 4000, "#9 過去年閲覧: elapsedCap=12 → 5-8月全て100% = 4000");
  // 当年閲覧 currentMonth=6 → 5月100%+6月按分、7・8月は未来で除外
  const cur = aggregateYearlyTargets(rows, { viewYear: 2026, currentYear: 2026, currentMonth: 6, asOfDay: 15, daysInMonth: 30 });
  eq(cur.pacing.targetSales, 1500, "#9 当年閲覧: 5月1000 + 6月(1000×15/30=500) = 1500 (7・8月除外)");
}

// ===== #10 日割り按分 + #12 ペース vs 年間の二系統 =====
{
  const rows = [
    { year: 2026, month: 5, targets: T({ targetSales: 2000 }) }, // 2000万
    { year: 2026, month: 6, targets: T({ targetSales: 3000 }) }, // 3000万
  ];
  const r = aggregateYearlyTargets(rows, { viewYear: 2026, currentYear: 2026, currentMonth: 6, asOfDay: 15, daysInMonth: 30 });
  eq(r.fullYear.targetSales, 5000, "#12 年間絶対額 = 2000+3000 = 5000 (按分なし)");
  eq(r.pacing.targetSales, 3500, "#10/#12 ペース = 5月2000 + 6月(3000×0.5=1500) = 3500");
}

// ===== #11: 目標も 202605 ガード (4月以前の目標は除外) =====
{
  const rows = [
    { year: 2026, month: 4, targets: T({ targetSales: 9999 }) }, // 除外されるべき
    { year: 2026, month: 5, targets: T({ targetSales: 1000 }) },
  ];
  const r = aggregateYearlyTargets(rows, { viewYear: 2026, currentYear: 2026, currentMonth: 5, asOfDay: 31, daysInMonth: 31 });
  eq(r.fullYear.targetSales, 1000, "#11 4月目標は年間絶対額から除外");
  eq(r.pacing.targetSales, 1000, "#11 4月目標はペースからも除外 (5月のみ、当月満日按分=100%)");
}

// ===== 派生値の再計算確認 (目標 CPA = 広告費/件数) =====
{
  const rows = [{ year: 2026, month: 5, targets: T({ targetAdCost: 1000, targetCount: 100 }) }];
  const r = aggregateYearlyTargets(rows, { viewYear: 2026, currentYear: 2026, currentMonth: 5, asOfDay: 31, daysInMonth: 31 });
  eq(r.fullYear.targetCpa, 10, "目標CPA = 広告費1000/件数100 = 10 (合算後に再計算)");
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`\n${failed} failures:\n${failures.join("\n")}`);
  process.exit(1);
}
process.exit(0);
