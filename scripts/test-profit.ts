// 単独実行: npm run test:profit
// PR #51.2 hotfix: resolveTotalProfit のリグレッション防止用テーブル駆動テスト。
//
// 目的:
//   monthly_summaries.total_profit = 0 の legacy 行に対して、業態別の構成要素から
//   粗利を再計算するフォールバックロジックを検証。
//   特に kansai/water/2026/5 で発覚した「total_profit=0、構成要素あり」のケースを
//   テストカバー。

import { resolveTotalProfit } from "../app/lib/profit";

type Case = { input: Record<string, unknown> | null | undefined; expected: number; note: string };

const cases: Case[] = [
  // ===== null / undefined =====
  { input: null, expected: 0, note: "null summary" },
  { input: undefined, expected: 0, note: "undefined summary" },
  { input: {}, expected: 0, note: "empty summary (no fields)" },

  // ===== DB 値あり (正しく計算保存された行) =====
  {
    input: { total_profit: 12345678, total_revenue: 50000000, business_category: "water" },
    expected: 12345678,
    note: "DB total_profit > 0 はそのまま返す",
  },
  {
    input: { total_profit: "9876543", total_revenue: 50000000 },
    expected: 9876543,
    note: "DB total_profit (string) を Number 化して返す",
  },

  // ===== legacy 行 (total_profit=0、water 系) =====
  {
    // kansai/water/2026/5 の実データに基づく
    input: {
      total_profit: 0,
      total_revenue: 35443020,
      business_category: "water",
      total_labor_cost: 6408500,
      material_cost: 3256865,
      ad_cost: 6193244,
      sales_outsourcing_cost: 4871833,
      card_processing_fee: 0,
    },
    expected: 14712578,
    note: "water legacy: 構成要素から再計算 (kansai/water/5月の実データ)",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 10000000,
      business_category: "electric",
      total_labor_cost: 2000000,
      material_cost: 1000000,
      ad_cost: 1500000,
      sales_outsourcing_cost: 500000,
    },
    expected: 5000000,
    note: "electric: water と同式",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 10000000,
      business_category: "road",
      ad_cost: 1500000,
      sales_outsourcing_cost: 500000,
    },
    expected: 8000000,
    note: "road: 広告費 + 手数料 (sales_outsourcing_cost) のみ計上",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 19651107,
      business_category: "detective",
      ad_cost: 8239341,
    },
    expected: 11411766,
    note: "detective: ad_cost のみ計上 (関西探偵 4 月想定値)",
  },

  // ===== legacy 行 (total_profit=0、locksmith) =====
  {
    input: {
      total_profit: 0,
      total_revenue: 5000000,
      business_category: "locksmith",
      locksmith_construction_cost: 1500000,
      material_cost: 800000,
      ad_cost: 600000,
      locksmith_commission_fee: 200000,
    },
    expected: 1900000,
    note: "locksmith: 専用カラム (locksmith_construction_cost / locksmith_commission_fee) を使用",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 5000000,
      business_category: "locksmith",
      // 旧 PR #48b 流用カラムが入っていても locksmith では無視されることを確認
      total_labor_cost: 9999999,
      sales_outsourcing_cost: 9999999,
      locksmith_construction_cost: 1500000,
      material_cost: 800000,
      ad_cost: 600000,
      locksmith_commission_fee: 200000,
    },
    expected: 1900000,
    note: "locksmith: 旧カラムが入っていても専用カラムのみ参照",
  },

  // ===== エッジケース =====
  {
    input: { total_profit: 0, total_revenue: 0 },
    expected: 0,
    note: "revenue=0 ならフォールバック計算しない (0 返却)",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 1000000,
      business_category: "water",
      total_labor_cost: 500000,
      material_cost: 600000, // 売上を超えるコスト
      ad_cost: 100000,
    },
    expected: 0,
    note: "コスト合計が売上超過 → Math.max(0, ...) で 0 にクランプ",
  },
  {
    input: {
      total_profit: "0",
      total_revenue: "10000000",
      business_category: "water",
      total_labor_cost: "1000000",
      material_cost: "500000",
      ad_cost: "1500000",
    },
    expected: 7000000,
    note: "string 値も Number 化",
  },
  {
    input: { total_profit: 0, total_revenue: 10000000 },
    expected: 10000000,
    note: "business_category 未指定 → water 扱い、コスト全 0 で profit = revenue",
  },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const c of cases) {
  const actual = resolveTotalProfit(c.input);
  if (actual === c.expected) {
    passed++;
  } else {
    failed++;
    const msg = `❌ resolveTotalProfit(${JSON.stringify(c.input)}) = ${actual}, expected ${c.expected}  [${c.note}]`;
    failures.push(msg);
    console.error(msg);
  }
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`\n${failed} failures:\n${failures.join("\n")}`);
}
process.exit(failed > 0 ? 1 : 0);
