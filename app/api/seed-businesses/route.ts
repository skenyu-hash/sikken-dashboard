import { NextResponse } from "next/server";
import { getSql } from "../../lib/db";

type SeedRow = {
  category: string;
  area_id: string;
  year: number;
  month: number;
  revenueMan: number;     // 万円
  profitRate: number;     // 0-1
};

// 4ヶ月分の売上配列（万円）と粗利率配列（％）から SeedRow[] を生成
function build(category: string, area_id: string, revenuesMan: number[], profitRatesPct: number[]): SeedRow[] {
  return revenuesMan.map((revenueMan, i) => ({
    category, area_id,
    year: 2026,
    month: i + 1,
    revenueMan,
    profitRate: profitRatesPct[i] / 100,
  }));
}

const SEED: SeedRow[] = [
  // 電気: 関西 1〜4月 売上400〜800万円, 粗利率28〜35%
  ...build("electric", "kansai", [400, 550, 700, 800], [28, 30, 33, 35]),
  // 電気: 関東 1〜4月 売上300〜600万円, 粗利率26〜32%
  ...build("electric", "kanto", [300, 400, 500, 600], [26, 28, 30, 32]),
  // 鍵: 関西 1〜4月 売上150〜250万円, 粗利率40〜50%
  ...build("locksmith", "kansai", [150, 180, 220, 250], [40, 43, 47, 50]),
  // ロード: 関西 1〜4月 売上80〜120万円, 粗利率35〜45%
  ...build("road", "kansai", [80, 95, 110, 120], [35, 38, 42, 45]),
  // 探偵: 関西 1〜4月 売上200〜400万円, 粗利率50〜65%
  ...build("detective", "kansai", [200, 270, 340, 400], [50, 55, 60, 65]),
  // 探偵: 名古屋 1〜4月 売上100〜200万円, 粗利率48〜60%
  ...build("detective", "nagoya", [100, 130, 170, 200], [48, 52, 56, 60]),
];

export async function GET() {
  const sql = getSql();
  let inserted = 0;
  const errors: string[] = [];
  try {
    for (const row of SEED) {
      const totalRevenue = row.revenueMan * 10000; // 円
      const totalProfit = Math.round(totalRevenue * row.profitRate);
      const totalCount = Math.max(1, Math.round(row.revenueMan / 5)); // 適当な件数
      const unitPrice = totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0;
      const adCost = Math.round(totalRevenue * 0.15); // 広告費15%
      const adRate = 15;
      const profitRate = Math.round(row.profitRate * 1000) / 10;

      try {
        await sql`
          INSERT INTO monthly_summaries (
            area_id, business_category, year, month,
            total_revenue, total_profit, total_count, unit_price,
            ad_cost, ad_rate, acquisition_count, cpa,
            call_count, call_unit_price, conv_rate, profit_rate,
            help_revenue, help_count, help_unit_price, vehicle_count
          ) VALUES (
            ${row.area_id}, ${row.category}, ${row.year}, ${row.month},
            ${totalRevenue}, ${totalProfit}, ${totalCount}, ${unitPrice},
            ${adCost}, ${adRate}, ${totalCount}, ${totalCount > 0 ? Math.round(adCost / totalCount) : 0},
            ${totalCount * 3}, ${totalCount > 0 ? Math.round(totalRevenue / (totalCount * 3)) : 0}, ${33}, ${profitRate},
            0, 0, 0, 0
          )
          ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
            total_revenue = EXCLUDED.total_revenue,
            total_profit = EXCLUDED.total_profit,
            total_count = EXCLUDED.total_count,
            unit_price = EXCLUDED.unit_price,
            ad_cost = EXCLUDED.ad_cost,
            ad_rate = EXCLUDED.ad_rate,
            acquisition_count = EXCLUDED.acquisition_count,
            cpa = EXCLUDED.cpa,
            call_count = EXCLUDED.call_count,
            call_unit_price = EXCLUDED.call_unit_price,
            conv_rate = EXCLUDED.conv_rate,
            profit_rate = EXCLUDED.profit_rate
        `;
        inserted++;
      } catch (e) {
        errors.push(`${row.category}/${row.area_id}/${row.year}-${row.month}: ${String(e)}`);
      }
    }
    return NextResponse.json({ ok: true, inserted, total: SEED.length, errors });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), inserted }, { status: 500 });
  }
}
