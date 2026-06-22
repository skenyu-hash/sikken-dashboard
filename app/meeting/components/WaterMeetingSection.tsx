"use client";
// PR c94-B-1: 水道業態用 会議シートセクション。
//
// 役割:
//   meeting/page.tsx の水道インラインレイアウト (~100 line) を本コンポーネントに
//   置換。ElectricMeetingSection と同型 5 セクション構成。
//   c94-A で残置した部門別実績テーブル ({false &&} ガード) を完全撤去し、
//   monthly_summary 同形を消費する設計。
//
// 構成 (WaterDashboardSection と 1:1 対応):
//   ① 新規対応・コスト・粗利 (7)
//   ② 広告・効率指標 (8)
//   ③ 施工 (6)
//   ④ HELP 部門 (4)
//   ⑤ 水道専用 (5)
//
// データソース:
//   c94-A 旬独立対応 — /api/meeting-aggregate (10/20/end 全 period) 由来の
//   monthly_summary 同形 JSON を消費。Electric と同じく displaySummary は不要。

import { type Targets } from "../../lib/calculations";
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
};

export default function WaterMeetingSection({
  monthlySummary, targets, isEndPeriod, daysElapsed, daysInMonth,
}: Props) {
  const mp = { isEndPeriod, daysElapsed, daysInMonth };

  // 売上・コスト (Electric と同形)
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

  // 施工 (Electric と同等、対応ベース c93-2)
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
  // HELP率の目標も件数目標から自動算出 (= HELP件数目標 ÷ 件数目標 × 100、手入力 target_help_rate は廃止)。
  const targetHelpRate = safeDiv(numOf(targets.targetHelpCount), numOf(targets.targetCount)) * 100;

  // ⑤ 水道専用 (PR c94-B-1)
  const responseRate = safeDiv(totalCount, callCount) * 100;
  const repeatCount = numOf(monthlySummary?.repeat_count);
  const revisitCount = numOf(monthlySummary?.revisit_count);
  const reviewCount = numOf(monthlySummary?.review_count);
  // ⑥ 体制 (PR c94-C-3a) — 車両数を ⑤ から移動、研修生を新規追加
  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);

  return (
    <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SECTION.GAP, gridAutoRows: "min-content" }}>
      <SectionTable title="① 新規対応・コスト・粗利" group="rev" count={7} defaultOpen>
        <MetricRow label="売上"         actual={sales}        target={targets.targetSales}  {...mp} format={fmtYen} />
        <MetricRow label="職人費"       actual={laborCost}    target={0}                     {...mp} format={fmtYen} invertGap />
        <MetricRow label="材料費"       actual={materialCost} target={0}                     {...mp} format={fmtYen} invertGap />
        <MetricRow label="広告費"       actual={adCost}       target={targets.targetAdCost} {...mp} format={fmtYen} invertGap />
        <MetricRow label="営業外注費"   actual={commission}   target={0}                     {...mp} format={fmtYen} invertGap />
        <MetricRow label="カード手数料" actual={cardFee}      target={0}                     {...mp} format={fmtYen} invertGap />
        <MetricRow label="粗利"         actual={profit}       target={targets.targetProfit} {...mp} format={fmtYen} />
      </SectionTable>

      <SectionTable title="② 広告・効率指標" group="acq" count={8} defaultOpen={false}>
        <MetricRow label="広告費率"  actual={adRate}            target={targets.targetAdRate}        {...mp} format={fmtPct} isRate invertGap />
        <MetricRow label="入電件数"  actual={callCount}         target={targets.targetCallCount}     {...mp} format={fmtCount} />
        <MetricRow label="入電単価"  actual={callUnitPrice}     target={0}                            {...mp} format={fmtYen} isRate />
        <MetricRow label="獲得件数"  actual={acquisitionCount}  target={targets.targetCount}         {...mp} format={fmtCount} />
        <MetricRow label="CPA"       actual={cpa}               target={targets.targetCpa}           {...mp} format={fmtYen} isRate invertGap />
        <MetricRow label="成約率"    actual={convRate}          target={targets.targetConversionRate} {...mp} format={fmtPct} isRate />
        <MetricRow label="客単価"    actual={unitPrice}         target={targets.targetUnitPrice}     {...mp} format={fmtYen} isRate />
        <MetricRow label="対応件数"  actual={totalCount}        target={targets.targetCount}         {...mp} format={fmtCount} />
      </SectionTable>

      <SectionTable title="③ 施工" group="cnt" count={6} defaultOpen={false}>
        <MetricRow label="工事件数"     actual={constructionCount}            target={0}                              {...mp} format={fmtCount} />
        <MetricRow label="自社工事件数" actual={internalConstructionCount}    target={0}                              {...mp} format={fmtCount} />
        <MetricRow label="自社工事比率" actual={internalConstructionRatio}    target={0}                              {...mp} format={fmtPct} isRate />
        <MetricRow label="工事取得率"   actual={constructionRate}             target={targets.targetConstructionRate} {...mp} format={fmtPct} isRate />
        <MetricRow label="外注工事費"   actual={outsourcedConstructionCost}   target={0}                              {...mp} format={fmtYen} invertGap />
        <MetricRow label="自社工事利益" actual={internalConstructionProfit}   target={0}                              {...mp} format={fmtYen} />
      </SectionTable>

      <SectionTable title="④ HELP 部門" group="help" count={4} defaultOpen={false}>
        <MetricRow label="HELP 売上"   actual={helpRevenue}   target={targets.targetHelpSales}     {...mp} format={fmtYen} />
        <MetricRow label="HELP 件数"   actual={helpCount}     target={targets.targetHelpCount}     {...mp} format={fmtCount} />
        <MetricRow label="HELP 客単価" actual={helpUnitPrice} target={targets.targetHelpUnitPrice} {...mp} format={fmtYen} isRate />
        <MetricRow label="HELP 率"     actual={helpRate}      target={targetHelpRate}              {...mp} format={fmtPct} isRate />
      </SectionTable>

      <SectionTable title="⑤ 水道専用" group="cnt" count={4} defaultOpen={false}>
        <MetricRow label="対応率"       actual={responseRate} target={0}                          {...mp} format={fmtPct} isRate />
        <MetricRow label="リピート件数" actual={repeatCount}  target={0}                          {...mp} format={fmtCount} />
        <MetricRow label="再訪問件数"   actual={revisitCount} target={0}                          {...mp} format={fmtCount} />
        <MetricRow label="口コミ件数"   actual={reviewCount}  target={0}                          {...mp} format={fmtCount} />
      </SectionTable>

      {/* ⑥ 体制 (PR c94-C-3a) — 全業態共通、車両数 + 研修生 (旬独立 MAX) */}
      <div style={{ gridColumn: "1 / -1" }}>
        <SectionTable title="⑥ 体制" group="cnt" count={2} defaultOpen={false}>
          <MetricRow label="車両数"           actual={vehicleCount} target={targets.targetVehicleCount} {...mp} format={fmtVehicle} />
          <MetricRow label="研修生（営業マン）" actual={traineeCount} target={targets.targetTraineeCount} {...mp} format={fmtTrainee} />
        </SectionTable>
      </div>
    </div>
  );
}
