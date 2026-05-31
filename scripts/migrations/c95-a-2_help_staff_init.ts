// PR c95-A-2 マイグレーション: scalar HELP → help_staff 配列の自動移行 (1 回限り)。
//
// 実行: export $(grep DATABASE_URL .env.local | xargs) && npx tsx scripts/migrations/c95-a-2_help_staff_init.ts
//
// 副作用: 2026-04-01 以降の entries で help_count または help_revenue > 0 かつ help_staff 未生成の行に
//   "(不明・自動移行)" 担当者として 1 行ずつ help_staff 配列を追加。scalar (help_count/help_revenue) は
//   残置 (G1 案 b 二重書込との整合)。aggregation 経路は影響なし。
//
// 安全策:
//   - WHERE entry_date >= '2026-04-01' (4 月以前データ touch 禁止、絶対不変)
//   - WHERE NOT (data ? 'help_staff') (冪等性: 既に移行済の行は touch しない)
//   - TRANSACTION ガード: 不整合検知時は ROLLBACK
//   - before/after counts + 4 月以前 unchanged 検証

import { Pool } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 未設定。export $(grep DATABASE_URL .env.local | xargs) で有効化");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    console.log("🔧 c95-A-2 マイグレーション: scalar HELP → help_staff 配列\n");

    // ── BEFORE: 対象範囲 + 4 月以前ガード対象 ─────────────
    const { rows: before } = await client.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE entry_date >= '2026-04-01'
            AND (COALESCE((data->>'help_count')::int, 0) > 0 OR COALESCE((data->>'help_revenue')::numeric, 0) > 0)
            AND NOT (data ? 'help_staff')
        )::int AS pending_migration,
        COUNT(*) FILTER (WHERE entry_date < '2026-04-01')::int AS rows_before_april,
        COUNT(*)::int AS total_entries
      FROM entries
    `);
    const b = before[0];
    console.log("BEFORE:");
    console.log(`  pending_migration (UPDATE 対象) : ${b.pending_migration}`);
    console.log(`  rows_before_april (touch 禁止)  : ${b.rows_before_april}`);
    console.log(`  total_entries                   : ${b.total_entries}`);

    if (b.pending_migration === 0) {
      console.log("\n✅ 移行対象 0 件。何もせず終了。");
      return;
    }

    // ── BEGIN TRANSACTION ────────────────────────────────
    await client.query("BEGIN");
    console.log("\n▶ TRANSACTION 開始");

    try {
      // ── UPDATE ───────────────────────────────────────
      const updateRes = await client.query(`
        UPDATE entries SET data = data || jsonb_build_object(
          'help_staff', jsonb_build_array(jsonb_build_object(
            'staff_name', '(不明・自動移行)',
            'help_sales', COALESCE((data->>'help_revenue')::numeric, 0),
            'help_count', COALESCE((data->>'help_count')::int, 0),
            'help_close_count', 0
          ))
        )
        WHERE entry_date >= '2026-04-01'
          AND (COALESCE((data->>'help_count')::int, 0) > 0
               OR COALESCE((data->>'help_revenue')::numeric, 0) > 0)
          AND NOT (data ? 'help_staff')
      `);
      console.log(`  UPDATE 影響行数: ${updateRes.rowCount}`);

      // ── AFTER: 検証 ──────────────────────────────────
      const { rows: after } = await client.query(`
        SELECT
          COUNT(*) FILTER (
            WHERE entry_date >= '2026-04-01'
              AND (COALESCE((data->>'help_count')::int, 0) > 0 OR COALESCE((data->>'help_revenue')::numeric, 0) > 0)
              AND NOT (data ? 'help_staff')
          )::int AS pending_migration,
          COUNT(*) FILTER (WHERE entry_date < '2026-04-01')::int AS rows_before_april,
          COUNT(*)::int AS total_entries,
          COUNT(*) FILTER (WHERE data ? 'help_staff' AND entry_date >= '2026-04-01')::int AS rows_with_help_staff_post
        FROM entries
      `);
      const a = after[0];

      // 整合性チェック
      if (a.rows_before_april !== b.rows_before_april) {
        throw new Error(`❌ 4 月以前データに変動を検知 (${b.rows_before_april} → ${a.rows_before_april})。ROLLBACK。`);
      }
      if (a.total_entries !== b.total_entries) {
        throw new Error(`❌ entries 総数に変動を検知 (${b.total_entries} → ${a.total_entries})。ROLLBACK。`);
      }
      if (a.pending_migration !== 0) {
        throw new Error(`❌ pending_migration が 0 にならず (${a.pending_migration})。ROLLBACK。`);
      }
      if ((updateRes.rowCount ?? 0) !== b.pending_migration) {
        throw new Error(`❌ UPDATE 影響行数 (${updateRes.rowCount}) ≠ before pending_migration (${b.pending_migration})。ROLLBACK。`);
      }

      await client.query("COMMIT");
      console.log("\n✅ TRANSACTION COMMIT 完了");

      console.log("\nAFTER:");
      console.log(`  pending_migration               : ${a.pending_migration} (期待: 0)`);
      console.log(`  rows_before_april (unchanged)   : ${a.rows_before_april} (期待: ${b.rows_before_april})`);
      console.log(`  total_entries                   : ${a.total_entries} (期待: ${b.total_entries})`);
      console.log(`  rows_with_help_staff_post       : ${a.rows_with_help_staff_post}`);

      console.log("\n📊 結果サマリ:");
      console.log(`  移行行数: ${updateRes.rowCount} 行 (rows_pending_migration ${b.pending_migration} → 0)`);
      console.log(`  4 月以前データ: ${b.rows_before_april} 行 (変動なし、絶対不変ガード OK)`);
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("\n❌ ROLLBACK 実行:", e);
      throw e;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ エラー:", e);
  process.exit(1);
});
