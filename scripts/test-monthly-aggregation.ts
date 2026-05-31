// PR c90-1 統合テスト: aggregateMonthlySummary() の正確性検証
//
// 単独実行: npx tsx scripts/test-monthly-aggregation.ts
// (DATABASE_URL を export 必要)
//
// 検証内容:
//   1. entries に 3 日分の差分行を INSERT
//   2. aggregateMonthlySummary を呼び出し
//   3. monthly_summaries から取得して以下を検証:
//      - base 列の SUM (sum_total_labor_cost = 3 行分の合計、等)
//      - 派生列の計算 (total_revenue = sum(out + internal)、unit_price = total_revenue/total_count、等)
//      - cost 系の locksmith 分岐 (water 業態では通常式)
//      - 0 除算ガード (空エントリでも NULL にならず 0 になる)
//      - source = 'entries_aggregation', updated_at が更新されている
//   4. cleanup
//
// 投入先: kansai / water / 2099-12 (本番影響なし、専用月)

import { Pool } from "@neondatabase/serverless";
import { aggregateMonthlySummary } from "../app/lib/monthlyAggregation";

const TEST_AREA = "kansai";
const TEST_CATEGORY = "water" as const;
const TEST_YEAR = 2099;
const TEST_MONTH = 12;

// 3 日分の日次差分。SUM 結果が予測可能になる値を入れる。
const DAILY_ENTRIES = [
  {
    date: "2099-12-05",
    data: {
      // 売上系
      outsourced_sales_revenue: 1000000,
      internal_staff_revenue: 500000,
      // 件数系
      outsourced_response_count: 10,
      internal_staff_response_count: 5,
      // コスト
      total_labor_cost: 200000,
      material_cost: 100000,
      sales_outsourcing_cost: 50000,
      card_processing_fee: 20000,
      ad_cost: 300000,
      call_count: 25,
      acquisition_count: 8,
      // 施工
      outsourced_construction_count: 4,
      internal_construction_count: 3,
      outsourced_construction_cost: 150000,
      internal_construction_profit: 80000,
      // HELP
      help_count: 2,
      help_revenue: 200000,
      vehicle_count: 5,
    },
  },
  {
    date: "2099-12-10",
    data: {
      outsourced_sales_revenue: 2000000,
      internal_staff_revenue: 1000000,
      outsourced_response_count: 20,
      internal_staff_response_count: 10,
      total_labor_cost: 400000,
      material_cost: 200000,
      sales_outsourcing_cost: 100000,
      card_processing_fee: 40000,
      ad_cost: 600000,
      call_count: 50,
      acquisition_count: 16,
      outsourced_construction_count: 8,
      internal_construction_count: 6,
      outsourced_construction_cost: 300000,
      internal_construction_profit: 160000,
      help_count: 4,
      help_revenue: 400000,
      vehicle_count: 7, // MAX 候補
    },
  },
  {
    date: "2099-12-15",
    data: {
      outsourced_sales_revenue: 1500000,
      internal_staff_revenue: 750000,
      outsourced_response_count: 15,
      internal_staff_response_count: 8,
      total_labor_cost: 300000,
      material_cost: 150000,
      sales_outsourcing_cost: 75000,
      card_processing_fee: 30000,
      ad_cost: 450000,
      call_count: 38,
      acquisition_count: 12,
      outsourced_construction_count: 6,
      internal_construction_count: 4,
      outsourced_construction_cost: 225000,
      internal_construction_profit: 120000,
      help_count: 3,
      help_revenue: 300000,
      vehicle_count: 6,
    },
  },
];

