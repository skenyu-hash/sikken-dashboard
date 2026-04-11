import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export async function POST(req: NextRequest) {
  try {
    const { rows, category } = await req.json();
    const cat: string = category ?? "water";
    const sql = getSql();
    let imported = 0;
    for (const row of rows) {
      await sql`
        INSERT INTO monthly_summaries (
          area_id, business_category, year, month,
          total_revenue, total_profit, total_count, unit_price,
          ad_cost, ad_rate, acquisition_count, cpa,
          call_count, call_unit_price, conv_rate, profit_rate,
          help_revenue, help_count, help_unit_price, vehicle_count
        ) VALUES (
          ${row.area_id}, ${cat}, ${row.year}, ${row.month},
          ${row.total_revenue ?? 0}, ${row.total_profit ?? 0}, ${row.total_count ?? 0}, ${row.unit_price ?? 0},
          ${row.ad_cost ?? 0}, ${row.ad_rate ?? 0}, ${row.acquisition_count ?? 0}, ${row.cpa ?? 0},
          ${row.call_count ?? 0}, ${row.call_unit_price ?? 0}, ${row.conv_rate ?? 0}, ${row.profit_rate ?? 0},
          ${row.help_revenue ?? 0}, ${row.help_count ?? 0}, ${row.help_unit_price ?? 0}, ${row.vehicle_count ?? 0}
        )
        ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
          total_revenue=EXCLUDED.total_revenue, total_profit=EXCLUDED.total_profit,
          total_count=EXCLUDED.total_count, unit_price=EXCLUDED.unit_price,
          ad_cost=EXCLUDED.ad_cost, ad_rate=EXCLUDED.ad_rate,
          acquisition_count=EXCLUDED.acquisition_count, cpa=EXCLUDED.cpa,
          call_count=EXCLUDED.call_count, call_unit_price=EXCLUDED.call_unit_price,
          conv_rate=EXCLUDED.conv_rate, profit_rate=EXCLUDED.profit_rate,
          help_revenue=EXCLUDED.help_revenue, help_count=EXCLUDED.help_count,
          help_unit_price=EXCLUDED.help_unit_price, vehicle_count=EXCLUDED.vehicle_count
      `;
      imported++;
    }
    return NextResponse.json({ success: true, imported });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
