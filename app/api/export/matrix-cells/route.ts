import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
import { currentRole } from "../../../lib/auth";
import { hasPageAccess } from "../../../lib/permissions";
import { AREA_NAMES, BUSINESSES } from "../../../lib/businesses";
import {
  buildMatrixRows,
  buildMatrixCols,
  buildMatrix,
} from "../../../data-io/lib/matrixCells";

export const runtime = "nodejs";

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export async function GET(req: NextRequest) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPageAccess({ role }, "data-io", "view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area") ?? "";
  const category = searchParams.get("category") ?? "";
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!area || !category || !year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "missing required params: area, category, year, month" },
      { status: 400 }
    );
  }
  if (!AREA_NAMES[area]) {
    return NextResponse.json({ error: `unknown area: ${area}` }, { status: 400 });
  }
  if (!BUSINESSES.find((b) => b.id === category)) {
    return NextResponse.json({ error: `unknown category: ${category}` }, { status: 400 });
  }

  // UI から渡された値があれば優先、なければ DB から取得して埋める
  const profitRateParam = searchParams.get("profit_rate");
  const adRateParam = searchParams.get("ad_rate");
  const fixedCostParam = searchParams.get("fixed_cost_man");
  const cfExtraParam = searchParams.get("cf_extra_man");
  const currentRevenueParam = searchParams.get("current_revenue_man");
  const forecastRevenueParam = searchParams.get("forecast_revenue_man");

  let profitRatePct = profitRateParam !== null ? Number(profitRateParam) : 25;
  let adRatePct = adRateParam !== null ? Number(adRateParam) : 20;
  const fixedCostMan =
    fixedCostParam !== null ? Number(fixedCostParam) : 0;
  const cfExtraMan = cfExtraParam !== null ? Number(cfExtraParam) : 0;
  let currentRevenueMan =
    currentRevenueParam !== null ? Number(currentRevenueParam) : 0;
  let forecastRevenueMan =
    forecastRevenueParam !== null ? Number(forecastRevenueParam) : 0;

  // UI から十分な値が来なかった場合、DB から補完
  if (
    profitRateParam === null ||
    adRateParam === null ||
    currentRevenueParam === null
  ) {
    try {
      const sql = getSql();
      const rows = (await sql`
        SELECT total_revenue, profit_rate, ad_rate
        FROM monthly_summaries
        WHERE area_id = ${area}
          AND COALESCE(business_category, 'water') = ${category}
          AND year = ${year}
          AND month = ${month}
        LIMIT 1
      `) as Array<{
        total_revenue: number | string;
        profit_rate: number | string;
        ad_rate: number | string;
      }>;
      if (rows.length > 0) {
        const s = rows[0];
        const totalRevenue = Number(s.total_revenue) || 0;
        const pr = Number(s.profit_rate) || 0;
        const ar = Number(s.ad_rate) || 0;
        if (profitRateParam === null && pr > 0) profitRatePct = pr;
        if (adRateParam === null && ar > 0) adRatePct = ar;
        if (currentRevenueParam === null && totalRevenue > 0) {
          currentRevenueMan = Math.round(totalRevenue / 10000);
          if (forecastRevenueParam === null) {
            const today = new Date();
            const isCurrentMonth =
              today.getFullYear() === year && today.getMonth() + 1 === month;
            const daysElapsed = isCurrentMonth ? Math.max(1, today.getDate()) : getDaysInMonth(year, month);
            const daysInMonth = getDaysInMonth(year, month);
            forecastRevenueMan = Math.round(
              (currentRevenueMan / daysElapsed) * daysInMonth
            );
          }
        }
      }
    } catch (e) {
      console.error("/api/export/matrix-cells (fetch context):", e);
      // 取得失敗してもフォールバック値で続行
    }
  }

  const rowsMan = buildMatrixRows(forecastRevenueMan, currentRevenueMan);
  const cols = buildMatrixCols();
  const matrix = buildMatrix(rowsMan, cols, profitRatePct, fixedCostMan, cfExtraMan);

  return NextResponse.json({
    ok: true,
    data: {
      header: ["売上(万)", ...cols.map((c) => `${c}%`)],
      rows: matrix,
      params: {
        area,
        area_name: AREA_NAMES[area],
        category,
        business_label: BUSINESSES.find((b) => b.id === category)?.label ?? category,
        year,
        month,
        profit_rate: profitRatePct,
        ad_rate: adRatePct,
        fixed_cost_man: fixedCostMan,
        cf_extra_man: cfExtraMan,
        current_revenue_man: currentRevenueMan,
        forecast_revenue_man: forecastRevenueMan,
      },
    },
    meta: {
      rowCount: rowsMan.length,
      colCount: cols.length,
      cellCount: rowsMan.length * cols.length,
      generatedAt: new Date().toISOString(),
    },
  });
}
