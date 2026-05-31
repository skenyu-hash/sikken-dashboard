// PR c95-B-2 統合テスト: water 業態の aggregation に consultant fee 7.7% 控除が
//   正しく組み込まれ、他業態には影響しないことを検証 (DB 要、専用月 2099-12)。
//
// 実行: export $(grep DATABASE_URL .env.local | xargs) && npm run test:integration:c95-b-aggregation-consultant
//
// 検証範囲 (c95-B-2 の新規面):
//   1. water + yyyymm=209912 (>=202605) → total_profit = revenue - costs - revenue*0.077
//   2. electric + 同月 → total_profit = revenue - costs (控除なし、water 専用機能)
//   3. road + 同月 → 同上
//   4. detective + 同月 → 同上
//   5. locksmith + 同月 → locksmith 専用式 (元から ELSE 分岐外、影響なし regression)
//
// 注: 月境界 (yyyymm < 202605) ケースは pure-function テスト
//   (test-c95-b-consultant-fee.ts) で 16 件カバー済。本テストは「aggregation 経路で
//   実 SQL が consultant fee を正しく差し引くか」「他業態に副作用ないか」だけ DB 検証。
//   4月以前データ touch を完全回避するため、本テストは 2099-12 のみ使用。

import { Pool } from "@neondatabase/serverless";
import { aggregateMonthlySummary, type BusinessCategory } from "../app/lib/monthlyAggregation";

