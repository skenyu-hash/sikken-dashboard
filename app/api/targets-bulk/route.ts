import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";
import { currentRole } from "../../lib/auth";
import { rowToTargets } from "../../lib/targetsRow";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const areasParam = searchParams.get("areas") ?? "";
  const year = Number(searchParams.get("year"));
  const category = searchParams.get("category") ?? "water";
  // year-view (slice 2): full=1 で全 target 列を Targets 型にマップして返す。
  //   既存呼出 (/targets コピー, /trends) は full なし → 従来の target_sales のみ rows (レスポンス不変)。
  const full = searchParams.get("full") === "1";
  const areas = areasParam.split(",").map(s => s.trim()).filter(Boolean);

  if (areas.length === 0 || !year) {
    return NextResponse.json({ error: "bad params (areas, year required)" }, { status: 400 });
  }

  try {
    const sql = getSql();
    if (full) {
      const rows = (await sql`
        SELECT * FROM targets
        WHERE area_id = ANY(${areas})
          AND year = ${year}
          AND COALESCE(business_category, 'water') = ${category}
        ORDER BY area_id, month
      `) as Record<string, unknown>[];
      const targets = rows.map((r) => ({
        area_id: String(r.area_id ?? ""),
        year: Number(r.year),
        month: Number(r.month),
        targets: rowToTargets(r),
      }));
      return NextResponse.json({ targets });
    }
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
