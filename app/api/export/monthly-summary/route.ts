import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
import { currentRole } from "../../../lib/auth";
import { canAccessPage } from "../../../lib/roles";
import { AREA_NAMES, BUSINESSES } from "../../../lib/businesses";

export const runtime = "nodejs";

const MAX_MONTHS = 36;

function ymToInt(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number(m[2]);
}

export async function GET(req: NextRequest) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canAccessPage(role, "/data-io")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defaultFromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const defaultFrom = `${defaultFromDate.getFullYear()}-${String(defaultFromDate.getMonth() + 1).padStart(2, "0")}`;

  const fromStr = searchParams.get("from") ?? defaultFrom;
  const toStr = searchParams.get("to") ?? defaultTo;
  const fromInt = ymToInt(fromStr);
  const toInt = ymToInt(toStr);
  if (fromInt === null || toInt === null) {
    return NextResponse.json({ error: "invalid from/to (YYYY-MM)" }, { status: 400 });
  }
  if (fromInt > toInt) {
    return NextResponse.json({ error: "from must be <= to" }, { status: 400 });
  }
  const fromYM = { y: Math.floor(fromInt / 100), m: fromInt % 100 };
  const toYM = { y: Math.floor(toInt / 100), m: toInt % 100 };
  const monthSpan = (toYM.y - fromYM.y) * 12 + (toYM.m - fromYM.m) + 1;
  if (monthSpan > MAX_MONTHS) {
    return NextResponse.json(
      { error: `period too long: max ${MAX_MONTHS} months` },
      { status: 400 }
    );
  }

  const allCategories = BUSINESSES.map((b) => b.id);
  const categoriesParam = searchParams.get("categories");
  const categories = categoriesParam
    ? categoriesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : allCategories;
  const allAreas = Object.keys(AREA_NAMES);
  const areasParam = searchParams.get("areas");
  const areas = areasParam
    ? areasParam.split(",").map((s) => s.trim()).filter(Boolean)
    : allAreas;

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        year, month, area_id,
        COALESCE(business_category, 'water') AS business_category,
        total_revenue, total_profit, total_count,
        unit_price, ad_cost, cpa, call_count, acquisition_count,
        ad_rate, conv_rate, profit_rate,
        help_revenue, help_count, help_unit_price,
        vehicle_count, created_at
      FROM monthly_summaries
      WHERE (year * 100 + month) BETWEEN ${fromInt} AND ${toInt}
        AND COALESCE(business_category, 'water') = ANY(${categories})
        AND area_id = ANY(${areas})
      ORDER BY year DESC, month DESC, area_id, business_category
    `) as Array<Record<string, unknown>>;

    const businessLabel = (id: string) =>
      BUSINESSES.find((b) => b.id === id)?.label ?? id;

    const data = rows.map((r) => ({
      ...r,
      area_name: AREA_NAMES[String(r.area_id)] ?? r.area_id,
      business_label: businessLabel(String(r.business_category)),
    }));

    return NextResponse.json({
      ok: true,
      data,
      meta: {
        count: data.length,
        from: fromStr,
        to: toStr,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("/api/export/monthly-summary:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
