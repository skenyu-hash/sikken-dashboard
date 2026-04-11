import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const areasParam = searchParams.get("areas") ?? "";
  const year = Number(searchParams.get("year"));
  const category = searchParams.get("category") ?? "water";
  const areas = areasParam.split(",").map(s => s.trim()).filter(Boolean);

  if (areas.length === 0 || !year) {
    return NextResponse.json({ error: "bad params (areas, year required)" }, { status: 400 });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM monthly_summaries
      WHERE area_id = ANY(${areas})
        AND year = ${year}
        AND COALESCE(business_category, 'water') = ${category}
      ORDER BY area_id, month
    `;
    return NextResponse.json({ summaries: rows });
  } catch (e) {
    console.error("monthly-summary-bulk error:", e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