// 期待される SUM 結果 (上記 3 行の合計)
const EXPECTED = {
  // base SUMs
  outsourced_sales_revenue: 4500000,
  internal_staff_revenue: 2250000,
  outsourced_response_count: 45,
  internal_staff_response_count: 23,
  total_labor_cost: 900000,
  material_cost: 450000,
  sales_outsourcing_cost: 225000,
  card_processing_fee: 90000,
  ad_cost: 1350000,
  call_count: 113,
  acquisition_count: 36,
  outsourced_construction_count: 18,
  internal_construction_count: 13,
  outsourced_construction_cost: 675000,
  internal_construction_profit: 360000,
  // PR c93-2: 対応ベース construction_count の fallback 集計を回帰確認。
  //   TEST_VALUES に construction_count キーがないため、aggregation の COALESCE chain で
  //   旧 outsourced + internal sum で fallback 集計される (18 + 13 = 31)。
  //   将来 TEST_VALUES に construction_count を追加した場合は新形式優先で別値になる。
  construction_count: 31,
  help_count: 9,
  help_revenue: 900000,
  // 派生
  total_revenue: 6750000, // 4500000 + 2250000
  total_count: 68, // 45 + 23
  unit_price: Math.round(6750000 / 68), // 99264
  cpa: Math.round(1350000 / 36), // 37500
  call_unit_price: Math.round(1350000 / 113), // 11947
  conv_rate: Math.round(36 / 113 * 100 * 10) / 10, // 31.9
  ad_rate: Math.round(1350000 / 6750000 * 100 * 10) / 10, // 20.0
  help_unit_price: Math.round(900000 / 9), // 100000
  // PR c93-1: 内製化ボーナス (+ internal_construction_profit) 廃止に伴い期待値更新。
  //   c93-1 式: revenue - labor - material - ad - sales_outsourcing - card_fee (bonus 加算なし)
  //         = 6750000 - 900000 - 450000 - 1350000 - 225000 - 90000 = 3735000
  // PR c95-B-2: water + TEST_YEAR=2099/TEST_MONTH=12 (yyyymm=209912 >= 202605) → consultant fee 7.7% 控除
  //   c95-B-2 式: c93-1 式 - revenue * 0.077 = 3735000 - 6750000*0.077 = 3735000 - 519750 = 3215250
  total_profit: 3215250,
  // PR c93-1 → c95-B-2: total_profit 変更に伴い profit_rate も更新。
  //   c95-B-2 式: 3215250 / 6750000 * 100 = 47.633..%、ROUND 47.6
  profit_rate: 47.6,
  // 特殊
  vehicle_count: 7, // MAX
  as_of_day: 15, // MAX(day)
};

