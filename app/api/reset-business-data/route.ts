import { NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export async function GET() {
  try {
    const sql = getSql();
    await sql`
      DELETE FROM monthly_summaries
      WHERE business_category IN ('electric', 'locksmith', 'road', 'detective')
        AND year = 2026
    `;
    return NextResponse.json({ ok: true, message: "Reset completed" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
