// PR c91 統合テスト: user の本番再現シナリオを検証
//
// 単独実行: npm run test:integration:c91-edge-case
// (DATABASE_URL を export 必要)
//
// 検証内容:
//   1. monthly_summaries に必要な UNIQUE INDEX が存在することを確認 (c91 修正の核)
//   2. ensureSchema が冪等であることを再確認 (複数回呼んでも壊れない)
//   3. user の本番再現シナリオ:
//      - entries に 1 行のみ (outsourced_sales_revenue=1、他 0)
//      - aggregateMonthlySummary 呼び出し
//      - monthly_summaries に 1 行 INSERT され、total_revenue=1 になることを確認
//   4. ON CONFLICT が正常動作: 同じ aggregation を 2 回呼んで UPDATE 経路を検証
//   5. cleanup

import { Pool } from "@neondatabase/serverless";
import { ensureSchema } from "../app/lib/db";
import { aggregateMonthlySummary } from "../app/lib/monthlyAggregation";

const TEST_AREA = "kansai";
const TEST_CATEGORY = "water" as const;
const TEST_YEAR = 2099;
const TEST_MONTH = 5;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}${detail ? ` (${detail})` : ""}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` (${detail})` : ""}`);
    failed++;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL が設定されていません。");
    process.exit(1);
  }

  console.log(`🧪 PR c91: aggregation edge-case 検証 (user 本番再現)\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // -------------------------------------------------------------
    // STEP 1: ensureSchema を呼び、UNIQUE INDEX が作成されることを確認 (Fix A)
    // -------------------------------------------------------------
    console.log(`📋 STEP 1: ensureSchema が UNIQUE INDEX を作成`);
    await ensureSchema();

    const indexRes = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'monthly_summaries'
        AND indexname = 'monthly_summaries_area_cat_year_month_key'
    `);
    check("UNIQUE INDEX monthly_summaries_area_cat_year_month_key 存在", indexRes.rows.length === 1);

    const colRes = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'monthly_summaries' AND column_name IN ('source', 'updated_at')
    `);
    check("source + updated_at 列存在", colRes.rows.length === 2,
      `found: ${colRes.rows.map(r => r.column_name).join(', ')}`);

    // -------------------------------------------------------------
    // STEP 2: ensureSchema 冪等性 (2 回目呼出が壊れない)
    // -------------------------------------------------------------
    console.log(`\n📋 STEP 2: ensureSchema 冪等性`);
    await ensureSchema();
    check("ensureSchema 2 回目呼出が例外なく完了", true);

    // -------------------------------------------------------------
    // STEP 3: user の本番再現 — 単一フィールド単一行 aggregation
    // -------------------------------------------------------------
    console.log(`\n📋 STEP 3: user 再現シナリオ (outsourced_sales_revenue=1 のみ、他 0)`);

    // cleanup 既存テストデータ
    await client.query(
      `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date >= $3 AND entry_date <= $4`,
      [TEST_AREA, TEST_CATEGORY, `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-01`,
        `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-31`]
    );
    await client.query(
      `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );

    // user 再現: 5/1 の entries に outsourced_sales_revenue=1 だけが入った行を INSERT
    const userEntry = {
      date: `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-01`,
      // 旧 DailyEntry 必須 (全 0)
      totalCount: 0, constructionCount: 0,
      selfRevenue: 0, selfProfit: 0, selfCount: 0,
      newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
      addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
      // c90-2 新フィールド: 業務委託売上 = 1 のみ、他は省略 (JSONB に absent → aggregation で 0 扱い)
      outsourced_sales_revenue: 1,
    };
    await client.query(
      `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [TEST_AREA, TEST_CATEGORY, userEntry.date, JSON.stringify(userEntry)]
    );

    // aggregation 実行 — これが c91 で修正すべき動作
    let aggError: Error | null = null;
    try {
      await aggregateMonthlySummary(TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH);
    } catch (e) {
      aggError = e instanceof Error ? e : new Error(String(e));
    }
    check("aggregateMonthlySummary が例外なく完了", aggError === null,
      aggError ? aggError.message : "");

    // monthly_summaries に 1 行 INSERT されたことを確認
    const msRes = await client.query(
      `SELECT total_revenue, source, as_of_day FROM monthly_summaries
       WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );
    check("monthly_summaries に 1 行存在", msRes.rows.length === 1);

    if (msRes.rows.length === 1) {
      const row = msRes.rows[0];
      check("total_revenue = 1", Number(row.total_revenue) === 1,
        `actual: ${row.total_revenue}`);
      check("source = 'entries_aggregation'", row.source === "entries_aggregation",
        `actual: ${row.source}`);
      check("as_of_day = 1", Number(row.as_of_day) === 1, `actual: ${row.as_of_day}`);
    }

    // -------------------------------------------------------------
    // STEP 4: ON CONFLICT UPDATE 経路の検証
    // -------------------------------------------------------------
    console.log(`\n📋 STEP 4: ON CONFLICT UPDATE 経路`);

    // 同じ aggregation を再実行 → UPSERT で UPDATE 側に分岐するはず
    let agg2Error: Error | null = null;
    try {
      await aggregateMonthlySummary(TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH);
    } catch (e) {
      agg2Error = e instanceof Error ? e : new Error(String(e));
    }
    check("aggregateMonthlySummary 2 回目 (UPDATE) が例外なく完了", agg2Error === null,
      agg2Error ? agg2Error.message : "");

    const ms2Res = await client.query(
      `SELECT COUNT(*) as cnt FROM monthly_summaries
       WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );
    check("UPSERT 後も 1 行のみ (重複 INSERT なし)", Number(ms2Res.rows[0].cnt) === 1);

    // -------------------------------------------------------------
    // STEP 5: 2 日目の entry 追加 → 累積が正しく SUM される
    // -------------------------------------------------------------
    console.log(`\n📋 STEP 5: 2 日目追加 → 累積 SUM`);

    const day2Entry = {
      date: `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-02`,
      totalCount: 0, constructionCount: 0,
      selfRevenue: 0, selfProfit: 0, selfCount: 0,
      newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
      addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
      outsourced_sales_revenue: 999, // 1 + 999 = 1000 になるはず
    };
    await client.query(
      `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [TEST_AREA, TEST_CATEGORY, day2Entry.date, JSON.stringify(day2Entry)]
    );

    await aggregateMonthlySummary(TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH);

    const ms3Res = await client.query(
      `SELECT total_revenue, as_of_day FROM monthly_summaries
       WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );
    if (ms3Res.rows.length === 1) {
      check("total_revenue = 1000 (1 + 999 = SUM)", Number(ms3Res.rows[0].total_revenue) === 1000,
        `actual: ${ms3Res.rows[0].total_revenue}`);
      check("as_of_day = 2 (MAX(day))", Number(ms3Res.rows[0].as_of_day) === 2,
        `actual: ${ms3Res.rows[0].as_of_day}`);
    }

    // -------------------------------------------------------------
    // cleanup
    // -------------------------------------------------------------
    console.log(`\n🧹 cleanup...`);
    await client.query(
      `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date >= $3 AND entry_date <= $4`,
      [TEST_AREA, TEST_CATEGORY, `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-01`,
        `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-31`]
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
