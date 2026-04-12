import { NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export async function GET() {
  try {
    const sql = getSql();
    await sql`
      UPDATE targets SET
        target_sales = ROUND(target_sales::numeric / 10000, 2),
        target_profit = ROUND(target_profit::numeric / 10000, 2),
        target_help_sales = ROUND(target_help_sales::numeric / 10000, 2),
        target_help_unit_price = ROUND(target_help_unit_price::numeric / 10000, 2),
        target_self_sales = ROUND(target_self_sales::numeric / 10000, 2),
        target_self_profit = ROUND(target_self_profit::numeric / 10000, 2),
        target_new_sales = ROUND(target_new_sales::numeric / 10000, 2),
        target_new_profit = ROUND(target_new_profit::numeric / 10000, 2),
        target_ad_cost = ROUND(target_ad_cost::numeric / 10000, 2),
        target_unit_price = ROUND(target_unit_price::numeric / 10000, 2),
        target_call_unit_price = ROUND(target_call_unit_price::numeric / 10000, 2)
      WHERE target_sales > 1000000
    `;
    return NextResponse.json({ ok: true, message: "Fixed" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
