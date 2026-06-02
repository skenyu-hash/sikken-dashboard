// PR c95-B-2: re-aggregation 実行前プレビュー (READ ONLY)。
//
// 用途: 5月以降の water 行 (B-1 check で 7 行と確認済) に対し、c95-B-2 マージ後に
//   re-aggregation を走らせた場合の before/after 粗利値を提示する。
//   実行は本スクリプトではせず、反さん承認後に独立スクリプト (別途作成、c95-B-2 マージ後)
//   で entry_date >= '2026-05-01' ガード付きで実施。
//
// 出力: water + (year*100+month) >= 202605 の monthly_summaries 各行について
//   - 現状 total_profit (c93-1 式由来、controle fee 控除なし)
//   - 予測 after total_profit (= 現状 - revenue * 0.077)
//   - 控除額 (= revenue * 0.077)

import { Pool } from "@neondatabase/serverless";
// PR c95-D-6: CONSULTANT_FEE_RATE 撤去のため直値化 (本スクリプトは旧 c95-B 検証用 archive、
//   歴史記録として残置するが consultantFee.ts への依存は外す)。
const CONSULTANT_FEE_RATE = { water: 0.077 } as const; // archive: c95-B 当時の率

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 未設定。export $(grep DATABASE_URL .env.local | xargs) で有効化");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    console.log(`🔎 c95-B-2 re-aggregation プレビュー (READ ONLY)`);
    console.log(`   対象: water + yyyymm >= 202605、water rate=${CONSULTANT_FEE_RATE.water}\n`);

    const { rows } = await client.query(`
      SELECT area_id, year, month,
             total_revenue::bigint AS revenue,
             total_profit::bigint AS profit_before
      FROM monthly_summaries
      WHERE COALESCE(business_category, 'water') = 'water'
        AND (year * 100 + month) >= 202605
      ORDER BY year, month, area_id
    `);

    if (rows.length === 0) {
      console.log("  対象行なし。");
      return;
    }

    const rate = CONSULTANT_FEE_RATE.water;
    const table = rows.map((r) => {
      const revenue = Number(r.revenue);
      const profitBefore = Number(r.profit_before);
      const deduction = Math.round(revenue * rate);
      const profitAfter = profitBefore - deduction;
      const deltaPct = revenue > 0 ? (deduction / revenue) * 100 : 0;
      return {
        area: r.area_id,
        ym: `${r.year}-${String(r.month).padStart(2, "0")}`,
        revenue,
        profit_before: profitBefore,
        deduction,
        profit_after: profitAfter,
        delta_pct: deltaPct.toFixed(2) + "%",
      };
    });

    console.table(table);

    const sumDeduction = table.reduce((s, r) => s + r.deduction, 0);
    const sumProfitBefore = table.reduce((s, r) => s + r.profit_before, 0);
    const sumProfitAfter = table.reduce((s, r) => s + r.profit_after, 0);
    console.log(`\nサマリ (${rows.length} 行):`);
    console.log(`  合計 revenue        : ${rows.reduce((s, r) => s + Number(r.revenue), 0).toLocaleString()} 円`);
    console.log(`  合計 deduction      : ${sumDeduction.toLocaleString()} 円`);
    console.log(`  合計 profit_before  : ${sumProfitBefore.toLocaleString()} 円`);
    console.log(`  合計 profit_after   : ${sumProfitAfter.toLocaleString()} 円`);

    console.log(`\n判断材料:`);
    console.log(`  - re-aggregation 実行で 7 行の water 粗利が上記 deduction 分だけ減る`);
    console.log(`  - 2026/4 以前データ (109 行) は ENTRY_DATE >= '2026-05-01' ガードで unchanged`);
    console.log(`  - 数値ご確認の上、反さん承認 → re-aggregation 独立スクリプト実行`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error("❌ エラー:", e); process.exit(1); });
