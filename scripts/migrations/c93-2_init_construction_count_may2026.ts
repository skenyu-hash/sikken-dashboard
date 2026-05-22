// PR c93-2 migration: 2026 年 5 月の monthly_summaries.construction_count を新仕様 (対応ベース)
//   で再集計し、5月既存データを旧 outsourced + internal の sum で初期化する。
//
// 実行: npm run migrate:c93-2-may2026 [-- --dry]
// 直接: npx tsx scripts/migrations/c93-2_init_construction_count_may2026.ts [--dry]
//
// 設計:
//   - WHERE year=2026 AND month=5 で 5 月限定 (4 月以前データ完全保護)
//   - 各 (area_id, business_category) ごとに aggregateMonthlySummary を呼出
//   - aggregation 内の COALESCE chain により:
//     旧 5月 entries (construction_count キー未保存) → outsourced + internal で fallback 集計
//     → monthly_summaries.construction_count に書き込み
//   - 1 件失敗しても他は継続。最後にサマリ表示
//   - --dry: 対象セル一覧 + 旧 construction_count を表示するだけで UPDATE しない
//
// 絶対不変:
//   - entries テーブルは SELECT のみ (aggregation の SUM ソース)、書き込みなし
//   - 4 月以前データは WHERE 句で完全除外
//   - 旧 outsourced_construction_count / internal_construction_count カラムは保持
//   - AUTOSAVE_DISABLED_C89_P1 等のフラグ参照なし
//
// 実行タイミング:
//   PR c93-2 マージ + Vercel deploy 完了後、反/Kenyu さんが手動実行。
//   1. npm run migrate:c93-2-may2026 -- --dry  (対象セル + 旧 construction_count 確認)
//   2. npm run migrate:c93-2-may2026           (本実行、construction_count 初期化)
//   3. /dashboard で工事取得率が 100% 以下に収まることを視覚検証

import { Pool } from "@neondatabase/serverless";
import { aggregateMonthlySummary, type BusinessCategory } from "../../app/lib/monthlyAggregation";

const TARGET_YEAR = 2026;
const TARGET_MONTH = 5;
const isDryRun = process.argv.includes("--dry");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not set. export $(grep DATABASE_URL .env.local | xargs) してから実行してください");
    process.exit(1);
  }

  console.log(`🧪 c93-2 migration: re-aggregate ${TARGET_YEAR}-${TARGET_MONTH} ${isDryRun ? "(DRY RUN)" : ""}`);
  console.log(`   範囲: WHERE year=${TARGET_YEAR} AND month=${TARGET_MONTH} (4 月以前完全保護)`);
  console.log(`   新仕様: monthly_summaries.construction_count を対応ベースで初期化`);
  console.log(`           旧 5月 entries (construction_count キー未保存) は outsourced+internal で fallback\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // 対象セル列挙 (year/month 二重ガード)
    const { rows } = await client.query(
      `SELECT area_id, business_category,
              construction_count AS old_construction_count,
              outsourced_construction_count, internal_construction_count
         FROM monthly_summaries
        WHERE year = $1 AND month = $2
        ORDER BY business_category, area_id`,
      [TARGET_YEAR, TARGET_MONTH]
    );

    console.log(`📋 対象セル: ${rows.length} 件`);
    if (rows.length === 0) {
      console.log("   → 対象なし (monthly_summaries に 2026-05 行なし)、終了");
      return;
    }

    if (isDryRun) {
      console.log("\n--- DRY RUN: 以下のセルを再集計予定 ---");
      for (const r of rows) {
        const oc = Number(r.outsourced_construction_count);
        const ic = Number(r.internal_construction_count);
        const expectedFallback = oc + ic;
        console.log(`  ${r.business_category}/${r.area_id}  old construction_count=${r.old_construction_count} (期待 fallback = outsourced ${oc} + internal ${ic} = ${expectedFallback})`);
      }
      console.log("\n本実行: npm run migrate:c93-2-may2026 (--dry なし)");
      return;
    }

    // 本実行: 逐次に aggregateMonthlySummary を呼出
    let ok = 0, err = 0;
    for (const r of rows) {
      const cellLabel = `${r.business_category}/${r.area_id}`;
      try {
        await aggregateMonthlySummary(
          String(r.area_id),
          String(r.business_category) as BusinessCategory,
          TARGET_YEAR, TARGET_MONTH,
        );
        const { rows: after } = await client.query(
          `SELECT construction_count FROM monthly_summaries
            WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
          [r.area_id, r.business_category, TARGET_YEAR, TARGET_MONTH]
        );
        const newCount = after.length > 0 ? after[0].construction_count : null;
        console.log(`  ✅ ${cellLabel}: construction_count ${r.old_construction_count} → ${newCount}`);
        ok++;
      } catch (e) {
        console.error(`  ❌ ${cellLabel}: ${e instanceof Error ? e.message : String(e)}`);
        err++;
      }
    }
    console.log(`\n結果: ${ok} 件成功 / ${err} 件失敗 / 計 ${rows.length} 件`);
    if (err > 0) {
      console.log("   失敗セルは個別に再実行可能 (aggregateMonthlySummary は idempotent UPSERT)");
      process.exit(1);
    }
    console.log("✅ migration 完了。次は /dashboard で工事取得率を視覚検証してください (100% 以下に収まる想定)。");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ migration エラー:", e);
  process.exit(1);
});
