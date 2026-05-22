// PR c93-2 統合テスト: 対応ベース工事件数 (construction_count) の検証。
//
// 単独実行: npm run test:integration:c93-2-construction-count
// (DATABASE_URL を export 必要)
//
// 検証内容:
//   旧仕様: 工事件数 = outsourced_construction_count + internal_construction_count (発注ベース合算)
//   新仕様: 工事件数 = construction_count (対応1件=工事1件、10万円以上)
//
// aggregation の COALESCE chain:
//   COALESCE(
//     (data->>'construction_count')::numeric,                       -- 新形式優先
//     outsourced_construction_count + internal_construction_count   -- 旧形式 fallback
//   )
//
// テストケース:
//   1. 新規 entries (construction_count=10 のみ、outsourced/internal キー無し)
//      → sum_construction_count = 10
//   2. 旧 entries (construction_count キー無し、outsourced=3, internal=2)
//      → sum_construction_count = 5 (fallback)
//   3. 混在月 (1 日目=旧形式 oc=3, ic=2、2 日目=新形式 cc=10)
//      → sum_construction_count = 5 + 10 = 15
//   4. 自社工事比率 (ロジック検証、useFormCalculations 経由ではなく単体計算)
//      construction_count=10, internal_construction_count=3 → ratio=30%
//
// 投入先: kansai/2099-04 (テスト専用、4 月以前 area だが 2099 年なので本番影響なし)

import { Pool } from "@neondatabase/serverless";
import { aggregateMonthlySummary, type BusinessCategory } from "../app/lib/monthlyAggregation";

const TEST_AREA = "kansai";
const TEST_CATEGORY: BusinessCategory = "water";
const TEST_YEAR = 2099;
const TEST_MONTH = 4;

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

async function cleanup(client: import("@neondatabase/serverless").PoolClient) {
  await client.query(
    `DELETE FROM entries WHERE area_id=$1 AND business_category=$2 AND entry_date >= $3 AND entry_date <= $4`,
    [TEST_AREA, TEST_CATEGORY, `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-01`, `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-30`]
  );
  await client.query(
    `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
    [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
  );
}

async function insertEntry(
  client: import("@neondatabase/serverless").PoolClient,
  day: number,
  data: Record<string, number>,
) {
  const date = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const entry = {
    date,
    // 旧 DailyEntry 必須フィールド (全 0)
    totalCount: 0, constructionCount: 0,
    selfRevenue: 0, selfProfit: 0, selfCount: 0,
    newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
    addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
    ...data,
  };
  await client.query(
    `INSERT INTO entries (area_id, business_category, entry_date, data, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    [TEST_AREA, TEST_CATEGORY, date, JSON.stringify(entry)]
  );
}

async function readConstructionCount(client: import("@neondatabase/serverless").PoolClient): Promise<number> {
  const { rows } = await client.query(
    `SELECT construction_count FROM monthly_summaries
     WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
    [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
  );
  return rows.length > 0 ? Number(rows[0].construction_count) : -1;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL が設定されていません。");
    process.exit(1);
  }

  console.log(`🧪 PR c93-2: 対応ベース工事件数 検証\n`);
  console.log(`   投入先: ${TEST_AREA}/${TEST_CATEGORY}/${TEST_YEAR}-${String(TEST_MONTH).padStart(2, "0")} (テスト専用、本番影響なし)\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // -------------------------------------------------------------
    // CASE 1: 新規 entries (construction_count=10、outsourced/internal キー無し)
    // -------------------------------------------------------------
    console.log(`📋 CASE 1: 新規 entries (construction_count=10、旧キーなし)`);
    await cleanup(client);
    await insertEntry(client, 5, { construction_count: 10 });
    await aggregateMonthlySummary(TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH);
    const cc1 = await readConstructionCount(client);
    check("sum_construction_count = 10 (新形式優先)", cc1, 10);

    // -------------------------------------------------------------
    // CASE 2: 旧 entries (construction_count キー無し、outsourced=3, internal=2)
    // -------------------------------------------------------------
    console.log(`\n📋 CASE 2: 旧 entries (outsourced=3, internal=2、construction_count なし)`);
    await cleanup(client);
    await insertEntry(client, 5, {
      outsourced_construction_count: 3,
      internal_construction_count: 2,
    });
    await aggregateMonthlySummary(TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH);
    const cc2 = await readConstructionCount(client);
    check("sum_construction_count = 5 (fallback: outsourced+internal)", cc2, 5);

    // -------------------------------------------------------------
    // CASE 3: 混在月 (旧形式 1 日 + 新形式 1 日)
    // -------------------------------------------------------------
    console.log(`\n📋 CASE 3: 混在月 (5日=旧 oc=3 ic=2、10日=新 cc=10)`);
    await cleanup(client);
    await insertEntry(client, 5, {
      outsourced_construction_count: 3,
      internal_construction_count: 2,
    });
    await insertEntry(client, 10, {
      construction_count: 10,
    });
    await aggregateMonthlySummary(TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH);
    const cc3 = await readConstructionCount(client);
    check("sum_construction_count = 15 (= 5 fallback + 10 新形式)", cc3, 15);

    // -------------------------------------------------------------
    // CASE 4: 自社工事比率 (ロジック検証、useFormCalculations 同等の単体計算)
    // -------------------------------------------------------------
    console.log(`\n📋 CASE 4: 自社工事比率 (construction_count=10, internal_construction_count=3 → 30%)`);
    const constructionCount = 10;
    const internalConstructionCount = 3;
    const ratio = constructionCount > 0
      ? (internalConstructionCount / constructionCount) * 100
      : 0;
    check("自社工事比率 = 30% (3/10*100)", ratio, 30);

    // 分母 0 のエッジケース
    const ratio0 = 0 > 0
      ? (internalConstructionCount / 0) * 100
      : 0;
    check("自社工事比率 = 0% (分母 0 で NaN/Infinity 回避)", ratio0, 0);

    await cleanup(client);

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
