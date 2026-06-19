// READ ONLY 検算: 鍵/関西/2026-06 の件数定義ズレを実データで裏取り (2026-06-19)
//   - total_count (応答件数の和) は鍵で 0 になるか
//   - acquisition_count の SUM が本体ヒーロー 289 件と一致するか
//   - 売上 ÷ acquisition_count が本体客単価 ¥34,851 と一致するか
// 書き込みなし。
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL 未設定。 export $(grep DATABASE_URL .env.local | xargs) で有効化");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

async function main() {
  const from = "2026-06-01", to = "2026-06-30";
  const rows = await sql`
    SELECT
      COALESCE(SUM(COALESCE((data->>'outsourced_response_count')::numeric,0)),0) AS resp_out,
      COALESCE(SUM(COALESCE((data->>'internal_staff_response_count')::numeric,0)),0) AS resp_in,
      COALESCE(SUM(COALESCE((data->>'acquisition_count')::numeric,0)),0) AS acq,
      COALESCE(SUM(COALESCE((data->>'outsourced_sales_revenue')::numeric,0)),0) AS rev,
      COUNT(*) AS n_days
    FROM entries
    WHERE business_category='locksmith' AND area_id='kansai'
      AND entry_date >= ${from}::date AND entry_date <= ${to}::date
  `;
  const r = rows[0] as Record<string, string>;
  const respTotal = Number(r.resp_out) + Number(r.resp_in);
  const acq = Number(r.acq);
  const rev = Number(r.rev);
  console.log("鍵/関西/2026-06 (entries 直 SUM):");
  console.log("  応答件数の和 (= range-aggregate の旧 total_count) :", respTotal, "件");
  console.log("  acquisition_count の和                          :", acq, "件");
  console.log("  outsourced_sales_revenue の和                   : ¥" + rev.toLocaleString());
  console.log("  売上 ÷ acquisition_count (= 客単価)             : ¥" + (acq ? Math.round(rev / acq).toLocaleString() : "—(0除算)"));
  console.log("  登録日数                                        :", r.n_days, "日");
  console.log("");
  console.log("本体ダッシュボード表示 (反さんスクショ): 対応件数 289件 / 客単価 ¥34,851 / 売上 ¥10,071,859");
  console.log("照合:");
  console.log("  acquisition_count == 289 ?      ->", acq === 289 ? "✅ 一致" : `❌ 不一致 (got ${acq})`);
  console.log("  旧 total_count == 0 ?           ->", respTotal === 0 ? "✅ 0 (バグ確定)" : `⚠️ 非0 (${respTotal})`);

  // ── 修正後の SQL 式 (sum_effective_count) を本番実データに当てて検算 ──
  const fixed = await sql`
    SELECT
      COALESCE(SUM(
        CASE WHEN business_category IN ('water','electric')
          THEN COALESCE((data->>'outsourced_response_count')::numeric,0) + COALESCE((data->>'internal_staff_response_count')::numeric,0)
          ELSE COALESCE((data->>'acquisition_count')::numeric,0)
        END
      ),0) AS eff_count,
      COALESCE(SUM(COALESCE((data->>'outsourced_sales_revenue')::numeric,0)),0) AS rev
    FROM entries
    WHERE business_category='locksmith' AND area_id='kansai'
      AND entry_date >= ${from}::date AND entry_date <= ${to}::date
  `;
  const f = fixed[0] as Record<string, string>;
  const effCount = Number(f.eff_count);
  const effUnit = effCount ? Math.round(Number(f.rev) / effCount) : 0;
  console.log("\n修正後 SQL (sum_effective_count) 実データ結果:");
  console.log("  total_count :", effCount, "件   ->", effCount === 289 ? "✅ 289 一致" : `❌ (${effCount})`);
  console.log("  客単価      : ¥" + effUnit.toLocaleString(), "  ->", effUnit === 34851 ? "✅ ¥34,851 一致" : `❌ (${effUnit})`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
