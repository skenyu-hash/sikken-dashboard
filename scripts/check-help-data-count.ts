// 一回限り運用クエリ: c95-A-2 マイグレーション要否判定のための HELP データ件数確認 (READ ONLY)。
//
// 実行: export $(grep DATABASE_URL .env.local | xargs) && npx tsx scripts/check-help-data-count.ts
//
// 副作用なし: SELECT のみ、UPDATE/INSERT/DELETE 一切なし。
// 結果に応じてマイグレーション SQL (entry_date >= '2026-04-01' ガード付き) の実行要否を判断。

import { Pool } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 未設定。export $(grep DATABASE_URL .env.local | xargs) で有効化");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    console.log("🔎 HELP データ件数確認 (READ ONLY)\n");

    // A. entries.data に help_count または help_revenue が入っている件数
    const { rows: a } = await client.query(`
      SELECT
        COUNT(*)::int AS rows_with_help,
        COUNT(*) FILTER (WHERE COALESCE((data->>'help_count')::int, 0) > 0)::int    AS rows_help_count_gt0,
        COUNT(*) FILTER (WHERE COALESCE((data->>'help_revenue')::numeric, 0) > 0)::int AS rows_help_revenue_gt0,
        MIN(entry_date) AS earliest,
        MAX(entry_date) AS latest
      FROM entries
      WHERE (data ? 'help_count' OR data ? 'help_revenue')
    `);
    console.log("A. entries テーブル (data に help_count / help_revenue を持つ行):");
    console.log(`   rows_with_help        : ${a[0].rows_with_help}`);
    console.log(`   rows_help_count_gt0   : ${a[0].rows_help_count_gt0}`);
    console.log(`   rows_help_revenue_gt0 : ${a[0].rows_help_revenue_gt0}`);
    console.log(`   earliest              : ${a[0].earliest}`);
    console.log(`   latest                : ${a[0].latest}`);

    // 2026/4 以降の件数 (マイグレ対象範囲、entry_date >= '2026-04-01' ガード)
    const { rows: a2 } = await client.query(`
      SELECT
        COUNT(*)::int AS rows_with_help_2026q2plus,
        COUNT(*) FILTER (WHERE NOT (data ? 'help_staff'))::int AS rows_pending_migration
      FROM entries
      WHERE entry_date >= '2026-04-01'
        AND (COALESCE((data->>'help_count')::int, 0) > 0
             OR COALESCE((data->>'help_revenue')::numeric, 0) > 0)
    `);
    console.log("\nA2. マイグレ対象範囲 (entry_date >= '2026-04-01'):");
    console.log(`   rows_with_help_2026q2plus : ${a2[0].rows_with_help_2026q2plus}`);
    console.log(`   rows_pending_migration    : ${a2[0].rows_pending_migration}  (= help_staff 未生成、UPDATE 対象)`);

    // B. monthly_summaries 側で help が乗っている件数 (参考)
    const { rows: b } = await client.query(`
      SELECT COUNT(*)::int AS rows_with_help_in_summary
      FROM monthly_summaries
      WHERE help_count > 0 OR help_revenue > 0
    `);
    console.log("\nB. monthly_summaries テーブル (参考、help_count/revenue > 0 の行):");
    console.log(`   rows_with_help_in_summary : ${b[0].rows_with_help_in_summary}`);

    console.log("\n判断指標 (c95-A-2 Step 1 提案より):");
    console.log("  rows_pending_migration = 0 件     → マイグレ不要");
    console.log("  rows_pending_migration = 1〜10 件 → UPDATE 1 回手動実行");
    console.log("  rows_pending_migration = 11+ 件   → UPDATE 実行 (任意で再 aggregation)");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
