// c95-B re-aggregation: water 業態 2026-05 以降の monthly_summaries を新 aggregation SQL
//   (B-2 でコンサル費 7.7% 控除を組込済) で再生成し、total_profit を控除後の正しい値に更新する。
//
// 使い方:
//   dry-run (デフォルト、書き込みなし):
//     export $(grep DATABASE_URL .env.local | xargs) \
//       && npx tsx scripts/migrations/c95-b_reaggregate_water_consultant.ts
//   apply (実書き込み):
//     ... scripts/migrations/c95-b_reaggregate_water_consultant.ts --apply
//
// 設計:
//   - 対象: water 業態 + (year*100+month) >= CONSULTANT_FEE_APPLIED_FROM_YYYYMM (202605)
//   - 4 月以前データ (109 行、絶対不変項目) は二重ガードで保護:
//     (1) 対象行 SELECT の WHERE 句に `(year*100+month) >= 202605`
//     (2) aggregateMonthlySummary 内部 SQL の entry_date >= MAKE_DATE(year, month, 1) で月単位 access
//     (3) ループ前の per-row 二重チェック (ym < APPLY_FROM_YM なら throw)
//   - water 限定: locksmith/electric/road/detective には呼び出さない
//   - 期待値整合: 実行前に Web Claude 確定値と現状値が一致するか検証 (一致しなければ即中止)
//   - 実行後検証: 全 7 行の total_profit が予測 AFTER 値と完全一致するか確認、4 月以前行数不変
//
// トランザクション設計の注:
//   monthlyAggregation.getSql() は @neondatabase/serverless の neon() (HTTP ベース) を使用しており、
//   cross-call transaction を span できない。代わりに以下で安全性を担保:
//     - 各 aggregateMonthlySummary は UPSERT で per-row 原子的
//     - 強い pre-check (snapshot match) + 強い post-check (predicted match) + ガード
//     - aggregateMonthlySummary は entries.data 由来で全置換 → idempotent
//       (途中失敗時、再実行で完了可能)
//   ※ 部分失敗が万一起きた場合: 失敗行を手動 (--apply で再実行 → idempotent recovery)。
//
// 期待値は Web Claude が SQL 検算済 (c95-B-2 deduction kansai=6,842,012 / kanto=5,212,029)。

import { Pool } from "@neondatabase/serverless";
import { aggregateMonthlySummary } from "../../app/lib/monthlyAggregation";
import { CONSULTANT_FEE_APPLIED_FROM_YYYYMM } from "../../app/lib/consultantFee";

// PR c95-D-6: CONSULTANT_FEE_RATE 撤去のため直値化 (本スクリプトは旧 c95-B 移行用 archive、
//   歴史記録として残置するが consultantFee.ts の rate 依存を外す。EXPECTED は当時の確定値)。
const APPLY = process.argv.includes("--apply");
const TARGET_CATEGORY = "water";
const WATER_RATE = 0.077; // archive: c95-B 当時の率
const APPLY_FROM_YM = CONSULTANT_FEE_APPLIED_FROM_YYYYMM; // 202605

// Web Claude 確定の期待値 (B-2 SQL の出力、検算確認済 c95-B-2 hotfix-investigation 完了)。
// area_id → { revenue, profit_before, deduction (符号付き), profit_after }
type Expected = { revenue: number; profit_before: number; deduction: number; profit_after: number };
const EXPECTED: Record<string, Expected> = {
  chugoku:   { revenue: 17029780, profit_before: 6680354,  deduction: -1311293, profit_after: 5369061 },
  hokkaido:  { revenue: 51263869, profit_before: 19015013, deduction: -3947318, profit_after: 15067695 },
  kansai:    { revenue: 88857300, profit_before: 30460693, deduction: -6842012, profit_after: 23618681 },
  kanto:     { revenue: 67688690, profit_before: 18300363, deduction: -5212029, profit_after: 13088334 },
  kitakanto: { revenue: 18835920, profit_before: 8675328,  deduction: -1450366, profit_after: 7224962 },
  kyushu:    { revenue: 39817320, profit_before: 15971262, deduction: -3065934, profit_after: 12905328 },
  nagoya:    { revenue: 59014080, profit_before: 18121650, deduction: -4544084, profit_after: 13577566 },
};

