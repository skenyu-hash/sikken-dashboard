// PR c93-1 統合テスト: 内製化ボーナス廃止の検証
//
// 単独実行: npm run test:integration:c93-1-no-bonus
// (DATABASE_URL を export 必要)
//
// 検証内容:
//   旧仕様: total_profit (f31) = profit (f30) + internal_construction_profit (内製化ボーナス)
//   新仕様: total_profit (f30 単独) — internal_construction_profit は加算しない
//
//   business_category 別の挙動:
//     - water/electric/road/detective: ELSE 分岐 (旧式から加算項削除)
//     - locksmith: 元から内製化ボーナス対象外 (専用 CASE 分岐、変更なし)
//
// テストケース:
//   1. water + internal_construction_profit=20000 → total_profit = revenue (加算なし)
//      旧式なら revenue + 20000、新仕様で revenue 単独
//   2. water + internal_construction_profit=0 → 新旧で結果同じ (regression なし)
//   3. locksmith + internal_construction_profit=99999 → locksmith 分岐は元から無加算
//      (99999 を入れても total_profit に影響しないことを確認)
//
// 投入先: kansai/2099-04 (テスト専用、本番影響なし)

import { Pool } from "@neondatabase/serverless";
import { aggregateMonthlySummary, type BusinessCategory } from "../app/lib/monthlyAggregation";

const TEST_AREA = "kansai";
const TEST_YEAR = 2099;
const TEST_MONTH = 4;
const TEST_DATE = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-15`;

let passed = 0;
let failed = 0;

function check(name: string, actual: number, expected: number, tolerance = 0.5) {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`  ✅ ${name}: ${actual} (expected ${expected})`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: got ${actual}, expected ${expected}`);
    failed++;
  }
}

async function setupCellWithEntry(
  client: import("@neondatabase/serverless").PoolClient,
  category: BusinessCategory,
  entryData: Record<string, number>,
) {
  await client.query(
    `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date=$3`,
    [TEST_AREA, category, TEST_DATE]
  );
  await client.query(
    `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
    [TEST_AREA, category, TEST_YEAR, TEST_MONTH]
  );
  const entry = {
    date: TEST_DATE,
    // 旧 DailyEntry 必須フィールド (全 0)
    totalCount: 0, constructionCount: 0,
    selfRevenue: 0, selfProfit: 0, selfCount: 0,
    newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
    addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
    ...entryData,
  };
  await client.query(
    `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    [TEST_AREA, category, TEST_DATE, JSON.stringify(entry)]
  );
}

