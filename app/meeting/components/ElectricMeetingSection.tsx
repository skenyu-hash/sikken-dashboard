"use client";
// PR #55 c4: 電気業態用 会議シートセクション。
//
// 構成 (ElectricDashboardSection と 1:1 対応、+ 部門別実績テーブル):
//   ① 新規対応・コスト・粗利 (売上 / 6 コスト + 粗利)
//   ② 広告・効率指標 (広告費率 / 入電 / CPA / 成約率 / 客単価)
//   ③ 施工 (工事件数 / 工事取得率 / 工事費)
//   ④ HELP (HELP売上 / 件数 / 客単価 / 率)
//   ⑤ 電気専用 (分電盤件数 / 目標 / 達成率)
//   + 部門別実績テーブル (水道・電気特有、自社施工/新規営業/HELP)
//
// 派生値:
//   粗利 = resolveTotalProfit (PR #51.2、legacy 行フォールバック対応)
//   工事取得率 = (外注+内勤) ÷ 対応件数 × 100
//
// 部門別実績テーブルは monthlySummary では取得できないため、displaySummary
// (DashboardSummary) を別途受け取って描画する。

import { yen } from "../../lib/calculations";
import type { Targets, DashboardSummary } from "../../lib/calculations";
import { resolveTotalProfit } from "../../lib/profit";
import { MetricRow, SectionTable, fmtYen, fmtCount, fmtPct, type MeetingPeriodProps } from "./MetricRow";
import { SECTION } from "../../components/sectionStyles";

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
// ⑥ 体制 (PR c94-C-3a) — 車両数/研修生の単位表示 (件ではなく台/人)
const fmtVehicle = (v: number): string => (v > 0 ? `${v}台` : "—");
const fmtTrainee = (v: number): string => (v > 0 ? `${v}人` : "—");

type Props = MeetingPeriodProps & {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
  /** 部門別実績テーブル (自社施工/新規営業/HELP) 用 */
  displaySummary: DashboardSummary;
};