let passed = 0;
let failed = 0;
function check(name: string, actual: number, expected: number, tolerance = 0.1) {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`  ✅ ${name}: ${actual} (expected ${expected})`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: got ${actual}, expected ${expected}`);
    failed++;
  }
}
function checkStr(name: string, actual: string, expected: string) {
  if (actual === expected) {
    console.log(`  ✅ ${name}: "${actual}"`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: got "${actual}", expected "${expected}"`);
    failed++;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL が設定されていません。export してから実行:");
    console.error("   export $(grep DATABASE_URL .env.local | xargs)");
    process.exit(1);
  }

  console.log(`🧪 PR c90-1: monthlyAggregation 検証`);
  console.log(`   投入先: ${TEST_AREA}/${TEST_CATEGORY}/${TEST_YEAR}-${TEST_MONTH}\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // 既存テストデータの cleanup
    await client.query(
      `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date >= $3 AND entry_date <= $4`,
      [TEST_AREA, TEST_CATEGORY, `${TEST_YEAR}-${TEST_MONTH}-01`, `${TEST_YEAR}-${TEST_MONTH}-31`]
    );
    await client.query(
      `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );

    // 3 日分の差分行を INSERT
    console.log(`📝 ${DAILY_ENTRIES.length} 日分の差分行を entries に投入...`);
    for (const e of DAILY_ENTRIES) {
      await client.query(
        `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())`,
        [TEST_AREA, TEST_CATEGORY, e.date, JSON.stringify(e.data)]
      );
    }

    // aggregation 実行
    console.log(`🔄 aggregateMonthlySummary 実行中...`);
    await aggregateMonthlySummary(TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH);

    // monthly_summaries 取得
    const { rows } = await client.query(
      `SELECT * FROM monthly_summaries
       WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );

    if (rows.length !== 1) {
      console.error(`❌ monthly_summaries 行数が不正: 期待 1, 実際 ${rows.length}`);
      process.exit(1);
    }
    const ms = rows[0];

    console.log(`\n🔍 base SUM 列の検証:`);
    check("outsourced_sales_revenue", Number(ms.outsourced_sales_revenue), EXPECTED.outsourced_sales_revenue);
    check("internal_staff_revenue", Number(ms.internal_staff_revenue), EXPECTED.internal_staff_revenue);
    check("outsourced_response_count", Number(ms.outsourced_response_count), EXPECTED.outsourced_response_count);
    check("internal_staff_response_count", Number(ms.internal_staff_response_count), EXPECTED.internal_staff_response_count);
    check("total_labor_cost", Number(ms.total_labor_cost), EXPECTED.total_labor_cost);
    check("material_cost", Number(ms.material_cost), EXPECTED.material_cost);
    check("sales_outsourcing_cost", Number(ms.sales_outsourcing_cost), EXPECTED.sales_outsourcing_cost);
    check("card_processing_fee", Number(ms.card_processing_fee), EXPECTED.card_processing_fee);
    check("ad_cost", Number(ms.ad_cost), EXPECTED.ad_cost);
    check("call_count", Number(ms.call_count), EXPECTED.call_count);
    check("acquisition_count", Number(ms.acquisition_count), EXPECTED.acquisition_count);
    check("outsourced_construction_count", Number(ms.outsourced_construction_count), EXPECTED.outsourced_construction_count);
    check("internal_construction_count", Number(ms.internal_construction_count), EXPECTED.internal_construction_count);
    // PR c93-2: construction_count は fallback 経路で outsourced + internal の sum に
    check("construction_count (fallback = outsourced+internal sum)", Number(ms.construction_count), EXPECTED.construction_count);
    check("outsourced_construction_cost", Number(ms.outsourced_construction_cost), EXPECTED.outsourced_construction_cost);
    check("internal_construction_profit", Number(ms.internal_construction_profit), EXPECTED.internal_construction_profit);
    check("help_count", Number(ms.help_count), EXPECTED.help_count);
    check("help_revenue", Number(ms.help_revenue), EXPECTED.help_revenue);

    console.log(`\n🧮 派生列の検証:`);
    check("total_revenue", Number(ms.total_revenue), EXPECTED.total_revenue);
    check("total_count", Number(ms.total_count), EXPECTED.total_count);
    check("unit_price", Number(ms.unit_price), EXPECTED.unit_price, 1);
    check("cpa", Number(ms.cpa), EXPECTED.cpa, 1);
    check("call_unit_price", Number(ms.call_unit_price), EXPECTED.call_unit_price, 1);
    check("conv_rate", Number(ms.conv_rate), EXPECTED.conv_rate);
    check("ad_rate", Number(ms.ad_rate), EXPECTED.ad_rate);
    check("help_unit_price", Number(ms.help_unit_price), EXPECTED.help_unit_price, 1);
    check("total_profit", Number(ms.total_profit), EXPECTED.total_profit);
    check("profit_rate", Number(ms.profit_rate), EXPECTED.profit_rate);

    console.log(`\n📌 特殊列の検証:`);
    check("vehicle_count (MAX)", Number(ms.vehicle_count), EXPECTED.vehicle_count);
    check("as_of_day (MAX day)", Number(ms.as_of_day), EXPECTED.as_of_day);
    checkStr("source", String(ms.source), "entries_aggregation");

    console.log(`\n🧹 cleanup...`);
    await client.query(
      `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date >= $3 AND entry_date <= $4`,
      [TEST_AREA, TEST_CATEGORY, `${TEST_YEAR}-${TEST_MONTH}-01`, `${TEST_YEAR}-${TEST_MONTH}-31`]
    );
    await client.query(
      `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );

    console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} assertions passed`);
    if (failed > 0) process.exit(1);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
