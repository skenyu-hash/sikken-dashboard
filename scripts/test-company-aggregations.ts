// 単独実行: npx tsx scripts/test-company-aggregations.ts
// aggregateSummariesByCategory のユニットテスト

import { aggregateSummariesByCategory } from "../app/lib/company-aggregations";
import type { BusinessCategory } from "../app/lib/businesses";

type Case = {
  note: string;
  input: Array<{ category: BusinessCategory; summary: Record<string, unknown> | null }>;
  check: (result: Partial<Record<BusinessCategory, Record<string, unknown>>>) => boolean;
  expected: string;
};

const cases: Case[] = [
  // ===== 基本: null summary はスキップ =====
  {
    note: "null summary は結果に含まれない",
    input: [{ category: "water", summary: null }],
    check: (r) => r.water === undefined,
    expected: "water キーなし",
  },

  // ===== 単一ペア: そのまま返る =====
  {
    note: "単一ペア: total_revenue がそのまま入る",
    input: [
      {
        category: "water",
        summary: {
          total_revenue: 10000000,
          total_profit: 3000000,
          total_count: 50,
          ad_cost: 500000,
          business_category: "water",
          year: 2026,
          month: 6,
          area_id: "kansai",
        },
      },
    ],
    check: (r) => Number(r.water?.total_revenue) === 10000000,
    expected: "total_revenue = 10000000",
  },

  {
    note: "単一ペア: area_id が company_aggregated に置換される",
    input: [
      {
        category: "water",
        summary: {
          total_revenue: 5000000,
          total_profit: 1500000,
          area_id: "kansai",
          year: 2026,
          month: 6,
        },
      },
    ],
    check: (r) => r.water?.area_id === "company_aggregated",
    expected: "area_id = 'company_aggregated'",
  },

  // ===== 複数ペア合算: Mavericks（water×kansai + water×hokkaido）=====
  {
    note: "水道2エリア: total_revenue が加算される",
    input: [
      {
        category: "water",
        summary: { total_revenue: 10000000, total_profit: 3000000, total_count: 50, ad_cost: 500000, year: 2026, month: 6 },
      },
      {
        category: "water",
        summary: { total_revenue: 8000000, total_profit: 2400000, total_count: 40, ad_cost: 400000, year: 2026, month: 6 },
      },
    ],
    check: (r) => Number(r.water?.total_revenue) === 18000000,
    expected: "total_revenue = 18000000 (10M + 8M)",
  },

  {
    note: "水道2エリア: total_count が加算される",
    input: [
      {
        category: "water",
        summary: { total_revenue: 10000000, total_profit: 3000000, total_count: 50, ad_cost: 500000, year: 2026, month: 6 },
      },
      {
        category: "water",
        summary: { total_revenue: 8000000, total_profit: 2400000, total_count: 40, ad_cost: 400000, year: 2026, month: 6 },
      },
    ],
    check: (r) => Number(r.water?.total_count) === 90,
    expected: "total_count = 90 (50 + 40)",
  },

  {
    note: "水道2エリア: ad_cost が加算される",
    input: [
      {
        category: "water",
        summary: { total_revenue: 10000000, total_profit: 3000000, total_count: 50, ad_cost: 500000, year: 2026, month: 6 },
      },
      {
        category: "water",
        summary: { total_revenue: 8000000, total_profit: 2400000, total_count: 40, ad_cost: 400000, year: 2026, month: 6 },
      },
    ],
    check: (r) => Number(r.water?.ad_cost) === 900000,
    expected: "ad_cost = 900000 (500k + 400k)",
  },

  // ===== total_profit: resolveTotalProfit 経由で計算 =====
  {
    note: "total_profit > 0 の行: DB値をそのまま加算",
    input: [
      {
        category: "water",
        summary: { total_revenue: 10000000, total_profit: 3000000, total_count: 50, year: 2026, month: 6 },
      },
      {
        category: "water",
        summary: { total_revenue: 8000000, total_profit: 2400000, total_count: 40, year: 2026, month: 6 },
      },
    ],
    check: (r) => Number(r.water?.total_profit) === 5400000,
    expected: "total_profit = 5400000 (3M + 2.4M)",
  },

  {
    note: "total_profit = 0 のレガシー行: 構成要素から再計算して加算",
    input: [
      {
        category: "water",
        summary: {
          total_revenue: 10000000,
          total_profit: 0, // legacy
          total_labor_cost: 3000000,
          material_cost: 1000000,
          ad_cost: 500000,
          sales_outsourcing_cost: 200000,
          card_processing_fee: 100000,
          business_category: "water",
          year: 2026,
          month: 6,
        },
      },
    ],
    // resolveTotalProfit: 10M - 3M - 1M - 500k - 200k - 100k = 5200000
    check: (r) => Number(r.water?.total_profit) === 5200000,
    expected: "total_profit = 5200000 (構成要素から再計算)",
  },

  // ===== コンサル費二重控除防止: water 2026/5以降 =====
  {
    note: "water 2026/5: consultant_fee が合算後に二重控除されない",
    input: [
      {
        category: "water",
        summary: {
          total_revenue: 30000000,
          total_profit: 6000000, // DB値あり（既にコンサル費控除済み）
          consultant_fee: 2000000,
          business_category: "water",
          year: 2026,
          month: 5,
        },
      },
      {
        category: "water",
        summary: {
          total_revenue: 25000000,
          total_profit: 5000000, // DB値あり（既にコンサル費控除済み）
          consultant_fee: 1500000,
          business_category: "water",
          year: 2026,
          month: 5,
        },
      },
    ],
    // DB total_profit > 0 → resolveTotalProfit はそのまま返す（再計算しない）
    // 6M + 5M = 11M（consultant_fee は再控除されない）
    check: (r) => Number(r.water?.total_profit) === 11000000,
    expected: "total_profit = 11000000 (二重控除なし)",
  },

  {
    note: "water 2026/5: consultant_fee 列は単純加算される",
    input: [
      {
        category: "water",
        summary: { total_revenue: 30000000, total_profit: 6000000, consultant_fee: 2000000, business_category: "water", year: 2026, month: 5 },
      },
      {
        category: "water",
        summary: { total_revenue: 25000000, total_profit: 5000000, consultant_fee: 1500000, business_category: "water", year: 2026, month: 5 },
      },
    ],
    check: (r) => Number(r.water?.consultant_fee) === 3500000,
    expected: "consultant_fee = 3500000 (2M + 1.5M)",
  },

  // ===== 複数業態: DUNK（water×2 + electric×1 + road×1）=====
  {
    note: "複数業態: water と electric が別キーに分かれる",
    input: [
      { category: "water", summary: { total_revenue: 10000000, total_profit: 3000000, total_count: 50, year: 2026, month: 6 } },
      { category: "water", summary: { total_revenue: 8000000, total_profit: 2400000, total_count: 40, year: 2026, month: 6 } },
      { category: "electric", summary: { total_revenue: 5000000, total_profit: 1500000, total_count: 25, year: 2026, month: 6 } },
      { category: "road", summary: { total_revenue: 2000000, total_profit: 600000, total_count: 10, year: 2026, month: 6 } },
    ],
    check: (r) =>
      Number(r.water?.total_revenue) === 18000000 &&
      Number(r.electric?.total_revenue) === 5000000 &&
      Number(r.road?.total_revenue) === 2000000,
    expected: "water=18M, electric=5M, road=2M に分かれる",
  },

  {
    note: "複数業態: locksmith は存在しない会社では undefined",
    input: [
      { category: "water", summary: { total_revenue: 10000000, total_profit: 3000000, total_count: 50, year: 2026, month: 6 } },
    ],
    check: (r) => r.locksmith === undefined,
    expected: "locksmith キーなし",
  },

  // ===== SIKKEN Group（locksmith×kansai 1ペアのみ）=====
  {
    note: "鍵1ペアのみ: locksmith キーのみ存在する",
    input: [
      {
        category: "locksmith",
        summary: {
          total_revenue: 3000000,
          total_profit: 1200000,
          total_count: 30,
          locksmith_construction_cost: 800000,
          locksmith_commission_fee: 100000,
          year: 2026,
          month: 6,
        },
      },
    ],
    check: (r) =>
      r.locksmith !== undefined &&
      r.water === undefined &&
      Number(r.locksmith?.total_revenue) === 3000000,
    expected: "locksmith のみ存在、total_revenue = 3000000",
  },

  // ===== メタ列: year/month は初回値が保持される =====
  {
    note: "year/month は最初のエントリの値が保持される（2回目の値で上書きされない）",
    input: [
      { category: "water", summary: { total_revenue: 10000000, total_profit: 3000000, year: 2026, month: 6, area_id: "kansai" } },
      { category: "water", summary: { total_revenue: 8000000, total_profit: 2400000, year: 2026, month: 6, area_id: "hokkaido" } },
    ],
    check: (r) => Number(r.water?.year) === 2026 && Number(r.water?.month) === 6,
    expected: "year=2026, month=6",
  },

  // ===== 文字列数値（Neon driver が NUMERIC を string で返すケース）=====
  {
    note: "文字列数値（Neon NUMERIC→string）も正しく加算される",
    input: [
      { category: "water", summary: { total_revenue: "10000000", total_profit: "3000000", total_count: "50", year: 2026, month: 6 } },
      { category: "water", summary: { total_revenue: "8000000", total_profit: "2400000", total_count: "40", year: 2026, month: 6 } },
    ],
    check: (r) =>
      Number(r.water?.total_revenue) === 18000000 &&
      Number(r.water?.total_count) === 90,
    expected: "total_revenue=18M, total_count=90 (string → number 変換)",
  },

  // ===== 空配列 =====
  {
    note: "空配列: 結果も空オブジェクト",
    input: [],
    check: (r) => Object.keys(r).length === 0,
    expected: "空オブジェクト {}",
  },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const c of cases) {
  const result = aggregateSummariesByCategory(c.input);
  if (c.check(result)) {
    passed++;
  } else {
    failed++;
    const msg = `❌ [${c.note}] — expected: ${c.expected}, got: ${JSON.stringify(result)}`;
    failures.push(msg);
    console.error(msg);
  }
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed — aggregateSummariesByCategory`);
if (failed > 0) {
  console.error(`\n${failed} failures:\n${failures.join("\n")}`);
}
process.exit(failed > 0 ? 1 : 0);
