// PR c95-A-3: DailyReportModal の KPI 帯 (今日 + 現在地) 計算 (純関数)。
//
// 業態別の粗利式・件数式の差異を本 helper に集約。DailyReportModal は category と
// todayEntry / summary を渡して、4 つの KPI セル (売上 / 粗利 / 対応件数 / 客単価) と
// 粗利率 (当日ベース、Web Claude 確定) を取得する。
//
// 粗利率は ★当日ベース★ (= 当日粗利 ÷ 当日売上)、月累計 ÷ 月累計売上 ではない。

import type { DailyEntry } from "../../../lib/calculations";
import type { BusinessCategory } from "../../../lib/businesses";
// PR c95-D-5 (slice 5): water day-level 控除を「自動 7.7%」から「手入力 e.consultant_fee」直接控除に切替。
//   月境界定数 CONSULTANT_FEE_APPLIED_FROM_YYYYMM のみ流用 (slice 6 で consultantFee.ts 撤去予定)。
import { CONSULTANT_FEE_APPLIED_FROM_YYYYMM } from "../../../lib/consultantFee";

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
    // PR c95-D-5 (slice 5): water 当日粗利は手入力 e.consultant_fee を直接控除。
    //   旧 c95-B-3: profit -= consultantFee(category, sales, yyyymm) (= sales × 0.077)
    //   新 c95-D-5: water + yyyymm >= 202605 で e.consultant_fee を控除。
    //   月境界 (yyyymm >= 202605) は維持 → 4 月以前の当日表示は控除 0 で従来通り (絶対不変)。
    //   electric は water 以外なので控除 0 (従来通り、e.consultant_fee は 0 送信されている)。
    if (category === "water") {
      const yyyymm = Number(e.date.slice(0, 4)) * 100 + Number(e.date.slice(5, 7));
      if (yyyymm >= CONSULTANT_FEE_APPLIED_FROM_YYYYMM) {
        profit -= num(e.consultant_fee);
      }
    }
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
