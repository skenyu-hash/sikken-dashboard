"use client";
// PR #55 c1: 鍵業態用 会議シートセクション。
//
// 役割:
//   /meeting で activeBusiness === "locksmith" の時、汎用 17 項目に代わり
//   鍵業態固有の 4 セクションを「10日/20日/末日 会議シート」形式で表示する。
//   MetricRow パターン (5 列: 実績 / 着地予測 / 達成率 / 目標差 / 1日の目安)。
//
// 構成 (LocksmithDashboardSection と 1:1 対応):
//   ① 新規対応・コスト・粗利 (売上 / 工事費 / 材料費 / 広告費 / 手数料 + 粗利)
//   ② 入電 (総入電件数 / 入電単価)
//   ③ 獲得 5 内訳 + 集計 (車LP+メール / インハウス / リピート / 再訪問 / HELP件数)
//   ④ HELP (HELP売上 / HELP件数 / HELP客単価 / HELP率)
//
// データソース:
//   monthlySummary (raw 行): locksmith_*_count / locksmith_construction_cost
//   targets       : manToYen 適用済 (page.tsx 側で変換)
//
// 派生値:
//   粗利 = 売上 - (工事費 + 材料費 + 広告費 + 手数料) (LocksmithForm/Dashboard と同式)

import { MetricRow, SectionTable, fmtYen, fmtCount, fmtPct, type MeetingPeriodProps } from "./MetricRow";
import { SECTION } from "../../components/sectionStyles";
import type { Targets } from "../../lib/calculations";

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
// ⑥ 体制 (PR c94-C-3a) — 車両数/研修生の単位表示 (件ではなく台/人)
const fmtVehicle = (v: number): string => (v > 0 ? `${v}台` : "—");
const fmtTrainee = (v: number): string => (v > 0 ? `${v}人` : "—");

type Props = MeetingPeriodProps & {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
};

export default function LocksmithMeetingSection({
  monthlySummary, targets, isEndPeriod, daysElapsed, daysInMonth,
}: Props) {
  const mp = { isEndPeriod, daysElapsed, daysInMonth };

  // 売上・コスト
  const sales = numOf(monthlySummary?.total_revenue);
  const constructionCost = numOf(monthlySummary?.locksmith_construction_cost);
  const materialCost = numOf(monthlySummary?.material_cost);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.locksmith_commission_fee);
  const profit = sales - constructionCost - materialCost - adCost - commission;

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;

  // 獲得 4 内訳 + HELP件数 (= 5 番目の枠)
  const acqLpMail = numOf(monthlySummary?.locksmith_car_lp_email_count);
  const acqInhouse = numOf(monthlySummary?.locksmith_inhouse_count);
  const acqRepeat = numOf(monthlySummary?.locksmith_repeat_count);
  const acqRevisit = numOf(monthlySummary?.locksmith_revisit_count);
  const helpCount = numOf(monthlySummary?.help_count);

  // HELP
  const helpRevenue = numOf(monthlySummary?.help_revenue);
  const helpUnitPrice = Math.round(safeDiv(helpRevenue, helpCount));
  const helpRate = safeDiv(helpRevenue, sales) * 100;

  // ⑥ 体制 (PR c94-C-3a)
  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);

  return (
    <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SECTION.GAP, gridAutoRows: "min-content" }}>
      <SectionTable title="① 新規対応・コスト・粗利" group="rev" count={6} defaultOpen>
        <MetricRow label="売上"     actual={sales}             target={targets.targetSales}    {...mp} format={fmtYen} />
        <MetricRow label="工事費"   actual={constructionCost}  target={0}                       {...mp} format={fmtYen} invertGap />
        <MetricRow label="材料費"   actual={materialCost}      target={0}                       {...mp} format={fmtYen} invertGap />
        <MetricRow label="広告費"   actual={adCost}            target={targets.targetAdCost}    {...mp} format={fmtYen} invertGap />
        <MetricRow label="手数料"   actual={commission}        target={0}                       {...mp} format={fmtYen} invertGap />
        <MetricRow label="粗利"     actual={profit}            target={targets.targetProfit}    {...mp} format={fmtYen} />
      </SectionTable>

      <SectionTable title="② 入電" group="acq" count={2} defaultOpen={false}>
        <MetricRow label="総入電件数" actual={callCount}      target={targets.targetCallCount} {...mp} format={fmtCount} />
        <MetricRow label="入電単価"   actual={callUnitPrice}  target={0}                        {...mp} format={fmtYen} isRate />
      </SectionTable>

      <SectionTable title="③ 獲得 5 内訳 + 集計" group="acq" count={8} defaultOpen={false}>
        <MetricRow label="車LP+メール"   actual={acqLpMail}        target={0} {...mp} format={fmtCount} />
        <MetricRow label="インハウス"    actual={acqInhouse}       target={0} {...mp} format={fmtCount} />
        <MetricRow label="リピート(紹介)" actual={acqRepeat}       target={0} {...mp} format={fmtCount} />
        <MetricRow label="再訪問"        actual={acqRevisit}       target={0} {...mp} format={fmtCount} />
        <MetricRow label="HELP件数 (獲得)" actual={helpCount}      target={targets.targetHelpCount} {...mp} format={fmtCount} />
        <MetricRow label="総獲得件数"    actual={acquisitionCount} target={targets.targetCount} {...mp} format={fmtCount} />
        <MetricRow label="CPA"           actual={cpa}              target={targets.targetCpa}   {...mp} format={fmtYen} isRate invertGap />
        <MetricRow label="成約率"        actual={convRate}         target={targets.targetConversionRate} {...mp} format={fmtPct} isRate />
      </SectionTable>

      <SectionTable title="④ HELP 部門" group="help" count={4} defaultOpen={false}>
        <MetricRow label="HELP 売上"   actual={helpRevenue}    target={targets.targetHelpSales}     {...mp} format={fmtYen} />
        <MetricRow label="HELP 件数"   actual={helpCount}      target={targets.targetHelpCount}     {...mp} format={fmtCount} />
        <MetricRow label="HELP 客単価" actual={helpUnitPrice}  target={targets.targetHelpUnitPrice} {...mp} format={fmtYen} isRate />
        <MetricRow label="HELP 率"     actual={helpRate}       target={targets.targetHelpRate}      {...mp} format={fmtPct} isRate />
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
