// 一時運用: 4 月以前 water スナップショット (READ ONLY、SUM 含む)。
// re-aggregation --apply 前後で実行し、4 月以前データが完全不変か検証する。

import { Pool } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL 未設定"); process.exit(1); }
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await p.connect();
  try {
    const r = await c.query(
      `SELECT COUNT(*)::int AS cnt,
              COALESCE(SUM(total_profit), 0)::bigint AS sum_profit,
              COALESCE(SUM(total_revenue), 0)::bigint AS sum_revenue
       FROM monthly_summaries
       WHERE COALESCE(business_category, 'water') = 'water'
         AND (year * 100 + month) < 202605`
    );
    console.log("PRE-APRIL water snapshot:");
    console.log(`  count       : ${r.rows[0].cnt}`);
    console.log(`  sum_revenue : ${String(r.rows[0].sum_revenue)}`);
    console.log(`  sum_profit  : ${String(r.rows[0].sum_profit)}`);
  } finally {
    c.release();
    await p.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
