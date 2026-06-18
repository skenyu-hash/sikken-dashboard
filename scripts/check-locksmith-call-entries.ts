// 一時運用: 鍵業態 入電内訳 埋め戻し前の現状調査 (READ ONLY、書き込みなし)。
// 5月・6月の locksmith entries が「どのエリアに・各日いくつ call_count を持つか」、
// 内訳カラム (locksmith_car_lp_email_call_count / locksmith_inhouse_call_count) の現状を出力。

import { Pool } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL 未設定"); process.exit(1); }
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await p.connect();
  try {
    // 1. locksmith entries はどのエリアに存在するか (5月6月)
    const areas = await c.query(
      `SELECT area_id, COUNT(*)::int AS cnt,
              MIN(entry_date) AS min_d, MAX(entry_date) AS max_d
       FROM entries
       WHERE business_category = 'locksmith'
         AND entry_date >= '2026-05-01' AND entry_date <= '2026-06-30'
       GROUP BY area_id ORDER BY area_id`
    );
    console.log("=== locksmith entries エリア別 (2026-05〜06) ===");
    for (const r of areas.rows) {
      console.log(`  ${r.area_id}: ${r.cnt}行  (${r.min_d?.toISOString?.().slice(0,10) ?? r.min_d} 〜 ${r.max_d?.toISOString?.().slice(0,10) ?? r.max_d})`);
    }

    // 2. 関西の各日: 現状の call_count と内訳カラムの現状
    const rows = await c.query(
      `SELECT entry_date,
              COALESCE((data->>'call_count')::numeric, 0)::int AS call_count,
              COALESCE((data->>'locksmith_car_lp_email_call_count')::numeric, 0)::int AS lp,
              COALESCE((data->>'locksmith_inhouse_call_count')::numeric, 0)::int AS inhouse,
              (data ? 'locksmith_car_lp_email_call_count') AS has_lp_key,
              (data ? 'locksmith_inhouse_call_count') AS has_inhouse_key
       FROM entries
       WHERE business_category = 'locksmith' AND area_id = 'kansai'
         AND entry_date >= '2026-05-01' AND entry_date <= '2026-06-30'
       ORDER BY entry_date`
    );
    console.log("\n=== 関西 locksmith 各日の現状 ===");
    console.log("date        call_count  既存lp  既存inhouse  内訳キー有無");
    let sumCall = 0;
    for (const r of rows.rows) {
      const d = r.entry_date?.toISOString?.().slice(0,10) ?? r.entry_date;
      sumCall += r.call_count;
      console.log(`${d}   ${String(r.call_count).padStart(8)}  ${String(r.lp).padStart(5)}  ${String(r.inhouse).padStart(9)}   lp:${r.has_lp_key} ih:${r.has_inhouse_key}`);
    }
    console.log(`\n関西 locksmith 行数: ${rows.rows.length}, call_count 合計: ${sumCall}`);

    // 3. monthly_summaries 側の現状 (関西 locksmith 5月6月)
    const ms = await c.query(
      `SELECT year, month, as_of_day, call_count,
              locksmith_car_lp_email_call_count AS lp, locksmith_inhouse_call_count AS inhouse
       FROM monthly_summaries
       WHERE business_category = 'locksmith' AND area_id = 'kansai'
         AND (year * 100 + month) BETWEEN 202605 AND 202606
       ORDER BY year, month`
    );
    console.log("\n=== monthly_summaries 関西 locksmith ===");
    for (const r of ms.rows) {
      console.log(`  ${r.year}-${String(r.month).padStart(2,'0')} (as_of_day=${r.as_of_day}): call_count=${r.call_count}, lp列=${r.lp}, inhouse列=${r.inhouse}`);
    }
  } finally {
    c.release();
    await p.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
