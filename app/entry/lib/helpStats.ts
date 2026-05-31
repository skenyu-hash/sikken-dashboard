// PR c95-A-3: DailyReportModal 用 HELP 派生計算 + 閾値判定 (純関数)。
//
// c95-A-2 helpStaffUtils.ts と棲み分け:
//   - helpStaffUtils: /entry フォーム side。InputValue (number | "") の SUM / clean / validate。
//   - helpStats     : 日報 side。aggregated number ベースの月累積・比率・閾値判定。
//   両者は重複定義せず、必要に応じて helpStaffUtils を import する。
//
// 閾値定数 (G14: spec 確定値、UI 表示でモック準拠):
//   顧客単価 ≤ 650,000      → 赤 (#dc2626)
//   成約率   ≤ 70%          → 赤
//   引継率対総件数 ≤ 5%     → 赤
//   引継率対工事数 ≤ 30%    → 赤
//   ※ null・対応なしは赤にしない (= 0 件担当者は閾値判定対象外、spec)

import type { DailyEntry } from "../../lib/calculations";

export const HELP_UNIT_PRICE_THRESHOLD = 650000;
export const HELP_CLOSE_RATE_THRESHOLD = 70;
export const HELP_TAKEOVER_TOTAL_THRESHOLD = 5;
export const HELP_TAKEOVER_CONSTRUCTION_THRESHOLD = 30;

/** 月累積の担当者別集計行 (aggregateHelpStaffByMonth の戻り型) */
export type HelpStaffMonthly = {
  staff_name: string;
  help_sales: number;
  help_count: number;
  help_close_count: number;
};

/** 1 ヶ月分の entries[] から help_staff を staff_name で SUM。
 *  asOfDay より後の日付の entries は除外 (月初〜選択日の累積、spec)。
 *  help_staff が undefined / 空配列の entry はスキップ。
 *  staff_name が undefined の要素は名前を "" 扱いで集計 (defensive)。
 */
export function aggregateHelpStaffByMonth(
  entries: DailyEntry[],
  year: number,
  month: number,
  asOfDay: number,
): HelpStaffMonthly[] {
  const map = new Map<string, HelpStaffMonthly>();
  for (const e of entries) {
    // date 形式 "YYYY-MM-DD" 前提、year/month 不一致 entry は無視
    if (e.date.slice(0, 4) !== String(year)) continue;
    const m = e.date.slice(5, 7);
    if (Number(m) !== month) continue;
    const day = Number(e.date.slice(8, 10));
    if (day > asOfDay) continue;
    const staff = e.help_staff ?? [];
    for (const s of staff) {
      const name = s.staff_name ?? "";
      const existing = map.get(name) ?? {
        staff_name: name, help_sales: 0, help_count: 0, help_close_count: 0,
      };
      existing.help_sales += s.help_sales ?? 0;
      existing.help_count += s.help_count ?? 0;
      existing.help_close_count += s.help_close_count ?? 0;
      map.set(name, existing);
    }
  }
  return Array.from(map.values());
}

/** HELP 客単価 (集計値ベース) = help_sales ÷ help_count。件数 0 で null (赤にしない判定用)。
 *  ※ helpStaffUtils.helpUnitPrice は InputValue 入力フォーム側用、本関数は number 集計側用。
 */
export function helpUnitPriceFromAggregate(helpSales: number, helpCount: number): number | null {
  return helpCount === 0 ? null : helpSales / helpCount;
}

/** 成約率 = help_close_count ÷ help_count × 100。件数 0 で null。 */
export function closeRate(helpCloseCount: number, helpCount: number): number | null {
  return helpCount === 0 ? null : (helpCloseCount / helpCount) * 100;
}

/** 引継率 (対総件数) = help_count ÷ company_total_count × 100。分母 0 で null。 */
export function takeoverRateByTotal(helpCount: number, companyTotalCount: number): number | null {
  return companyTotalCount === 0 ? null : (helpCount / companyTotalCount) * 100;
}

/** 引継率 (対工事数) = help_count ÷ company_construction_count × 100。分母 0 で null。 */
export function takeoverRateByConstruction(helpCount: number, companyConstructionCount: number): number | null {
  return companyConstructionCount === 0 ? null : (helpCount / companyConstructionCount) * 100;
}

/** 売上高率 = help_sales ÷ company_total_revenue × 100。分母 0 で null。 */
export function helpSalesRatio(helpSales: number, companyTotalRevenue: number): number | null {
  return companyTotalRevenue === 0 ? null : (helpSales / companyTotalRevenue) * 100;
}

/** 4 つの閾値判定結果 (赤字 #dc2626 表示用)。null は false (spec: 赤にしない)。 */
export type HelpThresholdResult = {
  unitPriceAlert: boolean;            // 顧客単価 ≤ 650,000
  closeRateAlert: boolean;            // 成約率 ≤ 70%
  takeoverTotalAlert: boolean;        // 引継率対総件数 ≤ 5%
  takeoverConstructionAlert: boolean; // 引継率対工事数 ≤ 30%
};

/** 各値が閾値以下なら alert (= true)。null は alert 対象外 (= false)。 */
export function evaluateThresholds(
  unitPrice: number | null,
  closeRateValue: number | null,
  takeoverTotal: number | null,
  takeoverConstruction: number | null,
): HelpThresholdResult {
  return {
    unitPriceAlert: unitPrice !== null && unitPrice <= HELP_UNIT_PRICE_THRESHOLD,
    closeRateAlert: closeRateValue !== null && closeRateValue <= HELP_CLOSE_RATE_THRESHOLD,
    takeoverTotalAlert: takeoverTotal !== null && takeoverTotal <= HELP_TAKEOVER_TOTAL_THRESHOLD,
    takeoverConstructionAlert: takeoverConstruction !== null && takeoverConstruction <= HELP_TAKEOVER_CONSTRUCTION_THRESHOLD,
  };
}
