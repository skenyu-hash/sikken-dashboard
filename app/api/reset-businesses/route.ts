import { NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export const runtime = "nodejs";

export async function GET() {
  const sql = getSql();
  try {
    const rows = await sql`
      DELETE FROM monthly_summaries
      WHERE business_category IN ('electric', 'locksmith', 'road', 'detective')
        AND year = 2026
      RETURNING area_id, business_category, year, month
    `;
    return NextResponse.json({
      ok: true,
      deleted: (rows as unknown[]).length,
      rows,
    });
  } catch (e) {
    console.error("reset-businesses error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
