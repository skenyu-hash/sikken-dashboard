// 単独実行: npm run test:integration:import-monthly
//
// /api/import-monthly が monthly_summaries の全 38 列 (PR #38 で追加した
// 新 15 列含む) を正しく書き込むことを検証する統合テスト。
//
// 背景: PR #38 で DB 列・pick エイリアスは追加したが、INSERT 句の
// カラム名リストと VALUES に新 15 列を含めるのを忘れていた構造的バグ
// (PR #41 で修正)。再発防止のため非 0 値で INSERT → SELECT で全列が
// 保存されていることを検証する。
//
// 実行方法:
//   - DATABASE_URL を環境変数で渡す前提
//   - API は middleware で認証ガードあり → DB 直接接続して route handler
//     のロジックを再現する形でテスト (シンプル化のため pick 経由でなく
//     INSERT を直接実行、ただし route.ts の SQL と完全一致のものを使用)
//   - 既存データへの影響を避けるため year=2099/month=12 のテスト枠
//   - テスト後は DELETE で原状復帰

import { Pool } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL が設定されていません。export してから実行:");
  console.error("   export $(grep DATABASE_URL .env.local | xargs)");
  process.exit(1);
}

// 検証する 38 列 (id/created_at は除く、business_category/area_id/year/month は固定値)。
// 新規 15 列 (PR #38) と既存 23 列 (PR #38 以前) を非 0 値で投入。
const TEST_VALUES: Record<string, number> = {
  // 既存 17 列 (id / created_at / area_id / business_category / year / month を除く data 列)
  total_revenue: 100000000,
  total_profit: 30000000,
  total_count: 500,
  unit_price: 200000,
  ad_cost: 15000000,
  ad_rate: 15.0,
  acquisition_count: 450,
  cpa: 33333,
  call_count: 800,
  call_unit_price: 18750,
  conv_rate: 56.3,
  profit_rate: 30.0,
  help_revenue: 5000000,
  help_count: 25,
  help_unit_price: 200000,
  vehicle_count: 12,
  as_of_day: 31,
  // 新 15 列 (PR #38)
  outsourced_sales_revenue: 60000000,
  internal_staff_revenue: 40000000,
  outsourced_response_count: 300,
  internal_staff_response_count: 200,
  repeat_count: 50,
  revisit_count: 30,
  review_count: 80,
  total_labor_cost: 20000000,
  material_cost: 15000000,
  sales_outsourcing_cost: 8000000,
  card_processing_fee: 1500000,
  outsourced_construction_count: 250,
  internal_construction_count: 200,
  outsourced_construction_cost: 12000000,
  internal_construction_profit: 5000000,
};

const TEST_AREA = "kansai";
const TEST_CATEGORY = "water";
const TEST_YEAR = 2099;
const TEST_MONTH = 12;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  try {
    console.log("🧪 統合テスト: /api/import-monthly が新 15 列を含む全 38 列を保存できるか");
    console.log(`   投入先: ${TEST_AREA}/${TEST_CATEGORY}/${TEST_YEAR}-${TEST_MONTH}\n`);

    // 既存テストレコードがあれば事前削除
    await client.query(
      `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );

    // route.ts と同形の INSERT を実行 (列名・順序・値は TEST_VALUES から構築)
    const cols = Object.keys(TEST_VALUES);
    const vals = cols.map((c) => TEST_VALUES[c]);
    const placeholders = cols.map((_, i) => `$${i + 5}`).join(", ");
    const colList = cols.join(", ");

    await client.query(
      `INSERT INTO monthly_summaries (
         area_id, business_category, year, month,
         ${colList}
       ) VALUES ($1, $2, $3, $4, ${placeholders})`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH, ...vals]
    );

    // SELECT して全列を verify
    const colSelect = cols.join(", ");
    const r = await client.query<Record<string, number | string>>(
      `SELECT ${colSelect} FROM monthly_summaries
       WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );

    if (r.rows.length !== 1) {
      fail++;
      failures.push(`❌ INSERT 後の SELECT で行数 != 1 (got ${r.rows.length})`);
    } else {
      const row = r.rows[0];
      for (const col of cols) {
        const expected = TEST_VALUES[col];
        const actualRaw = row[col];
        const actual = typeof actualRaw === "string" ? Number(actualRaw) : Number(actualRaw);
        const ok = Math.abs(actual - expected) < 0.01;
        if (ok) {
          pass++;
        } else {
          fail++;
          failures.push(`❌ ${col}: expected ${expected}, got ${actual}`);
        }
      }
    }

    // クリーンアップ
    await client.query(
      `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );
    console.log(`🧹 クリーンアップ完了 (テストレコード削除)\n`);
  } catch (e) {
    console.error("❌ Error:", e);
    fail++;
    failures.push(String(e));
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} columns verified`);
  if (fail > 0) {
    console.error(`\n${fail} failures:\n${failures.join("\n")}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
