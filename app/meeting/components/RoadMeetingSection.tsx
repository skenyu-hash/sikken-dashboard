"use client";
// PR #55 c2 + PR #58c: ロード業態用 会議シートセクション。
//
// 構成 (RoadDashboardSection と 1:1 対応):
//   ① 新規対応・コスト・粗利 (売上 / 保険売上 / 無保険売上 / 広告費 / 手数料 / 販管費 / 粗利)
//   ② 入電 7 内訳 + 総入電件数 / 入電単価 (PR #58c で DB 化)
//   ③ 獲得 7 チャネル + 集計
//
// HELP / 工事取得率 / 施工 は非表示。
//
// 派生値:
//   粗利 = 売上 - (広告費 + 手数料) (RoadForm と同式、販管費は記録のみで式に含めない)

import { MetricRow, SectionTable, fmtYen, fmtCount, fmtPct, type MeetingPeriodProps } from "./MetricRow";
import type { Targets } from "../../lib/calculations";

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

type Props = MeetingPeriodProps & {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
};

export default function RoadMeetingSection({
  monthlySummary, targets, isEndPeriod, daysElapsed, daysInMonth,
}: Props) {
  const mp = { isEndPeriod, daysElapsed, daysInMonth };

  // 売上・コスト
  const sales = numOf(monthlySummary?.total_revenue);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.sales_outsourcing_cost);
  const profit = sales - adCost - commission;

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;

  // 獲得 7 チャネル (PR #52 で永続化)
  const acqAd = numOf(monthlySummary?.road_ad_count);
  const acqRepeat = numOf(monthlySummary?.road_repeat_count);
  const acqReferral = numOf(monthlySummary?.road_referral_count);
  const acqRevisit = numOf(monthlySummary?.road_revisit_count);
  const acqWellnest = numOf(monthlySummary?.road_wellnest_count);
  const acqSeo = numOf(monthlySummary?.road_seo_count);
  const acqInsurance = numOf(monthlySummary?.road_insurance_count);

  // PR #58c: 入電 7 内訳 + 保険売上 2 分割 + 販管費 (Phase B 完結)
  const callAd = numOf(monthlySummary?.road_ad_call_count);
  const callRepeat = numOf(monthlySummary?.road_repeat_call_count);
  const callReferral = numOf(monthlySummary?.road_referral_call_count);
  const callRevisit = numOf(monthlySummary?.road_revisit_call_count);
  const callWellnest = numOf(monthlySummary?.road_wellnest_call_count);
  const callSeo = numOf(monthlySummary?.road_seo_call_count);
  const callInsurance = numOf(monthlySummary?.road_insurance_call_count);
  const insuranceRevenue = numOf(monthlySummary?.road_insurance_revenue);
  const nonInsuranceRevenue = numOf(monthlySummary?.road_non_insurance_revenue);
  const sellingAdminCost = numOf(monthlySummary?.road_selling_admin_cost);

  return (
    <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, gridAutoRows: "min-content" }}>
      <SectionTable title="① 新規対応・コスト・粗利" group="rev" count={7} defaultOpen>
        <MetricRow label="売上"       actual={sales}              target={targets.targetSales}   {...mp} format={fmtYen} />
        <MetricRow label="保険売上"   actual={insuranceRevenue}   target={0}                      {...mp} format={fmtYen} />
        <MetricRow label="無保険売上" actual={nonInsuranceRevenue} target={0}                     {...mp} format={fmtYen} />
        <MetricRow label="広告費"     actual={adCost}             target={targets.targetAdCost}  {...mp} format={fmtYen} invertGap />
        <MetricRow label="手数料"     actual={commission}         target={0}                      {...mp} format={fmtYen} invertGap />
        <MetricRow label="販管費"     actual={sellingAdminCost}   target={0}                      {...mp} format={fmtYen} invertGap />
        <MetricRow label="粗利"       actual={profit}             target={targets.targetProfit}  {...mp} format={fmtYen} />
      </SectionTable>

      <SectionTable title="② 入電 7 内訳 + 集計" group="acq" count={9} defaultOpen={false}>
        <MetricRow label="広告 入電"       actual={callAd}       target={0} {...mp} format={fmtCount} />
        <MetricRow label="リピート 入電"   actual={callRepeat}   target={0} {...mp} format={fmtCount} />
        <MetricRow label="紹介 入電"       actual={callReferral} target={0} {...mp} format={fmtCount} />
        <MetricRow label="再訪問 入電"     actual={callRevisit}  target={0} {...mp} format={fmtCount} />
        <MetricRow label="ウェルネスト 入電" actual={callWellnest} target={0} {...mp} format={fmtCount} />
        <MetricRow label="SEO 入電"        actual={callSeo}      target={0} {...mp} format={fmtCount} />
        <MetricRow label="保険会社 入電"   actual={callInsurance} target={0} {...mp} format={fmtCount} />
        <MetricRow label="総入電件数"      actual={callCount}    target={targets.targetCallCount} {...mp} format={fmtCount} />
        <MetricRow label="入電単価"        actual={callUnitPrice} target={0}                       {...mp} format={fmtYen} isRate />
      </SectionTable>

      {/* PR #82: 3 sections (odd) → 最終を full-width 化 */}
      <div style={{ gridColumn: "1 / -1" }}>
      <SectionTable title="③ 獲得 7 チャネル + 集計" group="acq" count={10} defaultOpen={false}>
        <MetricRow label="広告 獲得"       actual={acqAd}            target={0} {...mp} format={fmtCount} />
        <MetricRow label="リピート 獲得"   actual={acqRepeat}        target={0} {...mp} format={fmtCount} />
        <MetricRow label="紹介 獲得"       actual={acqReferral}      target={0} {...mp} format={fmtCount} />
        <MetricRow label="再訪問 獲得"     actual={acqRevisit}       target={0} {...mp} format={fmtCount} />
        <MetricRow label="ウェルネスト 獲得" actual={acqWellnest}    target={0} {...mp} format={fmtCount} />
        <MetricRow label="SEO 獲得"        actual={acqSeo}           target={0} {...mp} format={fmtCount} />
        <MetricRow label="保険会社 獲得"   actual={acqInsurance}     target={0} {...mp} format={fmtCount} />
        <MetricRow label="総獲得件数"      actual={acquisitionCount} target={targets.targetCount}    {...mp} format={fmtCount} />
        <MetricRow label="CPA"             actual={cpa}              target={targets.targetCpa}      {...mp} format={fmtYen} isRate invertGap />
        <MetricRow label="成約率"          actual={convRate}         target={targets.targetConversionRate} {...mp} format={fmtPct} isRate />
      </SectionTable>
      </div>
    </div>
  );
}