const TEST_AREA = "kansai";
const TEST_YEAR = 2099;
const TEST_MONTH = 12;
const TEST_DATE = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-15`;

let passed = 0;
let failed = 0;
function check(name: string, actual: number, expected: number) {
  if (actual === expected) { console.log(`  ✅ ${name}: ${actual}`); passed++; }
  else { console.log(`  ❌ ${name}: got ${actual}, expected ${expected}`); failed++; }
}

async function setupCellWithEntry(
  client: import("@neondatabase/serverless").PoolClient,
  category: BusinessCategory,
  data: Record<string, number>,
) {
  await client.query(
    `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date=$3`,
    [TEST_AREA, category, TEST_DATE],
  );
  await client.query(
    `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
    [TEST_AREA, category, TEST_YEAR, TEST_MONTH],
  );
  const entry = { date: TEST_DATE, ...data };
  await client.query(
    `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    [TEST_AREA, category, TEST_DATE, JSON.stringify(entry)],
  );
}
async function cleanup(client: import("@neondatabase/serverless").PoolClient, category: BusinessCategory) {
  await client.query(
    `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date=$3`,
    [TEST_AREA, category, TEST_DATE],
  );
  await client.query(
    `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
    [TEST_AREA, category, TEST_YEAR, TEST_MONTH],
  );
}
async function readTotalProfit(client: import("@neondatabase/serverless").PoolClient, category: BusinessCategory): Promise<number> {
  const { rows } = await client.query(
    `SELECT total_profit FROM monthly_summaries
     WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
    [TEST_AREA, category, TEST_YEAR, TEST_MONTH],
  );
  return rows.length > 0 ? Number(rows[0].total_profit) : -1;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 未設定。export $(grep DATABASE_URL .env.local | xargs) で有効化");
    process.exit(1);
  }
  console.log(`🧪 PR c95-B-2: aggregation consultant fee (water 7.7%) DB 検証`);
  console.log(`   投入先: ${TEST_AREA}/${TEST_YEAR}-${TEST_MONTH} (yyyymm=${TEST_YEAR * 100 + TEST_MONTH} >= 202605、控除対象月)\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    // ── 1. water 業態: 控除が適用される ──────────────────
    //   revenue = 1,000,000、costs = 200000+100000+50000+30000+5000 = 385000
    //   c93-1 式: 1000000 - 385000 = 615000
    //   c95-B-2 控除: -1000000 * 0.077 = -77000 → 538000
    console.log("📋 1. water 業態: consultant fee 7.7% 控除が適用される (538000)");
    await setupCellWithEntry(client, "water", {
      outsourced_sales_revenue: 1000000,
      total_labor_cost: 200000,
      material_cost: 100000,
      ad_cost: 50000,
      sales_outsourcing_cost: 30000,
      card_processing_fee: 5000,
    });
    await aggregateMonthlySummary(TEST_AREA, "water", TEST_YEAR, TEST_MONTH);
    check("water total_profit (615000 - 77000 = 538000)", await readTotalProfit(client, "water"), 538000);
    await cleanup(client, "water");

    // ── 2. electric 業態: 控除されない (water 専用機能、ELSE 分岐) ─
    //   同じ売上・コスト → 615000 (控除なし)
    console.log("\n📋 2. electric 業態: 控除なし (water 専用機能、ELSE 分岐維持で 615000)");
    await setupCellWithEntry(client, "electric", {
      outsourced_sales_revenue: 1000000,
      total_labor_cost: 200000,
      material_cost: 100000,
      ad_cost: 50000,
      sales_outsourcing_cost: 30000,
      card_processing_fee: 5000,
    });
    await aggregateMonthlySummary(TEST_AREA, "electric", TEST_YEAR, TEST_MONTH);
    check("electric total_profit (= 615000、c93-1 式そのまま)", await readTotalProfit(client, "electric"), 615000);
    await cleanup(client, "electric");

    // ── 3. road 業態: 控除されない ──────────────────────
    console.log("\n📋 3. road 業態: 控除なし (ELSE 分岐、615000)");
    await setupCellWithEntry(client, "road", {
      outsourced_sales_revenue: 1000000,
      total_labor_cost: 200000,
      material_cost: 100000,
      ad_cost: 50000,
      sales_outsourcing_cost: 30000,
      card_processing_fee: 5000,
    });
    await aggregateMonthlySummary(TEST_AREA, "road", TEST_YEAR, TEST_MONTH);
    check("road total_profit (= 615000)", await readTotalProfit(client, "road"), 615000);
    await cleanup(client, "road");

    // ── 4. detective 業態: 控除されない ─────────────────
    console.log("\n📋 4. detective 業態: 控除なし (ELSE 分岐、615000)");
    await setupCellWithEntry(client, "detective", {
      outsourced_sales_revenue: 1000000,
      total_labor_cost: 200000,
      material_cost: 100000,
      ad_cost: 50000,
      sales_outsourcing_cost: 30000,
      card_processing_fee: 5000,
    });
    await aggregateMonthlySummary(TEST_AREA, "detective", TEST_YEAR, TEST_MONTH);
    check("detective total_profit (= 615000)", await readTotalProfit(client, "detective"), 615000);
    await cleanup(client, "detective");

    // ── 5. locksmith 業態: 専用分岐 (元から ELSE 外、regression check) ──
    //   revenue=200000, locksmith_construction_cost=50000、他 0
    //   locksmith 式: 200000 - 50000 - 0 - 0 - 0 = 150000 (consultant fee 無関係)
    console.log("\n📋 5. locksmith 業態: 専用分岐維持 (regression、150000)");
    await setupCellWithEntry(client, "locksmith", {
      outsourced_sales_revenue: 200000,
      locksmith_construction_cost: 50000,
    });
    await aggregateMonthlySummary(TEST_AREA, "locksmith", TEST_YEAR, TEST_MONTH);
    check("locksmith total_profit (= 150000、consultant fee 無関係)", await readTotalProfit(client, "locksmith"), 150000);
    await cleanup(client, "locksmith");

    // ── 6. water + 売上 0 円 (異常値ガード regression、controle fee 0 で c93-1 式と同値) ─
    console.log("\n📋 6. water 売上 0 (控除も 0 で c93-1 式と同値、divide-by-zero 類保護)");
    await setupCellWithEntry(client, "water", {
      outsourced_sales_revenue: 0,
      total_labor_cost: 0, material_cost: 0, ad_cost: 0,
      sales_outsourcing_cost: 0, card_processing_fee: 0,
    });
    await aggregateMonthlySummary(TEST_AREA, "water", TEST_YEAR, TEST_MONTH);
    check("water 売上 0 → total_profit = 0", await readTotalProfit(client, "water"), 0);
    await cleanup(client, "water");

    console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} assertions passed`);
    if (failed > 0) process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("❌ エラー:", e); process.exit(1); });
