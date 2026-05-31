// PR c95-A-3: 日報テキスト共有用フォーマッター (純関数)。
//
// 用途: DailyReportModal の「テキストでコピー」「LINE / メール送信」アクション。
//   navigator.clipboard.writeText / mailto: body=... / line.me/R/share?text=... に流す。
//   plain text (markdown 不使用、改行 + 全角スペース整列)。
//
// 設計原則 (presentation 純関数):
//   - 業態別 KPI 計算 (粗利式の差異等) は caller の責務、本 lib は受け取って整形のみ。
//   - hasHelp フラグで HELP セクション出力を制御 (水道/電気/鍵=true、ロード/探偵=false)。
//   - 閾値判定は helpStats.evaluateThresholds 経由、null は表示「–」+ alert 対象外。

import {
  helpUnitPriceFromAggregate, closeRate as computeCloseRate,
  takeoverRateByTotal, takeoverRateByConstruction, helpSalesRatio,
  evaluateThresholds,
  type HelpStaffMonthly,
} from "./helpStats";

const yen = (n: number): string => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const cnt = (n: number): string => `${Math.round(n).toLocaleString("ja-JP")}件`;
const pct = (n: number | null): string => (n === null ? "–" : `${(Math.round(n * 10) / 10).toFixed(1)}%`);

type Input = {
  date: string;          // YYYY-MM-DD
  areaName: string;      // 関西
  categoryLabel: string; // 水道
  hasHelp: boolean;      // 水道/電気/鍵=true、ロード/探偵=false
  kpi: {
    /** 当日 (todayEntry 由来、未入力日は null)。粗利率は当日ベース (Web Claude 確定)。 */
    today: {
      sales: number; profit: number; count: number; unitPrice: number;
      profitRate: number | null;
    } | null;
    /** 月累計 (summary 由来) */
    monthly: { sales: number; profit: number; count: number };
  };
  /** ⑤HELP 月累計の担当者別 (aggregateHelpStaffByMonth 結果)。hasHelp=false なら無視。 */
  helpStaffMonthly: HelpStaffMonthly[];
  /** HELP の引継率・売上高率分母 (月累計)。hasHelp=true 時のみ参照。 */
  companyReference?: { totalRevenue: number; totalCount: number; constructionCount: number };
};

export function buildDailyReportText(input: Input): string {
  const lines: string[] = [];

  // ── ヘッダ ────────────────────────────────
  lines.push(`【日報】${input.date} / ${input.areaName} / ${input.categoryLabel}`);
  lines.push("");

  // ── KPI 帯 ───────────────────────────────
  lines.push("▼ KPI");
  if (input.kpi.today === null) {
    lines.push("  当日 データなし");
  } else {
    const t = input.kpi.today;
    lines.push(`  今日 売上    ${yen(t.sales)}    (現在地 ${yen(input.kpi.monthly.sales)})`);
    const profitLine = `  今日 粗利    ${yen(t.profit)}    (現在地 ${yen(input.kpi.monthly.profit)})`;
    lines.push(t.profitRate !== null ? `${profitLine} ※当日粗利率 ${pct(t.profitRate)}` : profitLine);
    lines.push(`  今日 件数    ${cnt(t.count)}    (現在地 ${cnt(input.kpi.monthly.count)})`);
    lines.push(`  今日 客単価  ${yen(t.unitPrice)}`);
  }
  // データなし時も月累計を見せる (spec)
  if (input.kpi.today === null) {
    lines.push(`  月累計 売上  ${yen(input.kpi.monthly.sales)}`);
    lines.push(`  月累計 粗利  ${yen(input.kpi.monthly.profit)}`);
    lines.push(`  月累計 件数  ${cnt(input.kpi.monthly.count)}`);
  }
  lines.push("");

  // ── ⑤HELP セクション (hasHelp=true のみ) ─────
  if (input.hasHelp) {
    lines.push("▼ ⑤HELP (月累計)");

    if (input.helpStaffMonthly.length === 0) {
      lines.push("  HELP 対応なし");
    } else {
      // 担当者別 行
      for (const s of input.helpStaffMonthly) {
        const up = helpUnitPriceFromAggregate(s.help_sales, s.help_count);
        const cr = computeCloseRate(s.help_close_count, s.help_count);
        const thresh = evaluateThresholds(up, cr, null, null);
        const mark = (alert: boolean) => (alert ? " ⚠" : "");
        const upLabel = up === null ? "単価 –" : `単価 ${yen(up)}${mark(thresh.unitPriceAlert)}`;
        const crLabel = cr === null ? "成約 –" : `成約 ${cnt(s.help_close_count)} (${pct(cr)}${mark(thresh.closeRateAlert) ? " ⚠" : ""})`;
        const salesLabel = s.help_count === 0 ? "売上 –" : `売上 ${yen(s.help_sales)}`;
        const countLabel = s.help_count === 0 ? "件数 0件" : `件数 ${cnt(s.help_count)}`;
        lines.push(`  ${s.staff_name}  ${salesLabel} / ${countLabel} / ${upLabel} / ${crLabel}`);
      }

      // 会社参照 + 引継率 / 売上高率 (companyReference があれば)
      if (input.companyReference) {
        const sumSales = input.helpStaffMonthly.reduce((a, r) => a + r.help_sales, 0);
        const sumCount = input.helpStaffMonthly.reduce((a, r) => a + r.help_count, 0);
        const ref = input.companyReference;
        const ratio = helpSalesRatio(sumSales, ref.totalRevenue);
        const tk1 = takeoverRateByTotal(sumCount, ref.totalCount);
        const tk2 = takeoverRateByConstruction(sumCount, ref.constructionCount);
        const refThresh = evaluateThresholds(null, null, tk1, tk2);
        lines.push("  ─────");
        lines.push(`  会社参照: 売上 ${yen(ref.totalRevenue)} / 件数 ${cnt(ref.totalCount)} / 工事 ${cnt(ref.constructionCount)}`);
        const ratioPart = `売上高率 ${pct(ratio)}`;
        const tk1Part = `引継率対総件数 ${pct(tk1)}${refThresh.takeoverTotalAlert ? " ⚠" : ""}`;
        const tk2Part = `引継率対工事数 ${pct(tk2)}${refThresh.takeoverConstructionAlert ? " ⚠" : ""}`;
        lines.push(`  ${ratioPart} / ${tk1Part} / ${tk2Part}`);
      }
    }
  }

  return lines.join("\n");
}
