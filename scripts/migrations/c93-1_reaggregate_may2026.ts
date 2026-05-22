// PR c93-1 migration: 2026 年 5 月の monthly_summaries.total_profit を新仕様 (内製化
//   ボーナス加算撤去 = f30 単独) で再集計する。
//
// 実行: npm run migrate:c93-1-may2026 [-- --dry]
// 直接: npx tsx scripts/migrations/c93-1_reaggregate_may2026.ts [--dry]
//
// 設計 (Q3=a 採用、逐次実行で各 cell 独立):
//   - WHERE year=2026 AND month=5 で 5 月限定 (4 月以前データ完全保護)
//   - 各 (area_id, business_category) ごとに aggregateMonthlySummary を呼出
//     → 内部で entries.data SUM + 派生計算 (新仕様) + UPSERT
//     → source タグも 'entries_aggregation' に更新
//   - 1 件失敗しても他は継続。最後にサマリ表示
//   - --dry: 対象セル一覧 + old total_profit を表示するだけで UPDATE しない
//
// 絶対不変:
//   - entries テーブルは SELECT のみ (aggregation の SUM ソース)、書き込みなし
//   - 4 月以前データは WHERE 句で完全除外
//   - 他月 (2026-06 以降 / 2025-12 以前) は対象外
//   - AUTOSAVE_DISABLED_C89_P1 等のフラグ参照なし
//
// 実行タイミング:
//   PR c93-1 マージ + Vercel deploy 完了後、反/Kenyu さんが手動実行。
//   1. npm run migrate:c93-1-may2026 -- --dry  (対象セル数 + 旧 total_profit 確認)
//   2. npm run migrate:c93-1-may2026           (本実行)
//   3. /dashboard で値変化を視覚検証

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

  console.log(`🧪 c93-1 migration: re-aggregate ${TARGET_YEAR}-${TARGET_MONTH} ${isDryRun ? "(DRY RUN)" : ""}`);
  console.log(`   範囲: WHERE year=${TARGET_YEAR} AND month=${TARGET_MONTH} (4 月以前完全保護)`);
  console.log(`   新仕様: total_profit = revenue - costs (内製化ボーナス加算なし、f30 単独)\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // 対象セル列挙 (year/month の二重ガード、4 月以前は WHERE で完全除外)
    const { rows } = await client.query(
      `SELECT area_id, business_category, total_profit AS old_total_profit
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
        console.log(`  ${r.business_category}/${r.area_id}  old total_profit = ${r.old_total_profit}`);
      }
      console.log("\n本実行: npm run migrate:c93-1-may2026 (--dry なし)");
      return;
    }

    // 本実行: 逐次に aggregateMonthlySummary を呼出 (Q3=a 採用、各 cell 独立トランザクション)
    let ok = 0, err = 0;
    for (const r of rows) {
      const cellLabel = `${r.business_category}/${r.area_id}`;
      try {
        await aggregateMonthlySummary(
          String(r.area_id),
          String(r.business_category) as BusinessCategory,
          TARGET_YEAR, TARGET_MONTH,
        );
        // 結果確認 (新 total_profit を読み出して旧値と比較)
        const { rows: after } = await client.query(
          `SELECT total_profit FROM monthly_summaries
            WHERE area_id=$1 AND business_category=$2 AND year=$3 AND month=$4`,
          [r.area_id, r.business_category, TARGET_YEAR, TARGET_MONTH]
        );
        const newProfit = after.length > 0 ? after[0].total_profit : null;
        const diff = newProfit !== null && r.old_total_profit !== null
          ? Number(newProfit) - Number(r.old_total_profit)
          : null;
        console.log(`  ✅ ${cellLabel}: ${r.old_total_profit} → ${newProfit}${diff !== null ? ` (差 ${diff >= 0 ? "+" : ""}${diff})` : ""}`);
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
    console.log("✅ migration 完了。次は /dashboard で値変化を視覚検証してください。");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ migration エラー:", e);
  process.exit(1);
});
