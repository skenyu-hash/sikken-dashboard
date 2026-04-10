import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area");
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  const sql = getSql();
  const rows = await sql`
    SELECT * FROM monthly_summaries
    WHERE area_id = ${area} AND year = ${year} AND month = ${month}
    LIMIT 1
  `;

  return NextResponse.json({ summary: rows[0] ?? null });
}
