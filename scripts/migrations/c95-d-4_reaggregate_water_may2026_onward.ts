// c95-D-4 re-aggregation: water 業態 2026-05 以降の monthly_summaries を新 aggregation SQL
//   (D-4 で water 分岐を手入力 sum_consultant_fee 直接控除に切替済) で再生成する。
//
// 使い方:
//   dry-run (デフォルト、書き込みなし):
//     export $(grep DATABASE_URL .env.local | xargs) \
//       && npx tsx scripts/migrations/c95-d-4_reaggregate_water_may2026_onward.ts
//   apply (実書き込み):
//     ... scripts/migrations/c95-d-4_reaggregate_water_may2026_onward.ts --apply
//
// 設計:
//   - 対象: water 業態 + (year*100+month) >= CONSULTANT_FEE_APPLIED_FROM_YYYYMM (202605)
//   - 4 月以前データ (109 行、絶対不変項目) は二重ガードで保護:
//     (1) 対象行 SELECT の WHERE 句に `(year*100+month) >= 202605`
//     (2) aggregateMonthlySummary 内部 SQL の entry_date 月単位 access
//     (3) ループ前の per-row 二重チェック (ym < APPLY_FROM_YM なら throw)
//     (4) D-4 SQL の water 分岐自体が yyyymm < 202605 のとき sum_consultant_fee を式から除外
//   - water 限定: locksmith/electric/road/detective は呼び出さない
//   - 予測値: new_profit ≈ old_profit + ROUND(revenue × 0.077) - SUM(consultant_fee)
//             ±1 円許容 (新旧で Math.round の小数部順序が異なるため fractional に最大 1 円差)
//   - 実行後検証: 全行で予測値と一致 (±1 円以内)、4 月以前行数不変
//
// トランザクション設計:
//   monthlyAggregation.getSql() は @neondatabase/serverless の neon() (HTTP ベース) を使用しており、
//   cross-call transaction を span できない。代わりに以下で安全性を担保:
//     - 各 aggregateMonthlySummary は UPSERT で per-row 原子的
//     - 強い pre-check (現状値スナップショット) + 強い post-check (予測値一致 ±1 円)
//     - aggregateMonthlySummary は entries.data 由来で全置換 → idempotent
//       (途中失敗時、再実行で完了可能)
//
// ⚠️ 重大注意:
//   実行時点で water 5 月 entries.data.consultant_fee は ほぼ全行 0 (現場入力未完了)。
//   reaggregate 結果は profit が 旧 c95-B 比で約 +2,740 万円 (7 エリア合計) 跳ね上がる。
//   反さんの明示 OK (粗利跳ね上がり承知、ダッシュボード即時反映承知) を受領済。

import { Pool } from "@neondatabase/serverless";
import { aggregateMonthlySummary } from "../../app/lib/monthlyAggregation";
import { CONSULTANT_FEE_APPLIED_FROM_YYYYMM } from "../../app/lib/consultantFee";

// PR c95-D-6: CONSULTANT_FEE_RATE 撤去のため直値化 (本スクリプトは slice 4 で 1 回 apply 済
//   archive、再走時の予測式 (旧 7.7% → 新手入力 SUM 差分) 計算のため当時の率を保持)。
const APPLY = process.argv.includes("--apply");
const TARGET_CATEGORY = "water";
const WATER_RATE = 0.077; // archive: c95-B 当時の率 (slice 4 予測式の入力、新規再 apply は不要)
const APPLY_FROM_YM = CONSULTANT_FEE_APPLIED_FROM_YYYYMM; // 202605
const TOLERANCE_YEN = 1; // Math.round 小数部由来の誤差許容

type RowSnap = {
  area_id: string;
  year: number;
  month: number;
  revenue: number;
  profit: number;
  consultant_fee_ms: number; // monthly_summaries 現状値
  sum_cf_entries: number;    // entries.data SUM (実行時計算、新 aggregation の入力)
};

async function selectWaterTargetSnapshot(
  client: import("@neondatabase/serverless").PoolClient,
): Promise<RowSnap[]> {
  const { rows } = await client.query<{
    area_id: string;
    year: number;
    month: number;
    revenue: string;
    profit: string;
    consultant_fee_ms: string;
    sum_cf_entries: string;
  }>(
    `SELECT
       ms.area_id,
       ms.year,
       ms.month,
       ms.total_revenue::bigint AS revenue,
       ms.total_profit::bigint AS profit,
       ms.consultant_fee::numeric AS consultant_fee_ms,
       COALESCE((
         SELECT SUM(COALESCE((e.data->>'consultant_fee')::numeric, 0))
         FROM entries e
         WHERE e.area_id = ms.area_id
           AND e.business_category = ms.business_category
           AND e.entry_date >= MAKE_DATE(ms.year, ms.month, 1)
           AND e.entry_date < (MAKE_DATE(ms.year, ms.month, 1) + INTERVAL '1 month')
       ), 0)::numeric AS sum_cf_entries
     FROM monthly_summaries ms
     WHERE COALESCE(ms.business_category, 'water') = $1
       AND (ms.year * 100 + ms.month) >= $2
     ORDER BY ms.year, ms.month, ms.area_id`,
    [TARGET_CATEGORY, APPLY_FROM_YM],
  );
  return rows.map((r) => ({
    area_id: String(r.area_id),
    year: Number(r.year),
    month: Number(r.month),
    revenue: Number(r.revenue),
    profit: Number(r.profit),
    consultant_fee_ms: Number(r.consultant_fee_ms),
    sum_cf_entries: Number(r.sum_cf_entries),
  }));
}

