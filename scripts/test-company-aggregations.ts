// 単独実行: npx tsx scripts/test-company-aggregations.ts
// aggregateSummariesByCategory / aggregateTargetsByCategory のユニットテスト

import { aggregateSummariesByCategory, aggregateTargetsByCategory } from "../app/lib/company-aggregations";
import { emptyTargets, type Targets } from "../app/lib/calculations";
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

// ===== aggregateTargetsByCategory テスト =====

function makeTargets(overrides: Partial<Targets> = {}): Targets {
  return { ...emptyTargets(), ...overrides };
}

type TargetCase = {
  note: string;
  input: Array<{ category: BusinessCategory; targets: Targets }>;
  check: (result: Partial<Record<BusinessCategory, Targets>>) => boolean;
  expected: string;
};

const targetCases: TargetCase[] = [
  // ===== 単一ペア: そのまま返る =====
  {
    note: "単一ペア: targetSales がそのまま入る",
    input: [{ category: "water", targets: makeTargets({ targetSales: 50000000, targetProfit: 15000000, targetCount: 200 }) }],
    check: (r) => r.water?.targetSales === 50000000,
    expected: "targetSales = 50000000",
  },

  // ===== 絶対値フィールドの加算 =====
  {
    note: "水道2エリア: targetSales が加算される",
    input: [
      { category: "water", targets: makeTargets({ targetSales: 30000000, targetProfit: 9000000, targetCount: 120 }) },
      { category: "water", targets: makeTargets({ targetSales: 25000000, targetProfit: 7500000, targetCount: 100 }) },
    ],
    check: (r) => r.water?.targetSales === 55000000,
    expected: "targetSales = 55000000 (30M + 25M)",
  },

  {
    note: "水道2エリア: targetProfit が加算される",
    input: [
      { category: "water", targets: makeTargets({ targetSales: 30000000, targetProfit: 9000000, targetCount: 120 }) },
      { category: "water", targets: makeTargets({ targetSales: 25000000, targetProfit: 7500000, targetCount: 100 }) },
    ],
    check: (r) => r.water?.targetProfit === 16500000,
    expected: "targetProfit = 16500000 (9M + 7.5M)",
  },

  {
    note: "水道2エリア: targetCount が加算される",
    input: [
      { category: "water", targets: makeTargets({ targetSales: 30000000, targetProfit: 9000000, targetCount: 120 }) },
      { category: "water", targets: makeTargets({ targetSales: 25000000, targetProfit: 7500000, targetCount: 100 }) },
    ],
    check: (r) => r.water?.targetCount === 220,
    expected: "targetCount = 220 (120 + 100)",
  },

  {
    note: "水道2エリア: targetAdCost が加算される",
    input: [
      { category: "water", targets: makeTargets({ targetAdCost: 5000000, targetCount: 120 }) },
      { category: "water", targets: makeTargets({ targetAdCost: 4000000, targetCount: 100 }) },
    ],
    check: (r) => r.water?.targetAdCost === 9000000,
    expected: "targetAdCost = 9000000 (5M + 4M)",
  },

  // ===== 派生値: 合算後の絶対値から再計算 =====
  {
    note: "targetCpa は合算後に targetAdCost ÷ targetCount で再計算される",
    input: [
      // area1: adCost=5M, count=100 → CPA=50000
      { category: "water", targets: makeTargets({ targetAdCost: 5000000, targetCount: 100, targetCpa: 50000 }) },
      // area2: adCost=4M, count=80 → CPA=50000
      { category: "water", targets: makeTargets({ targetAdCost: 4000000, targetCount: 80, targetCpa: 50000 }) },
    ],
    // 合算: (5M + 4M) / (100 + 80) = 9M / 180 = 50000
    check: (r) => r.water?.targetCpa === 50000,
    expected: "targetCpa = 50000 (9000000 ÷ 180)",
  },

  {
    note: "targetUnitPrice は targetSales ÷ targetCount で再計算される",
    input: [
      { category: "water", targets: makeTargets({ targetSales: 30000000, targetCount: 120 }) },
      { category: "water", targets: makeTargets({ targetSales: 25000000, targetCount: 100 }) },
    ],
    // (30M + 25M) / (120 + 100) = 55M / 220 = 250000
    check: (r) => r.water?.targetUnitPrice === 250000,
    expected: "targetUnitPrice = 250000 (55000000 ÷ 220)",
  },

  {
    note: "targetHelpUnitPrice は targetHelpSales ÷ targetHelpCount で再計算される",
    input: [
      { category: "water", targets: makeTargets({ targetHelpSales: 6000000, targetHelpCount: 10 }) },
      { category: "water", targets: makeTargets({ targetHelpSales: 4000000, targetHelpCount: 8 }) },
    ],
    // (6M + 4M) / (10 + 8) = 10M / 18 ≈ 555555
    check: (r) => r.water?.targetHelpUnitPrice === Math.round(10000000 / 18),
    expected: `targetHelpUnitPrice = ${Math.round(10000000 / 18)} (10000000 ÷ 18)`,
  },

  // ===== 率フィールド: 絶対値フィールドなし → 0（「—」表示）=====
  {
    note: "targetAdRate: 絶対値フィールド(targetSales/targetAdCost)が 0 → 計算不可で 0",
    input: [
      { category: "water", targets: makeTargets({ targetAdRate: 15 }) },
      { category: "water", targets: makeTargets({ targetAdRate: 12 }) },
    ],
    check: (r) => r.water?.targetAdRate === 0,
    expected: "targetAdRate = 0（分母 targetSales=0 のため計算不可）",
  },

  {
    note: "targetConversionRate: 絶対値フィールド(targetCallCount)が 0 → 計算不可で 0",
    input: [
      { category: "water", targets: makeTargets({ targetConversionRate: 80 }) },
      { category: "water", targets: makeTargets({ targetConversionRate: 75 }) },
    ],
    check: (r) => r.water?.targetConversionRate === 0,
    expected: "targetConversionRate = 0（分母 targetCallCount=0 のため計算不可）",
  },

  // ===== 率フィールド: 絶対値から再計算 =====
  {
    note: "targetAdRate: targetAdCost/targetSales から再計算される",
    input: [
      { category: "water", targets: makeTargets({ targetSales: 40000000, targetAdCost: 10000000 }) },
      { category: "water", targets: makeTargets({ targetSales: 30000000, targetAdCost: 8000000 }) },
    ],
    // (10M + 8M) / (40M + 30M) * 100 = 18M / 70M * 100 = 25.7%
    check: (r) => r.water?.targetAdRate === Math.round(18000000 / 70000000 * 1000) / 10,
    expected: `targetAdRate = ${Math.round(18000000 / 70000000 * 1000) / 10}% (18M ÷ 70M)`,
  },

  {
    note: "targetConversionRate: targetCount/targetCallCount から再計算される",
    input: [
      { category: "water", targets: makeTargets({ targetCount: 300, targetCallCount: 500 }) },
      { category: "water", targets: makeTargets({ targetCount: 250, targetCallCount: 400 }) },
    ],
    // (300 + 250) / (500 + 400) * 100 = 550 / 900 * 100 = 61.1%
    check: (r) => r.water?.targetConversionRate === Math.round(550 / 900 * 1000) / 10,
    expected: `targetConversionRate = ${Math.round(550 / 900 * 1000) / 10}% (550 ÷ 900)`,
  },

  {
    note: "targetHelpRate: targetHelpSales/targetSales から再計算される",
    input: [
      { category: "water", targets: makeTargets({ targetSales: 50000000, targetHelpSales: 15000000 }) },
      { category: "water", targets: makeTargets({ targetSales: 40000000, targetHelpSales: 10000000 }) },
    ],
    // (15M + 10M) / (50M + 40M) * 100 = 25M / 90M * 100 = 27.8%
    check: (r) => r.water?.targetHelpRate === Math.round(25000000 / 90000000 * 1000) / 10,
    expected: `targetHelpRate = ${Math.round(25000000 / 90000000 * 1000) / 10}% (25M ÷ 90M)`,
  },

  {
    note: "targetPassRate: targetCount/targetCallCount から再計算される",
    input: [
      { category: "water", targets: makeTargets({ targetCount: 400, targetCallCount: 600 }) },
      { category: "water", targets: makeTargets({ targetCount: 350, targetCallCount: 500 }) },
    ],
    // (400 + 350) / (600 + 500) * 100 = 750 / 1100 * 100 = 68.2%
    check: (r) => r.water?.targetPassRate === Math.round(750 / 1100 * 1000) / 10,
    expected: `targetPassRate = ${Math.round(750 / 1100 * 1000) / 10}% (750 ÷ 1100)`,
  },

  // ===== 複数業態: DUNK（water×2 + electric×1 + road×1）=====
  {
    note: "複数業態: water と electric が別キーに集計される",
    input: [
      { category: "water", targets: makeTargets({ targetSales: 30000000, targetCount: 120 }) },
      { category: "water", targets: makeTargets({ targetSales: 25000000, targetCount: 100 }) },
      { category: "electric", targets: makeTargets({ targetSales: 20000000, targetCount: 80 }) },
      { category: "road", targets: makeTargets({ targetSales: 10000000, targetCount: 40 }) },
    ],
    check: (r) =>
      r.water?.targetSales === 55000000 &&
      r.electric?.targetSales === 20000000 &&
      r.road?.targetSales === 10000000,
    expected: "water=55M, electric=20M, road=10M に分かれる",
  },

  // ===== SIKKEN Group（鍵1ペア）=====
  {
    note: "鍵1ペア: locksmith のみ存在",
    input: [
      { category: "locksmith", targets: makeTargets({ targetSales: 15000000, targetProfit: 6000000, targetCount: 150 }) },
    ],
    check: (r) => r.locksmith !== undefined && r.water === undefined && r.locksmith.targetSales === 15000000,
    expected: "locksmith のみ存在",
  },

  // ===== 空配列 =====
  {
    note: "空配列: 結果も空オブジェクト",
    input: [],
    check: (r) => Object.keys(r).length === 0,
    expected: "空オブジェクト {}",
  },

  // ===== targetCallCount / targetVehicleCount / targetTraineeCount =====
  {
    note: "targetCallCount が加算される",
    input: [
      { category: "water", targets: makeTargets({ targetCallCount: 500 }) },
      { category: "water", targets: makeTargets({ targetCallCount: 400 }) },
    ],
    check: (r) => r.water?.targetCallCount === 900,
    expected: "targetCallCount = 900 (500 + 400)",
  },

  {
    note: "targetVehicleCount が加算される",
    input: [
      { category: "water", targets: makeTargets({ targetVehicleCount: 8 }) },
      { category: "water", targets: makeTargets({ targetVehicleCount: 6 }) },
    ],
    check: (r) => r.water?.targetVehicleCount === 14,
    expected: "targetVehicleCount = 14 (8 + 6)",
  },

  // ===== 電気専用 targetSwitchboardCount =====
  {
    note: "targetSwitchboardCount（電気専用）が加算される",
    input: [
      { category: "electric", targets: makeTargets({ targetSwitchboardCount: 20 }) },
      { category: "electric", targets: makeTargets({ targetSwitchboardCount: 15 }) },
    ],
    check: (r) => r.electric?.targetSwitchboardCount === 35,
    expected: "targetSwitchboardCount = 35 (20 + 15)",
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

let tPassed = 0;
let tFailed = 0;
const tFailures: string[] = [];

for (const c of targetCases) {
  const result = aggregateTargetsByCategory(c.input);
  if (c.check(result)) {
    tPassed++;
  } else {
    tFailed++;
    const msg = `❌ [${c.note}] — expected: ${c.expected}, got: ${JSON.stringify(result)}`;
    tFailures.push(msg);
    console.error(msg);
  }
}

console.log(`${tFailed === 0 ? "✅" : "❌"} ${tPassed}/${tPassed + tFailed} passed — aggregateTargetsByCategory`);

const totalFailed = failed + tFailed;
if (totalFailed > 0) {
  console.error(`\n${totalFailed} total failures:\n${[...failures, ...tFailures].join("\n")}`);
}
process.exit(totalFailed > 0 ? 1 : 0);
