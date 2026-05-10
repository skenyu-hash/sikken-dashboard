import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
import { currentRole } from "../../../lib/auth";
import { hasPageAccess } from "../../../lib/permissions";
import { AREA_NAMES, BUSINESSES } from "../../../lib/businesses";

export const runtime = "nodejs";

const MAX_MONTHS = 12;

function ymToInt(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number(m[2]);
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

type Row = {
  area_id: string;
  business_category: string;
  year: number;
  month: number;
  revenue: number;
  profit: number;
  ad_cost: number;
};

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
      { error: `period too long: max ${MAX_MONTHS} months (full-report)` },
      { status: 400 }
    );
  }

  try {
    const sql = getSql();
    const rawRows = (await sql`
      SELECT
        area_id,
        COALESCE(business_category, 'water') AS business_category,
        year, month,
        COALESCE(total_revenue, 0)::bigint AS revenue,
        COALESCE(total_profit, 0)::bigint AS profit,
        COALESCE(ad_cost, 0)::bigint AS ad_cost
      FROM monthly_summaries
      WHERE (year * 100 + month) BETWEEN ${fromInt} AND ${toInt}
    `) as Array<{
      area_id: string;
      business_category: string;
      year: number;
      month: number;
      revenue: number | string;
      profit: number | string;
      ad_cost: number | string;
    }>;

    const rows: Row[] = rawRows.map((r) => ({
      area_id: r.area_id,
      business_category: r.business_category,
      year: r.year,
      month: r.month,
      revenue: Number(r.revenue) || 0,
      profit: Number(r.profit) || 0,
      ad_cost: Number(r.ad_cost) || 0,
    }));

    const categories = BUSINESSES.map((b) => ({ id: b.id, label: b.label }));
    const areaIds = Object.keys(AREA_NAMES);
    const areaList = areaIds.map((id) => ({ area_id: id, area_name: AREA_NAMES[id] }));

    const monthIdx = new Map<string, number>(months.map((ym, i) => [ym, i]));
    const catIdx = new Map<string, number>(categories.map((c, i) => [c.id, i]));
    const areaIdx = new Map<string, number>(areaIds.map((id, i) => [id, i]));

    const zeroMC = () =>
      months.map(() => Array(categories.length).fill(0) as number[]);
    const zeroMA = () =>
      months.map(() => Array(areaIds.length).fill(0) as number[]);
    const zeroCA = () =>
      categories.map(() => Array(areaIds.length).fill(0) as number[]);

    const sheet1 = {
      revenue: zeroMC(),
      profit: zeroMC(),
      ad_cost: zeroMC(),
    };
    const sheet2 = {
      revenue: zeroMA(),
      profit: zeroMA(),
      ad_cost: zeroMA(),
    };
    const sheet3 = {
      revenue: zeroCA(),
      profit: zeroCA(),
      ad_cost: zeroCA(),
    };

    for (const r of rows) {
      const ym = `${r.year}-${String(r.month).padStart(2, "0")}`;
      const mi = monthIdx.get(ym);
      const ci = catIdx.get(r.business_category);
      const ai = areaIdx.get(r.area_id);
      if (mi !== undefined && ci !== undefined) {
        sheet1.revenue[mi][ci] += r.revenue;
        sheet1.profit[mi][ci] += r.profit;
        sheet1.ad_cost[mi][ci] += r.ad_cost;
      }
      if (mi !== undefined && ai !== undefined) {
        sheet2.revenue[mi][ai] += r.revenue;
        sheet2.profit[mi][ai] += r.profit;
        sheet2.ad_cost[mi][ai] += r.ad_cost;
      }
      if (ci !== undefined && ai !== undefined) {
        sheet3.revenue[ci][ai] += r.revenue;
        sheet3.profit[ci][ai] += r.profit;
        sheet3.ad_cost[ci][ai] += r.ad_cost;
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        sheet1_monthly_by_category: { months, categories, ...sheet1 },
        sheet2_monthly_by_area: { months, areas: areaList, ...sheet2 },
        sheet3_category_by_area: { categories, areas: areaList, ...sheet3 },
      },
      meta: {
        from: fromStr,
        to: toStr,
        monthCount: months.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("/api/export/full-report:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
