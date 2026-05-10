import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
import { currentRole } from "../../../lib/auth";
import { hasPageAccess } from "../../../lib/permissions";
import { AREA_NAMES, BUSINESSES } from "../../../lib/businesses";

export const runtime = "nodejs";

const MAX_MONTHS = 36;

function ymToInt(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number(m[2]);
}

function intToYm(n: number): string {
  const y = Math.floor(n / 100);
  const m = n % 100;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function buildMonthList(fromInt: number, toInt: number): string[] {
  const list: string[] = [];
  let y = Math.floor(fromInt / 100);
  let m = fromInt % 100;
  const toY = Math.floor(toInt / 100);
  const toM = toInt % 100;
  while (y < toY || (y === toY && m <= toM)) {
    list.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return list;
}

export async function GET(req: NextRequest) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPageAccess({ role }, "data-io", "view")) {
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
  const months = buildMonthList(fromInt, toInt);
  if (months.length > MAX_MONTHS) {
    return NextResponse.json(
      { error: `period too long: max ${MAX_MONTHS} months` },
      { status: 400 }
    );
  }

  const category = searchParams.get("category");
  const allCategoryIds = BUSINESSES.map((b) => b.id);
  if (category && !allCategoryIds.includes(category as (typeof allCategoryIds)[number])) {
    return NextResponse.json({ error: `unknown category: ${category}` }, { status: 400 });
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        area_id, year, month,
        SUM(total_revenue)::bigint AS revenue,
        SUM(total_profit)::bigint AS profit,
        SUM(ad_cost)::bigint AS ad_cost
      FROM monthly_summaries
      WHERE (year * 100 + month) BETWEEN ${fromInt} AND ${toInt}
        AND (${category}::text IS NULL OR COALESCE(business_category, 'water') = ${category})
      GROUP BY area_id, year, month
    `) as Array<{
      area_id: string;
      year: number;
      month: number;
      revenue: number | string;
      profit: number | string;
      ad_cost: number | string;
    }>;

    const areaIds = Object.keys(AREA_NAMES);
    const areaList = areaIds.map((id) => ({ area_id: id, area_name: AREA_NAMES[id] }));
    const monthIndex = new Map(months.map((ym, i) => [ym, i]));
    const areaIndex = new Map(areaIds.map((id, i) => [id, i]));

    const make2D = () =>
      areaIds.map(() => Array(months.length).fill(0) as number[]);
    const revenue = make2D();
    const profit = make2D();
    const adCost = make2D();

    for (const r of rows) {
      const ym = `${r.year}-${String(r.month).padStart(2, "0")}`;
      const ci = monthIndex.get(ym);
      const ri = areaIndex.get(r.area_id);
      if (ci === undefined || ri === undefined) continue;
      revenue[ri][ci] = Number(r.revenue) || 0;
      profit[ri][ci] = Number(r.profit) || 0;
      adCost[ri][ci] = Number(r.ad_cost) || 0;
    }

    return NextResponse.json({
      ok: true,
      data: {
        months,
        areas: areaList,
        revenue,
        profit,
        ad_cost: adCost,
        category: category ?? null,
      },
      meta: {
        areaCount: areaIds.length,
        monthCount: months.length,
        from: intToYm(fromInt),
        to: intToYm(toInt),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("/api/export/area-pivot:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
