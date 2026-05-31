// PR c95-A-3: DailyReportModal の KPI 帯 (今日 + 現在地) 計算 (純関数)。
//
// 業態別の粗利式・件数式の差異を本 helper に集約。DailyReportModal は category と
// todayEntry / summary を渡して、4 つの KPI セル (売上 / 粗利 / 対応件数 / 客単価) と
// 粗利率 (当日ベース、Web Claude 確定) を取得する。
//
// 粗利率は ★当日ベース★ (= 当日粗利 ÷ 当日売上)、月累計 ÷ 月累計売上 ではない。

import type { DailyEntry } from "../../../lib/calculations";
import type { BusinessCategory } from "../../../lib/businesses";

export type KpiToday = {
  sales: number;
  profit: number;
  count: number;
  unitPrice: number;
  profitRate: number | null;
};

export type KpiMonthly = {
  sales: number;
  profit: number;
  count: number;
  unitPrice: number;
};

const num = (v: number | undefined | null): number => Number(v ?? 0) || 0;

/** 当日 KPI (業態別の売上式・件数式・粗利式を適用)。
 *  todayEntry が null/undefined のときは null を返す (= 未入力日)。
 */
export function computeKpiToday(category: BusinessCategory, e: DailyEntry | null | undefined): KpiToday | null {
  if (!e) return null;
  let sales = 0, count = 0, profit = 0;

  if (category === "water" || category === "electric") {
    sales = num(e.outsourced_sales_revenue) + num(e.internal_staff_revenue);
    count = num(e.outsourced_response_count) + num(e.internal_staff_response_count);
    profit = sales
      - num(e.total_labor_cost) - num(e.material_cost)
      - num(e.ad_cost) - num(e.sales_outsourcing_cost) - num(e.card_processing_fee);
  } else if (category === "locksmith") {
    sales = num(e.outsourced_sales_revenue);
    count = num(e.acquisition_count);
    profit = sales
      - num(e.locksmith_construction_cost) - num(e.material_cost)
      - num(e.ad_cost) - num(e.locksmith_commission_fee);
  } else if (category === "road") {
    sales = num(e.outsourced_sales_revenue);
    count = num(e.acquisition_count);
    profit = sales - num(e.ad_cost) - num(e.sales_outsourcing_cost);
  } else if (category === "detective") {
    sales = num(e.outsourced_sales_revenue);
    count = num(e.acquisition_count);
    profit = sales - num(e.ad_cost);
  }

  const unitPrice = count === 0 ? 0 : Math.round(sales / count);
  const profitRate = sales === 0 ? null : Math.round((profit / sales) * 1000) / 10;
  return { sales, profit, count, unitPrice, profitRate };
}

/** 月累計 KPI (summary 直読、aggregation 経路の正規値を採用)。 */
export function computeKpiMonthly(summary: Record<string, unknown> | null | undefined): KpiMonthly {
  return {
    sales: num(summary?.total_revenue as number | undefined),
    profit: num(summary?.total_profit as number | undefined),
    count: num(summary?.total_count as number | undefined),
    unitPrice: num(summary?.unit_price as number | undefined),
  };
}