async function countPreAprilWaterRows(
  client: import("@neondatabase/serverless").PoolClient,
): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS cnt
     FROM monthly_summaries
     WHERE COALESCE(business_category, 'water') = $1
       AND (year * 100 + month) < $2`,
    [TARGET_CATEGORY, APPLY_FROM_YM],
  );
  return Number(rows[0].cnt);
}

async function snapshotPreAprilSamples(
  client: import("@neondatabase/serverless").PoolClient,
): Promise<Array<{ area_id: string; year: number; month: number; total_profit: number }>> {
  // 4 月以前 water 行から最新 5 件を取得 (post-check で同値を確認するため)
  const { rows } = await client.query<{
    area_id: string;
    year: number;
    month: number;
    total_profit: string;
  }>(
    `SELECT area_id, year, month, total_profit::bigint AS total_profit
     FROM monthly_summaries
     WHERE COALESCE(business_category, 'water') = $1
       AND (year * 100 + month) < $2
     ORDER BY year DESC, month DESC, area_id
     LIMIT 5`,
    [TARGET_CATEGORY, APPLY_FROM_YM],
  );
  return rows.map((r) => ({
    area_id: String(r.area_id),
    year: Number(r.year),
    month: Number(r.month),
    total_profit: Number(r.total_profit),
  }));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 未設定。export $(grep DATABASE_URL .env.local | xargs) で有効化");
    process.exit(1);
  }
  console.log(`🔧 c95-D-4 re-aggregation: water + yyyymm >= ${APPLY_FROM_YM}`);
  console.log(`   モード: ${APPLY ? "★ APPLY (DB 書き込み) ★" : "DRY-RUN (読み取りのみ、書き込みなし)"}`);
  console.log(`   新計算: revenue - costs - SUM(entries.data.consultant_fee) (手入力ベース)`);
  console.log(`   旧計算: revenue - costs - revenue × ${WATER_RATE} (自動 7.7%、撤去対象)\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // ── STEP 1: BEFORE スナップショット ──────────────
    const beforeRows = await selectWaterTargetSnapshot(client);
    const beforePreApril = await countPreAprilWaterRows(client);
    const preAprilSamples = await snapshotPreAprilSamples(client);

    console.log(`📊 BEFORE (現状):`);
    console.log(`   対象 water 行 (ym >= ${APPLY_FROM_YM}): ${beforeRows.length} 行`);
    console.log(`   2026/4 以前 water 行 (touch 禁止): ${beforePreApril} 行`);
    if (beforeRows.length === 0) {
      console.log("\n✅ 対象 0 行。何もせず終了。");
      return;
    }
    console.table(beforeRows.map((r) => ({
      area: r.area_id,
      ym: `${r.year}-${String(r.month).padStart(2, "0")}`,
      revenue: r.revenue.toLocaleString(),
      profit_now: r.profit.toLocaleString(),
      cf_ms: r.consultant_fee_ms.toLocaleString(),
      cf_entries_sum: r.sum_cf_entries.toLocaleString(),
    })));

    // ── STEP 2: 予測 AFTER 計算 ──────────────────
    // 旧 profit = revenue - costs - revenue × 0.077
    // 新 profit = revenue - costs - sum_cf_entries
    // → 新 - 旧 ≈ revenue × 0.077 - sum_cf_entries
    // → 新 ≈ 旧 + Math.round(revenue × 0.077) - sum_cf_entries
    // 注: SQL 側で ROUND(d_total_profit)::BIGINT のため、新旧で fractional の出方が異なる →
    //     ±1 円誤差を許容する (TOLERANCE_YEN)。
    console.log(`\n📊 予測 AFTER (re-aggregation 後の期待値):`);
    const predicted = beforeRows.map((r) => {
      const oldDeduction = Math.round(r.revenue * WATER_RATE);
      const newDeduction = Math.round(r.sum_cf_entries);
      const predictedProfit = r.profit + oldDeduction - newDeduction;
      const delta = predictedProfit - r.profit;
      return {
        area: r.area_id,
        ym: `${r.year}-${String(r.month).padStart(2, "0")}`,
        revenue: r.revenue,
        profit_before: r.profit,
        old_deduction_077: oldDeduction,
        new_deduction_input: newDeduction,
        predicted_profit: predictedProfit,
        delta,
      };
    });
    console.table(predicted.map((p) => ({
      area: p.area,
      ym: p.ym,
      profit_before: p.profit_before.toLocaleString(),
      "旧7.7%": p.old_deduction_077.toLocaleString(),
      新手入力: p.new_deduction_input.toLocaleString(),
      profit_after: p.predicted_profit.toLocaleString(),
      delta: (p.delta >= 0 ? "+" : "") + p.delta.toLocaleString(),
    })));
    const sumDelta = predicted.reduce((s, p) => s + p.delta, 0);
    console.log(`\n   合計 delta (新 profit - 旧 profit): ${(sumDelta >= 0 ? "+" : "") + sumDelta.toLocaleString()} 円`);
    console.log(`   ⚠️ 5 月以降 water 粗利が ${(sumDelta >= 0 ? "増加" : "減少")} します。本番ダッシュボードに即時反映。`);

    // ── STEP 3: APPLY 分岐 ──────────────────────
    if (!APPLY) {
      console.log(`\n💡 DRY-RUN 完了。実書き込みするには --apply フラグを付けて再実行:`);
      console.log(`   npx tsx scripts/migrations/c95-d-4_reaggregate_water_may2026_onward.ts --apply\n`);
      console.log(`   ※ 4 月以前 water 行 (${beforePreApril} 行) は二重 + SQL 分岐ガードで保護、touch なし`);
      return;
    }

    // ── STEP 4: APPLY 実行 (per-row UPSERT、進捗ログ + 二重ガード) ──
    console.log(`\n▶ APPLY 実行 (${beforeRows.length} 行の aggregateMonthlySummary):`);
    for (const r of beforeRows) {
      const ym = r.year * 100 + r.month;
      if (ym < APPLY_FROM_YM) {
        throw new Error(`二重ガード違反: ym=${ym} < ${APPLY_FROM_YM} (${r.area_id} ${r.year}-${r.month})`);
      }
      const t0 = Date.now();
      await aggregateMonthlySummary(r.area_id, TARGET_CATEGORY, r.year, r.month);
      console.log(`  ✅ ${r.area_id} ${r.year}-${String(r.month).padStart(2, "0")} re-agg done (${Date.now() - t0}ms)`);
    }

    // ── STEP 5: AFTER 検証 (全行で予測値 ±TOLERANCE_YEN 以内) ──
    console.log(`\n📋 AFTER 検証 (±${TOLERANCE_YEN} 円許容):`);
    const afterRows = await selectWaterTargetSnapshot(client);
    let postMismatch = 0;
    for (const r of afterRows) {
      const p = predicted.find((x) => x.area === r.area_id && x.ym === `${r.year}-${String(r.month).padStart(2, "0")}`)!;
      const diff = Math.abs(r.profit - p.predicted_profit);
      if (diff <= TOLERANCE_YEN) {
        console.log(`  ✅ ${r.area_id}: profit_after=${r.profit.toLocaleString()} (予測 ${p.predicted_profit.toLocaleString()}, 差 ${diff} 円)`);
      } else {
        console.log(`  ❌ ${r.area_id}: profit_after=${r.profit.toLocaleString()} (予測 ${p.predicted_profit.toLocaleString()}, 差 ${diff} 円)`);
        postMismatch++;
      }
    }
    if (postMismatch > 0) {
      console.error(`\n❌ AFTER 検証で ${postMismatch} 行が予測値から ${TOLERANCE_YEN} 円超ずれ。`);
      console.error(`   monthly_summaries は per-row UPSERT で更新済 (rollback 不可)。差異原因を特定してください。`);
      process.exit(1);
    }

    // ── STEP 6: 4 月以前不変 アサーション ──────────
    const afterPreApril = await countPreAprilWaterRows(client);
    if (afterPreApril !== beforePreApril) {
      console.error(`\n❌ 4 月以前 water 行数変動: ${beforePreApril} → ${afterPreApril}`);
      console.error(`   絶対不変項目違反の可能性。即時調査してください。`);
      process.exit(1);
    }
    const afterPreSamples = await snapshotPreAprilSamples(client);
    let preSampleMismatch = 0;
    for (const s of preAprilSamples) {
      const a = afterPreSamples.find((x) => x.area_id === s.area_id && x.year === s.year && x.month === s.month);
      if (!a) {
        console.log(`  ❌ サンプル消失: ${s.area_id} ${s.year}-${s.month}`);
        preSampleMismatch++;
        continue;
      }
      if (a.total_profit !== s.total_profit) {
        console.log(`  ❌ サンプル profit 変動: ${s.area_id} ${s.year}-${s.month}: ${s.total_profit} → ${a.total_profit}`);
        preSampleMismatch++;
      }
    }
    if (preSampleMismatch > 0) {
      console.error(`\n❌ 4 月以前 water サンプル ${preSampleMismatch} 行で profit が変動。絶対不変違反。即時調査。`);
      process.exit(1);
    }

    console.log(`\n✅ APPLY 完了:`);
    console.log(`   ${afterRows.length} 行の water profit を 手入力 consultant_fee ベースに更新`);
    console.log(`   4 月以前 water 行: ${beforePreApril} 行 unchanged (行数 + 最新 ${preAprilSamples.length} 件 profit 一致、絶対不変ガード OK)`);
    console.log(`   合計 profit delta: ${(sumDelta >= 0 ? "+" : "") + sumDelta.toLocaleString()} 円`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("\n❌ エラー:", e);
  process.exit(1);
});
