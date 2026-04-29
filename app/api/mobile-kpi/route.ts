import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export async function GET(req: NextRequest) {
  const sql = getSql();

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
      SELECT MAX(entry_date) FROM entries WHERE entry_date >= ${monthStart}
    )
  `;

  const todayRevenue = Number(latestRows[0]?.revenue ?? 0);

  return NextResponse.json({
    todayRevenue,
    monthForecast,
    adRatio,
  });
}