type Row = { area_id: string; year: number; month: number; revenue: number; profit: number };

async function selectWaterTargetRows(client: import("@neondatabase/serverless").PoolClient): Promise<Row[]> {
  const { rows } = await client.query(
    `SELECT area_id, year, month,
            total_revenue::bigint AS revenue,
            total_profit::bigint AS profit
     FROM monthly_summaries
     WHERE COALESCE(business_category, 'water') = $1
       AND (year * 100 + month) >= $2
     ORDER BY year, month, area_id`,
    [TARGET_CATEGORY, APPLY_FROM_YM],
  );
  return rows.map((r) => ({
    area_id: String(r.area_id),
    year: Number(r.year),
    month: Number(r.month),
    revenue: Number(r.revenue),
    profit: Number(r.profit),
  }));
}

async function countPreAprilWaterRows(client: import("@neondatabase/serverless").PoolClient): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS cnt
     FROM monthly_summaries
     WHERE COALESCE(business_category, 'water') = $1
       AND (year * 100 + month) < $2`,
    [TARGET_CATEGORY, APPLY_FROM_YM],
  );
  return Number(rows[0].cnt);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 未設定。export $(grep DATABASE_URL .env.local | xargs) で有効化");
    process.exit(1);
  }
  console.log(`🔧 c95-B re-aggregation: water + yyyymm >= ${APPLY_FROM_YM}`);
  console.log(`   モード: ${APPLY ? "★ APPLY (DB 書き込み) ★" : "DRY-RUN (読み取りのみ、書き込みなし)"}`);
  console.log(`   水道率: ${WATER_RATE} (${(WATER_RATE * 100).toFixed(1)}%)\n`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // ── STEP 1: BEFORE スナップショット ──────────────
    const beforeRows = await selectWaterTargetRows(client);
    const beforePreApril = await countPreAprilWaterRows(client);
    console.log(`📊 BEFORE:`);
    console.log(`   対象 water 行 (ym >= ${APPLY_FROM_YM}): ${beforeRows.length} 行`);
    console.log(`   2026/4 以前 water 行 (touch 禁止): ${beforePreApril} 行`);
    if (beforeRows.length === 0) {
      console.log("\n✅ 対象 0 行。何もせず終了。");
      return;
    }
    console.table(beforeRows.map((r) => ({
      area: r.area_id, ym: `${r.year}-${String(r.month).padStart(2, "0")}`,
      revenue: r.revenue.toLocaleString(),
      profit_before: r.profit.toLocaleString(),
    })));

    // ── STEP 2: 期待値整合チェック (現状の profit_before が Web Claude 確定値と一致するか) ─
    console.log(`\n📋 整合チェック (現状 profit_before が確定値と一致):`);
    let preMismatch = 0;
    for (const r of beforeRows) {
      const expected = EXPECTED[r.area_id];
      if (!expected) {
        console.log(`  ❌ ${r.area_id}: EXPECTED に未定義 (新規エリア? 期待値を更新してください)`);
        preMismatch++;
        continue;
      }
      const revOk = r.revenue === expected.revenue;
      const profitOk = r.profit === expected.profit_before;
      if (revOk && profitOk) {
        console.log(`  ✅ ${r.area_id}: revenue=${r.revenue}, profit_before=${r.profit}`);
      } else {
        console.log(`  ❌ ${r.area_id}: revenue=${r.revenue} (期待 ${expected.revenue})`
                  + `, profit_before=${r.profit} (期待 ${expected.profit_before})`);
        preMismatch++;
      }
    }
    if (preMismatch > 0) {
      console.error(`\n❌ 整合チェック失敗 (${preMismatch} 件)。`);
      console.error(`   現状 DB 値が Web Claude 確定値と異なります。c95-B-2 デプロイ後、新規 entries 追加か手動 UPDATE があった可能性。`);
      console.error(`   中止します。期待値を更新するか、現状を再確認してください。`);
      process.exit(1);
    }

    // ── STEP 3: 予測 AFTER 値の自己検証 (Math.round(revenue * 0.077) が確定値と一致) ─
    console.log(`\n📊 予測 AFTER (re-aggregation 後の期待値):`);
    const predicted = beforeRows.map((r) => {
      const deduction = Math.round(r.revenue * WATER_RATE); // 正値
      const profitAfter = r.profit - deduction;
      const expected = EXPECTED[r.area_id]!;
      const ok = (-deduction === expected.deduction) && (profitAfter === expected.profit_after);
      return {
        area: r.area_id, ym: `${r.year}-${String(r.month).padStart(2, "0")}`,
        revenue: r.revenue, profit_before: r.profit,
        deduction: -deduction, profit_after: profitAfter, ok,
      };
    });
    console.table(predicted.map((p) => ({
      area: p.area, ym: p.ym,
      revenue: p.revenue.toLocaleString(),
      profit_before: p.profit_before.toLocaleString(),
      deduction: p.deduction.toLocaleString(),
      profit_after: p.profit_after.toLocaleString(),
      期待値一致: p.ok ? "✅" : "❌",
    })));
    const allMatch = predicted.every((p) => p.ok);
    if (!allMatch) {
      console.error(`\n❌ 予測値が Web Claude 確定値と不一致。中止します。`);
      process.exit(1);
    }
    const sumDeduction = predicted.reduce((s, p) => s + p.deduction, 0);
    const sumBefore = predicted.reduce((s, p) => s + p.profit_before, 0);
    const sumAfter = predicted.reduce((s, p) => s + p.profit_after, 0);
    console.log(`\n   合計 deduction    : ${sumDeduction.toLocaleString()} 円`);
    console.log(`   合計 profit_before: ${sumBefore.toLocaleString()} 円`);
    console.log(`   合計 profit_after : ${sumAfter.toLocaleString()} 円`);

    // ── STEP 4: APPLY 分岐 ──────────────────────
    if (!APPLY) {
      console.log(`\n💡 DRY-RUN 完了。実書き込みするには --apply フラグを付けて再実行:`);
      console.log(`   npx tsx scripts/migrations/c95-b_reaggregate_water_consultant.ts --apply\n`);
      console.log(`   ※ 4 月以前 water 行 (${beforePreApril} 行) は二重ガードで保護、touch なし`);
      return;
    }

    // ── STEP 5: APPLY 実行 (per-row UPSERT、進捗ログ + 二重ガード) ──
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

    // ── STEP 6: AFTER 検証 (全 7 行の total_profit が予測 AFTER と完全一致) ──
    console.log(`\n📋 AFTER 検証:`);
    const afterRows = await selectWaterTargetRows(client);
    const afterPreApril = await countPreAprilWaterRows(client);
    let postMismatch = 0;
    for (const r of afterRows) {
      const expected = EXPECTED[r.area_id]!;
      const ok = r.profit === expected.profit_after;
      if (ok) {
        console.log(`  ✅ ${r.area_id}: profit_after=${r.profit} (期待値一致)`);
      } else {
        console.log(`  ❌ ${r.area_id}: profit_after=${r.profit} (期待 ${expected.profit_after})`);
        postMismatch++;
      }
    }
    if (postMismatch > 0) {
      console.error(`\n❌ AFTER 検証で ${postMismatch} 行が期待値と不一致。`);
      console.error(`   monthly_summaries は per-row UPSERT で更新済 (rollback 不可)。`);
      console.error(`   差異原因 (entries 変更等) を特定後、必要なら手動修正してください。`);
      process.exit(1);
    }

    // ── STEP 7: 4 月以前不変 アサーション ──────────
    if (afterPreApril !== beforePreApril) {
      console.error(`\n❌ 4 月以前 water 行数変動: ${beforePreApril} → ${afterPreApril}`);
      console.error(`   絶対不変項目違反の可能性。即時調査してください。`);
      process.exit(1);
    }
    console.log(`\n✅ APPLY 完了:`);
    console.log(`   ${afterRows.length} 行の water profit を controle 控除込みに更新`);
    console.log(`   4 月以前 water 行: ${beforePreApril} 行 unchanged (touch なし、絶対不変ガード OK)`);
    console.log(`   合計 profit 削減: ${(-sumDeduction).toLocaleString()} 円`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("\n❌ エラー:", e);
  process.exit(1);
});