async function cleanup(client: import("@neondatabase/serverless").PoolClient, category: BusinessCategory) {
  await client.query(
    `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date=$3`,
    [TEST_AREA, category, TEST_DATE]
  );
  await client.query(
    `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
    [TEST_AREA, category, TEST_YEAR, TEST_MONTH]
  );
}

async function readTotalProfit(client: import("@neondatabase/serverless").PoolClient, category: BusinessCategory): Promise<number> {
  const { rows } = await client.query(
    `SELECT total_profit FROM monthly_summaries
     WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
    [TEST_AREA, category, TEST_YEAR, TEST_MONTH]
  );
  return rows.length > 0 ? Number(rows[0].total_profit) : -1;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL が設定されていません。");
    process.exit(1);
  }

  console.log(`🧪 PR c93-1: 内製化ボーナス廃止 検証\n`);
  console.log(`   投入先: ${TEST_AREA}/2099-${String(TEST_MONTH).padStart(2, "0")} (テスト専用、4 月以前データ枠だが 2099 年なので本番影響なし)\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // -------------------------------------------------------------
    // CASE 1: water + internal_construction_profit=20000
    //   c93-1 仕様: total_profit = revenue - costs (内製化ボーナス加算なし)
    //   PR c95-B-2 追加: water + TEST_YEAR=2099 (yyyymm=209904 >= 202605) → consultant fee 7.7% 控除
    //     total_profit = 100000 - 100000*0.077 = 100000 - 7700 = 92300
    //   (TEST_MONTH=4 だが 2099 年なので yyyymm=209904 >= 境界 202605 で控除対象)
    // -------------------------------------------------------------
    console.log(`📋 CASE 1: water 業態、internal_construction_profit=20000 (加算されないこと + c95-B-2 控除 検証)`);
    await setupCellWithEntry(client, "water", {
      outsourced_sales_revenue: 100000,
      internal_construction_profit: 20000,  // ← これが加算されないことを確認
      // 他コストは全て 0 → total_profit = revenue - revenue*0.077 = 92300
    });
    await aggregateMonthlySummary(TEST_AREA, "water", TEST_YEAR, TEST_MONTH);
    const tp1 = await readTotalProfit(client, "water");
    check("water: total_profit = 92300 (revenue 単独 - c95-B-2 控除、bonus 加算なし)", tp1, 92300);
    await cleanup(client, "water");

    // -------------------------------------------------------------
    // CASE 2: water + internal_construction_profit=0 (regression check)
    //   bonus=0 でも c95-B-2 控除は同様に適用される (= 同じ 92300)
    // -------------------------------------------------------------
    console.log(`\n📋 CASE 2: water 業態、internal_construction_profit=0 (c95-B-2 控除込み regression check)`);
    await setupCellWithEntry(client, "water", {
      outsourced_sales_revenue: 100000,
      internal_construction_profit: 0,
    });
    await aggregateMonthlySummary(TEST_AREA, "water", TEST_YEAR, TEST_MONTH);
    const tp2 = await readTotalProfit(client, "water");
    check("water: total_profit = 92300 (bonus=0 ケース、c95-B-2 控除込み)", tp2, 92300);
    await cleanup(client, "water");

    // -------------------------------------------------------------
    // CASE 3: locksmith + internal_construction_profit=99999
    //   locksmith は元から内製化ボーナス対象外 (専用 CASE 分岐)
    //   internal_construction_profit を入れても total_profit に影響しないことを確認
    //
    //   locksmith 式: revenue - locksmith_construction_cost - material_cost
    //                 - ad_cost - locksmith_commission_fee
    //   今回投入: revenue=200000, locksmith_construction_cost=50000, 他 0
    //   期待: total_profit = 200000 - 50000 = 150000 (99999 は無視)
    // -------------------------------------------------------------
    console.log(`\n📋 CASE 3: locksmith 業態、internal_construction_profit=99999 (無視確認)`);
    await setupCellWithEntry(client, "locksmith", {
      outsourced_sales_revenue: 200000,
      locksmith_construction_cost: 50000,
      internal_construction_profit: 99999,  // ← locksmith では使われない (regression check)
    });
    await aggregateMonthlySummary(TEST_AREA, "locksmith", TEST_YEAR, TEST_MONTH);
    const tp3 = await readTotalProfit(client, "locksmith");
    check("locksmith: total_profit = 150000 (専用式、internal_construction_profit 無視)", tp3, 150000);
    await cleanup(client, "locksmith");

    // -------------------------------------------------------------
    // CASE 4: water + 複数フィールドの組合せ
    //   c93-1 の素朴な式: revenue - labor - material - ad - sales_outsourcing - card
    //     = 1000000 - 200000 - 100000 - 50000 - 30000 - 5000 = 615000
    //   PR c95-B-2 追加: consultant fee 7.7% 控除 (water + 2099 = yyyymm 209904 >= 202605)
    //     = 615000 - 1000000*0.077 = 615000 - 77000 = 538000
    //   internal_construction_profit=50000 を入れても加算されない (c93-1 維持)
    // -------------------------------------------------------------
    console.log(`\n📋 CASE 4: water 業態、複数コスト + internal_construction_profit=50000 (c95-B-2 控除込み)`);
    await setupCellWithEntry(client, "water", {
      outsourced_sales_revenue: 1000000,
      total_labor_cost: 200000,
      material_cost: 100000,
      ad_cost: 50000,
      sales_outsourcing_cost: 30000,
      card_processing_fee: 5000,
      internal_construction_profit: 50000,  // ← 加算されないことを確認
    });
    await aggregateMonthlySummary(TEST_AREA, "water", TEST_YEAR, TEST_MONTH);
    const tp4 = await readTotalProfit(client, "water");
    check("water: total_profit = 538000 (revenue - 5 コスト - c95-B-2 控除、bonus 加算なし)", tp4, 538000);
    await cleanup(client, "water");

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
