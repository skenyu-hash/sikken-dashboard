import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";

const ALL_CATEGORIES = ["water", "electric", "locksmith", "road", "detective"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  water: "水道",
  electric: "電気",
  locksmith: "鍵",
  road: "ロード",
  detective: "探偵",
};

export async function GET(req: NextRequest) {
  const sql = getSql();

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysElapsed = today.getDate();

  // カテゴリ別・全エリア合算
  const rows = await sql`
    SELECT
      business_category,
      COALESCE(SUM(total_revenue), 0)::bigint AS total_revenue,
      COALESCE(SUM(total_profit), 0)::bigint AS total_profit,
      COALESCE(SUM(ad_cost), 0)::bigint AS ad_cost,
      COALESCE(SUM(total_count), 0)::int AS total_count
    FROM monthly_summaries
    WHERE year = ${year} AND month = ${month}
    GROUP BY business_category
  `;

  // 全5カテゴリの行を生成（データなしは null）
  const categories = ALL_CATEGORIES.map((cat) => {
    const r = rows.find((row: any) => row.business_category === cat);
    if (!r) {
      return {
        category: cat,
        label: CATEGORY_LABELS[cat],
        revenue: null,
        profit: null,
        adCost: null,
        count: null,
        cpa: null,
        adRatio: null,
        forecast: null,
      };
    }
    const revenue = Number(r.total_revenue);
    const profit = Number(r.total_profit);
    const adCost = Number(r.ad_cost);
    const count = Number(r.total_count);
    const cpa = count > 0 ? Math.round(adCost / count) : null;
    const adRatio = revenue > 0 ? adCost / revenue : null;
    const forecast =
      daysElapsed > 0 ? Math.round((revenue / daysElapsed) * daysInMonth) : null;

    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      revenue,
      profit,
      adCost,
      count,
      cpa,
      adRatio,
      forecast,
    };
  });

  // 合計行
  const totalRevenue = categories.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totalProfit = categories.reduce((s, r) => s + (r.profit ?? 0), 0);
  const totalAdCost = categories.reduce((s, r) => s + (r.adCost ?? 0), 0);
  const totalCount = categories.reduce((s, r) => s + (r.count ?? 0), 0);
  const totalCpa = totalCount > 0 ? Math.round(totalAdCost / totalCount) : null;
  const totalAdRatio = totalRevenue > 0 ? totalAdCost / totalRevenue : null;
  const totalForecast =
    daysElapsed > 0 ? Math.round((totalRevenue / daysElapsed) * daysInMonth) : null;

  const total = {
    label: "合計",
    revenue: totalRevenue,
    profit: totalProfit,
    adCost: totalAdCost,
    count: totalCount,
    cpa: totalCpa,
    adRatio: totalAdRatio,
    forecast: totalForecast,
  };

  return NextResponse.json({
    year,
    month,
    daysInMonth,
    daysElapsed,
    categories,
    total,
  });
}
