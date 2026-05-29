// PR c94-C-1 統合テスト: 車両数 + 研修生 基盤 (DB schema + aggregation + targets type) の検証 (5 件)。
//
// 単独実行: npm run test:integration:c94-c-shift-foundation
// (DATABASE_URL を export 必要)
//
// 検証内容:
//   a. schema       : ensureSchema 後 monthly_summaries.trainee_count /
//                     targets.target_trainee_count が存在する
//   b. aggregation  : entries 4 日分 (trainee 3/7/5/50) → 実 aggregateMonthlySummary →
//                     monthly_summaries.trainee_count = 50 (MAX、スナップショット)。
//                     列順ズレ検知のため as_of_day = 25 (MAX day) も同時確認。
//   c. meeting-aggregate: 上旬 (1〜10) の範囲集計 → trainee_count = 7 (day 5,10 のみ。
//                     後続 day 20/25 の大きい値が混入しないこと = 旬範囲フィルタ検証)。
//   d. emptyTargets : emptyTargets().targetTraineeCount === 0
//   e. targets 往復 : upsertTargets({targetTraineeCount: 9}) → getTargets === 9
//
// 投入先: kansai/water/2099-11 (本番影響なし、専用月)。

import { Pool } from "@neondatabase/serverless";
import { aggregateMonthlySummary } from "../app/lib/monthlyAggregation";
import { ensureSchema, getTargets, upsertTargets } from "../app/lib/db";
import { emptyTargets } from "../app/lib/calculations";

const TEST_AREA = "kansai";
const TEST_CATEGORY = "water" as const;
const TEST_YEAR = 2099;
const TEST_MONTH = 11;

let passed = 0;
let failed = 0;

function check(name: string, actual: number, expected: number, tolerance = 0.001) {
  if (Math.abs(actual - expected) <= tolerance) {
    console.log(`  ✅ ${name}: ${actual} (expected ${expected})`);
    passed++;
  } else {
    console.log(`  ❌ ${name}: got ${actual}, expected ${expected}`);
    failed++;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL が設定されていません。export してから実行:");
    console.error("   export $(grep DATABASE_URL .env.local | xargs)");
    process.exit(1);
  }

  console.log(`🧪 PR c94-C-1: 研修生 + 車両数 基盤 検証 (5 件)`);
  console.log(`   投入先: ${TEST_AREA}/${TEST_CATEGORY}/${TEST_YEAR}-${TEST_MONTH}\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  const start = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-01`;
  const end = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-30`;

  const cleanup = async () => {
    await client.query(
      `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date >= $3 AND entry_date <= $4`,
      [TEST_AREA, TEST_CATEGORY, start, end]
    );
    await client.query(
      `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );
    await client.query(
      `DELETE FROM targets WHERE area_id=$1 AND year=$2 AND month=$3 AND COALESCE(business_category,'water')=$4`,
      [TEST_AREA, TEST_YEAR, TEST_MONTH, TEST_CATEGORY]
    );
  };

  const insertEntry = async (day: number, trainee: number) => {
    const date = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const entry = {
      date,
      outsourced_sales_revenue: 100000,
      outsourced_response_count: 1,
      trainee_count: trainee,
    };
    await client.query(
      `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [TEST_AREA, TEST_CATEGORY, date, JSON.stringify(entry)]
    );
  };

  try {
    await ensureSchema();
    await cleanup();

    // ============================================================
    // a. schema 存在確認
    // ============================================================
    console.log(`📋 a. schema: 新カラム存在確認`);
    const { rows: msCol } = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name='monthly_summaries' AND column_name='trainee_count'`
    );
    check("monthly_summaries.trainee_count 存在", msCol.length, 1);
    const { rows: tgtCol } = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name='targets' AND column_name='target_trainee_count'`
    );
    check("targets.target_trainee_count 存在", tgtCol.length, 1);

    // ============================================================
    // b. aggregation MAX (実 aggregateMonthlySummary、列順ズレ検知込み)
    //    day 5/10/20/25 に trainee 3/7/5/50 → 月 MAX = 50、as_of_day = 25
    // ============================================================
    console.log(`\n📋 b. aggregation: 月 MAX (実 aggregateMonthlySummary)`);
    await insertEntry(5, 3);
    await insertEntry(10, 7);
    await insertEntry(20, 5);
    await insertEntry(25, 50);
    await aggregateMonthlySummary(TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH);
    const { rows: ms } = await client.query(
      `SELECT trainee_count, as_of_day FROM monthly_summaries
       WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );
    check("trainee_count = 50 (MAX、スナップショット)", Number(ms[0]?.trainee_count), 50);
    // 列順ズレ検知: trainee_count と as_of_day が入れ替わると as_of_day が崩れる
    check("as_of_day = 25 (列順ズレ検知ガード)", Number(ms[0]?.as_of_day), 25);

    // ============================================================
    // c. meeting-aggregate 旬範囲フィルタ (route.ts の trainee MAX + 旬 WHERE と同等)
    //    上旬 (1〜10) → day 5(3), 10(7) のみ → MAX = 7 (day 20/25 の値は混入しない)
    // ============================================================
    console.log(`\n📋 c. meeting-aggregate: 上旬 (1〜10) 範囲集計`);
    const { rows: period } = await client.query(
      `SELECT COALESCE(MAX(COALESCE((data->>'trainee_count')::int, 0)), 0) AS trainee_count
       FROM entries
       WHERE area_id=$1 AND business_category=$2
         AND entry_date >= MAKE_DATE($3, $4, $5)
         AND entry_date < (MAKE_DATE($3, $4, $6) + INTERVAL '1 day')`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH, 1, 10]
    );
    check("上旬 trainee_count = 7 (旬範囲フィルタ)", Number(period[0]?.trainee_count), 7);

    // ============================================================
    // d. emptyTargets
    // ============================================================
    console.log(`\n📋 d. emptyTargets`);
    check("emptyTargets().targetTraineeCount === 0", emptyTargets().targetTraineeCount, 0);

    // ============================================================
    // e. targets 往復 (upsertTargets → getTargets)
    // ============================================================
    console.log(`\n📋 e. targets 往復 (upsert {targetTraineeCount: 9} → get)`);
    await upsertTargets(
      TEST_AREA, TEST_YEAR, TEST_MONTH,
      { ...emptyTargets(), targetTraineeCount: 9 },
      TEST_CATEGORY
    );
    const t = await getTargets(TEST_AREA, TEST_YEAR, TEST_MONTH, TEST_CATEGORY);
    check("getTargets().targetTraineeCount === 9", t.targetTraineeCount, 9);

    console.log(`\n🧹 cleanup...`);
    await cleanup();

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
