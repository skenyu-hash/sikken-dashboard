import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";
import { currentRole } from "../../lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
      SELECT area_id, year, month, target_sales
      FROM targets
      WHERE area_id = ANY(${areas})
        AND year = ${year}
        AND COALESCE(business_category, 'water') = ${category}
      ORDER BY area_id, month
    `;
    return NextResponse.json({ targets: rows });
  } catch (e) {
    console.error("targets-bulk error:", e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
