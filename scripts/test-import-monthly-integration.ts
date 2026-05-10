// 単独実行: npm run test:integration:import-monthly
//
// 2 段階の検証で PR #38 のような「INSERT 文への列追加忘れ」バグを再発
// させない:
//
//   段階 1 (静的): app/api/import-monthly/route.ts のソースを文字列と
//     して読み込み、新 15 列が以下 3 セクションすべてに含まれているか
//     検証。これにより「3 ヶ所のうち 1 ヶ所だけ書き忘れ」も即検出。
//     - INSERT カラム名リスト
//     - VALUES の pick() 呼び出し
//     - ON CONFLICT DO UPDATE SET
//
//   段階 2 (統合): DB に直接 INSERT して 38 列が保存できることを検証
//     (スキーマ整合性のテスト)。
//
// 静的テストだけでは「DB スキーマ追従漏れ」を検出できず、統合テスト
// だけでは「route.ts INSERT 列抜け」を検出できないため、両方が必要。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool } from "@neondatabase/serverless";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROUTE_PATH = join(__dirname, "..", "app", "api", "import-monthly", "route.ts");

// PR #38 で追加された新 15 列。route.ts INSERT 文に含まれていることを
// 静的・統合の両面で確認する。
const PR38_NEW_COLUMNS = [
  // ① 新規対応 (7)
  "outsourced_sales_revenue", "internal_staff_revenue",
  "outsourced_response_count", "internal_staff_response_count",
  "repeat_count", "revisit_count", "review_count",
  // ② コスト (4)
  "total_labor_cost", "material_cost", "sales_outsourcing_cost", "card_processing_fee",
  // ④ 施工 (4)
  "outsourced_construction_count", "internal_construction_count",
  "outsourced_construction_cost", "internal_construction_profit",
];

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(desc: string, cond: boolean, hint?: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`❌ ${desc}${hint ? ` — ${hint}` : ""}`);
    console.error(`❌ ${desc}${hint ? ` — ${hint}` : ""}`);
  }
}

// ============================================================
// 段階 1: 静的テスト (route.ts ソース解析)
// ============================================================

function runStaticTests() {
  console.log("📜 段階 1: 静的テスト — route.ts INSERT 文に新 15 列が含まれているか\n");

  const src = readFileSync(ROUTE_PATH, "utf8");

  // INSERT 句全体を 3 セクションに分割
  // 1. INSERT カラム名リスト: "INSERT INTO monthly_summaries (" から ") VALUES (" まで
  // 2. VALUES: ") VALUES (" から ") ON CONFLICT" まで
  // 3. ON CONFLICT DO UPDATE SET: "DO UPDATE SET" から閉じバッククォート ` まで
  const insertMatch = src.match(/INSERT INTO monthly_summaries\s*\(([\s\S]+?)\)\s*VALUES\s*\(([\s\S]+?)\)\s*ON CONFLICT[\s\S]+?DO UPDATE SET([\s\S]+?)`/);

  if (!insertMatch) {
    check("INSERT 句 3 セクションの抽出", false, "route.ts から INSERT/VALUES/ON CONFLICT パターンが見つからない");
    return;
  }
  check("INSERT 句 3 セクションの抽出", true);

  const [, insertColsSection, valuesSection, onConflictSection] = insertMatch;

  // 各列について 3 セクションすべてに含まれているか個別に検証
  for (const col of PR38_NEW_COLUMNS) {
    // セクション 1: INSERT カラム名リスト (列名がカンマ/改行/空白に囲まれて出現)
    const inInsertList = new RegExp(`(^|\\s|,)${col}(\\s|,|$)`).test(insertColsSection);
    check(
      `INSERT カラム名リストに "${col}" が含まれる`,
      inInsertList,
      "route.ts の INSERT INTO ... (...) 部分に列名追加が必要"
    );

    // セクション 2: VALUES の pick() 呼び出し (pick(row, "<col>" ...) の形)
    const inValues = new RegExp(`pick\\(row,\\s*"${col}"`).test(valuesSection);
    check(
      `VALUES に pick(row, "${col}", ...) が含まれる`,
      inValues,
      "VALUES 句の pick() に新列を追加する必要"
    );

    // セクション 3: ON CONFLICT DO UPDATE SET (col=EXCLUDED.col の形)
    const inOnConflict = new RegExp(`${col}\\s*=\\s*EXCLUDED\\.${col}`).test(onConflictSection);
    check(
      `ON CONFLICT DO UPDATE SET に "${col}=EXCLUDED.${col}" が含まれる`,
      inOnConflict,
      "ON CONFLICT 句に EXCLUDED.<列名> を追加する必要"
    );
  }

  console.log(`   3 セクション × ${PR38_NEW_COLUMNS.length} 列 = ${PR38_NEW_COLUMNS.length * 3} 静的アサーション\n`);
}

// ============================================================
// 段階 2: 統合テスト (DB INSERT → SELECT 検証)
// ============================================================

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

async function runIntegrationTests() {
  console.log("🧪 段階 2: 統合テスト — DB が新 15 列を含む全 38 列を保存できるか");
  console.log(`   投入先: ${TEST_AREA}/${TEST_CATEGORY}/${TEST_YEAR}-${TEST_MONTH}\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {

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

    check("INSERT 後の SELECT で行数 = 1", r.rows.length === 1, `got ${r.rows.length}`);
    if (r.rows.length === 1) {
      const row = r.rows[0];
      for (const col of cols) {
        const expected = TEST_VALUES[col];
        const actualRaw = row[col];
        const actual = typeof actualRaw === "string" ? Number(actualRaw) : Number(actualRaw);
        check(`列 "${col}" が ${expected} で保存される`, Math.abs(actual - expected) < 0.01, `got ${actual}`);
      }
    }

    // クリーンアップ
    await client.query(
      `DELETE FROM monthly_summaries WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
      [TEST_AREA, TEST_CATEGORY, TEST_YEAR, TEST_MONTH]
    );
    console.log(`🧹 クリーンアップ完了 (テストレコード削除)\n`);
  } catch (e) {
    fail++;
    failures.push(`❌ 統合テスト例外: ${e instanceof Error ? e.message : String(e)}`);
    console.error("❌ Error:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  runStaticTests();
  await runIntegrationTests();

  const total = pass + fail;
  console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${total} assertions passed`);
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
