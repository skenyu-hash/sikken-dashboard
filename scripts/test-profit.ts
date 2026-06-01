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

  // ===== PR c95-B-4a: water コンサル費 7.7% 控除 (2026/5 以降) =====
  // kansai/water/2026/5 想定: revenue=35,443,020 → fee=35,443,020 * 0.077 = 2,729,112.54
  //   derived_before_fee = 14,712,578、derived_after_fee = 11,983,465.46
  //   Math.round → 11,983,465 (SQL 経路 ROUND(...)::BIGINT と整数粒度一致)
  {
    input: {
      total_profit: 0,
      total_revenue: 35443020,
      business_category: "water",
      total_labor_cost: 6408500,
      material_cost: 3256865,
      ad_cost: 6193244,
      sales_outsourcing_cost: 4871833,
      card_processing_fee: 0,
      year: 2026,
      month: 5,
    },
    expected: 11983465,
    note: "c95-B-4a: water 2026/5 → 7.7% 控除適用 (kansai 実データ想定、Math.round 後)",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 35443020,
      business_category: "water",
      total_labor_cost: 6408500,
      material_cost: 3256865,
      ad_cost: 6193244,
      sales_outsourcing_cost: 4871833,
      card_processing_fee: 0,
      year: 2026,
      month: 4,
    },
    expected: 14712578,
    note: "c95-B-4a: water 2026/4 (境界月、控除なし、過去データ保護)",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 35443020,
      business_category: "water",
      total_labor_cost: 6408500,
      material_cost: 3256865,
      ad_cost: 6193244,
      sales_outsourcing_cost: 4871833,
      card_processing_fee: 0,
      year: 2025,
      month: 12,
    },
    expected: 14712578,
    note: "c95-B-4a: water 2025/12 (過去年、控除なし、過去データ遡及変動ガード)",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 35443020,
      business_category: "water",
      total_labor_cost: 6408500,
      material_cost: 3256865,
      ad_cost: 6193244,
      sales_outsourcing_cost: 4871833,
      card_processing_fee: 0,
      year: "2026",
      month: "5",
    },
    expected: 11983465,
    note: "c95-B-4a: water 2026/5 + string year/month → numOf で number 化、控除適用",
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
      year: 2026,
      month: 5,
    },
    expected: 5000000,
    note: "c95-B-4a: electric 2026/5 → 控除なし (water 限定の二重ガード)",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 5000000,
      business_category: "locksmith",
      locksmith_construction_cost: 1500000,
      material_cost: 800000,
      ad_cost: 600000,
      locksmith_commission_fee: 200000,
      year: 2026,
      month: 5,
    },
    expected: 1900000,
    note: "c95-B-4a: locksmith 2026/5 → 控除なし (water 限定)",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 10000000,
      business_category: "road",
      ad_cost: 1500000,
      sales_outsourcing_cost: 500000,
      year: 2026,
      month: 5,
    },
    expected: 8000000,
    note: "c95-B-4a: road 2026/5 → 控除なし (water 限定)",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 19651107,
      business_category: "detective",
      ad_cost: 8239341,
      year: 2026,
      month: 5,
    },
    expected: 11411766,
    note: "c95-B-4a: detective 2026/5 → 控除なし (water 限定)",
  },
  {
    // 100 - 100*0.077 = 100 - 7.7 = 92.3 → Math.round = 92
    input: {
      total_profit: 0,
      total_revenue: 100,
      business_category: "water",
      year: 2026,
      month: 5,
    },
    expected: 92,
    note: "c95-B-4a: water Math.round 小数検算 (100 - 7.7 = 92.3 → 92)",
  },
  {
    // file_import bypass シナリオ証跡: dbProfit > 0 で水道 5月 → 早期 return
    //   控除前 profit が DB に書かれていると over-report が発生する。
    //   c95-B-4a スコープ外、c95-B-5 で対応 (KNOWN_ISSUES.md #8 参照)。
    input: {
      total_profit: 30460693,
      total_revenue: 88857300,
      business_category: "water",
      year: 2026,
      month: 5,
    },
    expected: 30460693,
    note: "c95-B-4a: water 2026/5 + dbProfit > 0 → 早期 return (c95-B-5 bypass 証跡)",
  },
  {
    input: {
      total_profit: 0,
      total_revenue: 0,
      business_category: "water",
      year: 2026,
      month: 5,
    },
    expected: 0,
    note: "c95-B-4a: water 2026/5 + revenue=0 → revenue ガードで 0",
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
