import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export async function GET(req: NextRequest) {
  const sql = getSql();

  const { searchParams } = new URL(req.url);
  // area / category は optional。未指定ならグループ全体合算（既存動作）。
  // 指定された場合は entries テーブルへのフィルタを効かせる。Phase 9.5 で
  // entries の PK が (area_id, business_category, entry_date) に拡張された
  // ため、最新日の集計が業態混在で歪まないように呼び出し元から絞れるように
  // した。
  const area = searchParams.get("area") ?? null;
  const category = searchParams.get("category") ?? null;

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = today.getDate();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

  // 1) 月次集計（全エリア・全カテゴリ合算）
  const monthlyRows = await sql`
    SELECT
      COALESCE(SUM(total_revenue), 0) AS total_revenue,
      COALESCE(SUM(ad_cost), 0) AS ad_cost
    FROM monthly_summaries
    WHERE year = ${year} AND month = ${month}
  `;

  const totalRevenue = Number(monthlyRows[0]?.total_revenue ?? 0);
  const totalAdCost = Number(monthlyRows[0]?.ad_cost ?? 0);

  // 2) 月着地予測 = 累計 ÷ 経過日数 × 当月日数
  const monthForecast =
    daysElapsed > 0
      ? Math.round((totalRevenue / daysElapsed) * daysInMonth)
      : 0;

  // 3) 売上対広告比率
  const adRatio = totalRevenue > 0 ? totalAdCost / totalRevenue : 0;

  // 4) 本日売上 = 直近入力日の entries の売上系キー合算
  //    area/category フィルタは内側 MAX サブクエリと外側 SELECT の両方に
  //    適用しないと「最新日」と「集計対象」が食い違うので両方に効かせる。
  const latestRows = await sql`
    SELECT
      COALESCE(SUM(
        COALESCE((data->>'newRevenue')::bigint, 0) +
        COALESCE((data->>'addRevenue')::bigint, 0) +
        COALESCE((data->>'helpRevenue')::bigint, 0) +
        COALESCE((data->>'selfRevenue')::bigint, 0)
      ), 0) AS revenue
    FROM entries
    WHERE entry_date = (
      SELECT MAX(entry_date) FROM entries
      WHERE entry_date >= ${monthStart}
        AND (${area}::text IS NULL OR area_id = ${area})
        AND (${category}::text IS NULL OR business_category = ${category})
    )
      AND (${area}::text IS NULL OR area_id = ${area})
      AND (${category}::text IS NULL OR business_category = ${category})
  `;

  const todayRevenue = Number(latestRows[0]?.revenue ?? 0);

  return NextResponse.json({
    todayRevenue,
    monthForecast,
    adRatio,
  });
}
