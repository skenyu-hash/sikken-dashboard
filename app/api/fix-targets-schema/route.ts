import { NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export async function GET() {
  try {
    const sql = getSql();
    await sql`
      ALTER TABLE targets
        ALTER COLUMN target_sales TYPE numeric(15,4),
        ALTER COLUMN target_profit TYPE numeric(15,4),
        ALTER COLUMN target_help_sales TYPE numeric(15,4),
        ALTER COLUMN target_help_unit_price TYPE numeric(15,4),
        ALTER COLUMN target_self_sales TYPE numeric(15,4),
        ALTER COLUMN target_self_profit TYPE numeric(15,4),
        ALTER COLUMN target_new_sales TYPE numeric(15,4),
        ALTER COLUMN target_new_profit TYPE numeric(15,4),
        ALTER COLUMN target_ad_cost TYPE numeric(15,4),
        ALTER COLUMN target_unit_price TYPE numeric(15,4),
        ALTER COLUMN target_call_unit_price TYPE numeric(15,4)
    `;
    return NextResponse.json({ ok: true, message: "Schema updated" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
