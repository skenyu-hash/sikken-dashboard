// c95-B 調査専用: 4 月以前データの粗利再計算リスク範囲を確認 (READ ONLY)。
//   ・water 業態の monthly_summaries 件数 (全期間 / 4月以前)
//   ・entries の最古日 (粗利が遡って変わって見えるリスク)
//   ・既存 total_profit 値の分布 (legacy=0 行を把握)

import { Pool } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL 未設定"); process.exit(1); }
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await p.connect();
  try {
    console.log("🔎 c95-B 調査: 4 月以前データの粗利波及リスク確認 (READ ONLY)\n");

    const a = await c.query(`
      SELECT business_category, COUNT(*)::int AS cnt,
             MIN(year*100+month) AS min_ym, MAX(year*100+month) AS max_ym
      FROM monthly_summaries
      WHERE (year*100+month) <= 202604
      GROUP BY business_category
      ORDER BY business_category
    `);
    console.log("A. monthly_summaries (year-month <= 2026-04):");
    console.table(a.rows);

    const w = await c.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE year*100+month <= 202604)::int AS pre_apr,
             COUNT(*) FILTER (WHERE year*100+month >= 202605)::int AS may_onwards
      FROM monthly_summaries
      WHERE COALESCE(business_category, 'water') = 'water'
    `);
    console.log("\nB. water monthly_summaries 期間分布:");
    console.table(w.rows);

    const wp = await c.query(`
      SELECT
        COUNT(*) FILTER (WHERE total_profit > 0)::int AS profit_gt0,
        COUNT(*) FILTER (WHERE total_profit = 0 AND total_revenue > 0)::int AS legacy_zero_with_rev,
        COUNT(*) FILTER (WHERE total_profit = 0 AND total_revenue = 0)::int AS empty
      FROM monthly_summaries
      WHERE COALESCE(business_category, 'water') = 'water'
    `);
    console.log("\nC. water monthly_summaries total_profit 分布:");
    console.table(wp.rows);

    const ed = await c.query(`
      SELECT
        MIN(entry_date)::text AS earliest,
        MAX(entry_date)::text AS latest,
        COUNT(*) FILTER (WHERE entry_date < '2026-04-01')::int AS pre_apr_entries,
        COUNT(*) FILTER (WHERE entry_date >= '2026-04-01' AND entry_date < '2026-05-01')::int AS apr_entries,
        COUNT(*) FILTER (WHERE entry_date >= '2026-05-01')::int AS may_onwards_entries
      FROM entries
      WHERE COALESCE(business_category, 'water') = 'water'
    `);
    console.log("\nD. water entries 期間分布:");
    console.table(ed.rows);
  } finally {
    c.release(); await p.end();
  }
}
main().catch((e) => { console.error("❌", e); process.exit(1); });