export default function ElectricMeetingSection({
  monthlySummary, targets, displaySummary, isEndPeriod, daysElapsed, daysInMonth,
}: Props) {
  const mp = { isEndPeriod, daysElapsed, daysInMonth };

  // 売上・コスト
  const sales = numOf(monthlySummary?.total_revenue);
  const laborCost = numOf(monthlySummary?.total_labor_cost);
  const materialCost = numOf(monthlySummary?.material_cost);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.sales_outsourcing_cost);
  const cardFee = numOf(monthlySummary?.card_processing_fee);
  const profit = resolveTotalProfit(monthlySummary);

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const totalCount = numOf(monthlySummary?.total_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;
  const adRate = safeDiv(adCost, sales) * 100;
  const unitPrice = Math.round(safeDiv(sales, totalCount));

  // PR c93-5: 対応ベース化 (ElectricDashboardSection と完全同等、UI 統一)。
  //   旧 (c93-2 未対応): total = outsourced + internal (発注ベース、二重カウント)
  //   新: construction_count = 対応 1 件 = 工事 1 件 (10万円以上)
  //   internalConstructionRatio = 自社工事件数 ÷ 工事件数 × 100 (新規 auto)
  const constructionCount = numOf(monthlySummary?.construction_count);
  const internalConstructionCount = numOf(monthlySummary?.internal_construction_count);
  const constructionRate = safeDiv(constructionCount, totalCount) * 100;
  const internalConstructionRatio = safeDiv(internalConstructionCount, constructionCount) * 100;
  const outsourcedConstructionCost = numOf(monthlySummary?.outsourced_construction_cost);
  const internalConstructionProfit = numOf(monthlySummary?.internal_construction_profit);

  // HELP
  const helpRevenue = numOf(monthlySummary?.help_revenue);
  const helpCount = numOf(monthlySummary?.help_count);
  const helpUnitPrice = Math.round(safeDiv(helpRevenue, helpCount));
  // HELP 率 = HELP件数 ÷ 対応件数 × 100 (浸透率)。ダッシュボードと定義統一 (旧 HELP売上÷売上 から変更)。
  const helpRate = safeDiv(helpCount, totalCount) * 100;

  // 電気専用
  const switchboardCount = numOf(monthlySummary?.switchboard_count);

  // ⑥ 体制 (PR c94-C-3a)
  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);

  // 部門別実績 (水道・電気特有、displaySummary から)
  const depts = [
    { name: "自社施工", color: "#059669", d: displaySummary.self },
    { name: "新規営業", color: "#3b82f6", d: displaySummary.newSales },
    { name: "ヘルプ",   color: "#0891b2", d: displaySummary.help },
  ];

  return (
    <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SECTION.GAP, gridAutoRows: "min-content" }}>
      <SectionTable title="① 新規対応・コスト・粗利" group="rev" count={7} defaultOpen>
        <MetricRow label="売上"        actual={sales}         target={targets.targetSales}  {...mp} format={fmtYen} />
        <MetricRow label="職人費"      actual={laborCost}     target={0}                     {...mp} format={fmtYen} invertGap />
        <MetricRow label="材料費"      actual={materialCost}  target={0}                     {...mp} format={fmtYen} invertGap />
        <MetricRow label="広告費"      actual={adCost}        target={targets.targetAdCost} {...mp} format={fmtYen} invertGap />
        <MetricRow label="営業外注費"  actual={commission}    target={0}                     {...mp} format={fmtYen} invertGap />
        <MetricRow label="カード手数料" actual={cardFee}      target={0}                     {...mp} format={fmtYen} invertGap />
        <MetricRow label="粗利"        actual={profit}        target={targets.targetProfit} {...mp} format={fmtYen} />
      </SectionTable>

      <SectionTable title="② 広告・効率指標" group="acq" count={8} defaultOpen={false}>
        <MetricRow label="広告費率"   actual={adRate}        target={targets.targetAdRate}        {...mp} format={fmtPct} isRate invertGap />
        <MetricRow label="入電件数"   actual={callCount}     target={targets.targetCallCount}     {...mp} format={fmtCount} />
        <MetricRow label="入電単価"   actual={callUnitPrice} target={0}                            {...mp} format={fmtYen} isRate />
        <MetricRow label="獲得件数"   actual={acquisitionCount} target={targets.targetCount}      {...mp} format={fmtCount} />
        <MetricRow label="CPA"        actual={cpa}           target={targets.targetCpa}           {...mp} format={fmtYen} isRate invertGap />
        <MetricRow label="成約率"     actual={convRate}      target={targets.targetConversionRate} {...mp} format={fmtPct} isRate />
        <MetricRow label="客単価"     actual={unitPrice}     target={targets.targetUnitPrice}     {...mp} format={fmtYen} isRate />
        <MetricRow label="対応件数"   actual={totalCount}    target={targets.targetCount}         {...mp} format={fmtCount} />
      </SectionTable>

      {/* PR c93-5: 対応ベース ③ 施工 セクション (ElectricDashboardSection と完全同等)。
          旧: 外注工事件数 + 自社工事件数 + 総工事件数 (発注ベース合算、二重カウント問題)
          新: 工事件数 (対応ベース) + 自社工事件数 + 自社工事比率 (新 auto) + 工事取得率
              + 外注工事費 + 自社工事利益 */}
      <SectionTable title="③ 施工" group="cnt" count={6} defaultOpen={false}>
        <MetricRow label="工事件数"      actual={constructionCount}            target={0}                                  {...mp} format={fmtCount} />
        <MetricRow label="自社工事件数"  actual={internalConstructionCount}    target={0}                                  {...mp} format={fmtCount} />
        <MetricRow label="自社工事比率"  actual={internalConstructionRatio}    target={0}                                  {...mp} format={fmtPct} isRate />
        <MetricRow label="工事取得率"    actual={constructionRate}             target={targets.targetConstructionRate}    {...mp} format={fmtPct} isRate />
        <MetricRow label="外注工事費"    actual={outsourcedConstructionCost}   target={0}                                  {...mp} format={fmtYen} invertGap />
        <MetricRow label="自社工事利益"  actual={internalConstructionProfit}   target={0}                                  {...mp} format={fmtYen} />
      </SectionTable>

      <SectionTable title="④ HELP 部門" group="help" count={4} defaultOpen={false}>
        <MetricRow label="HELP 売上"   actual={helpRevenue}   target={targets.targetHelpSales}     {...mp} format={fmtYen} />
        <MetricRow label="HELP 件数"   actual={helpCount}     target={targets.targetHelpCount}     {...mp} format={fmtCount} />
        <MetricRow label="HELP 客単価" actual={helpUnitPrice} target={targets.targetHelpUnitPrice} {...mp} format={fmtYen} isRate />
        <MetricRow label="HELP 率"     actual={helpRate}      target={targets.targetHelpRate}      {...mp} format={fmtPct} isRate />
      </SectionTable>

      <SectionTable title="⑤ 電気専用" group="cnt" count={1} defaultOpen={false}>
        <MetricRow label="分電盤件数" actual={switchboardCount} target={targets.targetSwitchboardCount} {...mp} format={fmtCount} />
      </SectionTable>

      {/* ⑥ 体制 (PR c94-C-3a) — 全業態共通、車両数 + 研修生 (旬独立 MAX) */}
      <div style={{ gridColumn: "1 / -1" }}>
        <SectionTable title="⑥ 体制" group="cnt" count={2} defaultOpen={false}>
          <MetricRow label="車両数"           actual={vehicleCount} target={targets.targetVehicleCount} {...mp} format={fmtVehicle} />
          <MetricRow label="研修生（営業マン）" actual={traineeCount} target={targets.targetTraineeCount} {...mp} format={fmtTrainee} />
        </SectionTable>
      </div>

      {/* 部門別実績テーブル (水道・電気共通) */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
        <div style={{ background: "#ecfdf5", padding: `10px ${SECTION.PADDING_H}px`, borderBottom: "1px solid #d1fae5" }}>
          <span style={{ fontSize: SECTION.HEADER_FONT_SIZE, fontWeight: SECTION.HEADER_FONT_WEIGHT, color: SECTION.HEADER_COLOR, textTransform: "uppercase", letterSpacing: "0.07em" }}>部門別実績</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "18%" }} /><col style={{ width: "20%" }} /><col style={{ width: "16%" }} />
            <col style={{ width: "20%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#f8fdf8" }}>
              {["部門", "売上", "粗利", "客単価", "件数", "粗利率"].map((h, i) => (
                <th key={h} style={{ padding: `7px ${SECTION.PADDING_H}px`, fontSize: 9, fontWeight: 700, color: "#6b7280",
                  textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #d1fae5",
                  textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {depts.map(({ name, color, d }) => {
              const margin = d.revenue > 0 ? (d.profit / d.revenue * 100) : 0;
              return (
                <tr key={name} style={{ borderBottom: "1px solid #f0faf0" }}>
                  <td style={{ padding: `9px ${SECTION.PADDING_H}px`, fontSize: 12, fontWeight: 700, borderLeft: `3px solid ${color}`, color: "#111" }}>{name}</td>
                  <td style={{ padding: `9px ${SECTION.PADDING_H}px`, fontSize: 12, textAlign: "right", color: "#111", fontWeight: 600 }}>
                    {d.revenue > 0 ? yen(d.revenue) : <span style={{ color: "#d1d5db" }}>¥0</span>}
                  </td>
                  <td style={{ padding: `9px ${SECTION.PADDING_H}px`, fontSize: 12, textAlign: "right", color: "#059669", fontWeight: 600 }}>
                    {d.profit > 0 ? yen(d.profit) : <span style={{ color: "#d1d5db" }}>¥0</span>}
                  </td>
                  <td style={{ padding: `9px ${SECTION.PADDING_H}px`, fontSize: 12, textAlign: "right", color: "#374151" }}>
                    {d.unitPrice > 0 ? yen(d.unitPrice) : "—"}
                  </td>
                  <td style={{ padding: `9px ${SECTION.PADDING_H}px`, fontSize: 12, textAlign: "right", color: "#374151" }}>{d.count}件</td>
                  <td style={{ padding: `9px ${SECTION.PADDING_H}px`, fontSize: 12, textAlign: "right",
                    color: margin >= 25 ? "#059669" : margin >= 15 ? "#d97706" : "#dc2626" }}>
                    {d.revenue > 0 ? `${margin.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            <tr style={{ background: "#f0fdf4" }}>
              <td style={{ padding: `10px ${SECTION.PADDING_H}px`, fontSize: 13, fontWeight: 800, borderLeft: "3px solid #059669", color: "#065f46" }}>合計</td>
              <td style={{ padding: `10px ${SECTION.PADDING_H}px`, fontSize: 13, fontWeight: 800, textAlign: "right", color: "#065f46" }}>{yen(displaySummary.totalRevenue)}</td>
              <td style={{ padding: `10px ${SECTION.PADDING_H}px`, fontSize: 13, fontWeight: 800, textAlign: "right", color: "#059669" }}>{yen(displaySummary.totalProfit)}</td>
              <td style={{ padding: `10px ${SECTION.PADDING_H}px`, fontSize: 12, fontWeight: 700, textAlign: "right", color: "#374151" }}>{yen(displaySummary.companyUnitPrice)}</td>
              <td style={{ padding: `10px ${SECTION.PADDING_H}px`, fontSize: 12, fontWeight: 700, textAlign: "right", color: "#374151" }}>{displaySummary.totalCount}件</td>
              <td style={{ padding: `10px ${SECTION.PADDING_H}px`, fontSize: 12, fontWeight: 700, textAlign: "right",
                color: displaySummary.totalRevenue > 0
                  ? (displaySummary.totalProfit / displaySummary.totalRevenue * 100 >= 25 ? "#059669" : "#d97706") : "#d1d5db" }}>
                {displaySummary.totalRevenue > 0 ? `${(displaySummary.totalProfit / displaySummary.totalRevenue * 100).toFixed(1)}%` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
