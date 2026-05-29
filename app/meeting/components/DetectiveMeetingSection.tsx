"use client";
// PR #55 c3: 探偵業態用 会議シートセクション。
//
// 構成 (DetectiveDashboardSection と 1:1 対応):
//   ① 新規対応・コスト・営業利益 (売上 / 広告費 / 営業利益)
//   ② 入電 (入電数 / 入電単価)
//   ③ 獲得 (合計獲得件数 / CPA、6 内訳は UI のみで非表示)
//   ④ 面談プロセス (探偵専用):
//     - アポ獲得率 / target_conversion_rate (流用)
//     - 面談事前キャンセル数 / キャンセル率 (target なし、参考表示)
//     - 面談数 / target_meeting_count / 達成率
//     - 面談率 / target_meeting_rate
//     - 成約件数 (= total_count) / 成約率
//
// HELP / 工事取得率 / 施工 は非表示。
//
// 派生値:
//   営業利益 = 売上 - 広告費 (calc.profit 互換、他コスト 0)
//   アポ獲得率 = acquisition_count ÷ call_count × 100 (= 既存 conv_rate と同式)
//   面談率 = detective_meeting_count ÷ acquisition_count × 100
//   成約率 = total_count ÷ detective_meeting_count × 100

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

export default function DetectiveMeetingSection({
  monthlySummary, targets, isEndPeriod, daysElapsed, daysInMonth,
}: Props) {
  const mp = { isEndPeriod, daysElapsed, daysInMonth };

  // 売上・コスト
  const sales = numOf(monthlySummary?.total_revenue);
  const adCost = numOf(monthlySummary?.ad_cost);
  const profit = sales - adCost;

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));

  // PR #57: 入電 4 内訳 (DB 化済)
  const phoneOnlyCount = numOf(monthlySummary?.detective_phone_only_call_count);
  const mailOnlyCount = numOf(monthlySummary?.detective_mail_only_call_count);
  const lineOnlyCount = numOf(monthlySummary?.detective_line_only_call_count);
  const wrongCount = numOf(monthlySummary?.detective_wrong_call_count);

  // PR #58b: 獲得 6 内訳 + 販管費 (DB 化済)
  const acqPhoneUwaki = numOf(monthlySummary?.detective_phone_uwaki_acquisition_count);
  const acqPhoneOther = numOf(monthlySummary?.detective_phone_other_acquisition_count);
  const acqMailUwaki = numOf(monthlySummary?.detective_mail_uwaki_acquisition_count);
  const acqMailOther = numOf(monthlySummary?.detective_mail_other_acquisition_count);
  const acqLineUwaki = numOf(monthlySummary?.detective_line_uwaki_acquisition_count);
  const acqLineOther = numOf(monthlySummary?.detective_line_other_acquisition_count);
  const sellingAdminCost = numOf(monthlySummary?.detective_selling_admin_cost);

  // 面談ファネル (PR #53)
  const meetingCount = numOf(monthlySummary?.detective_meeting_count);
  const cancelCount = numOf(monthlySummary?.detective_cancel_count);
  const closeCount = numOf(monthlySummary?.total_count); // = 成約件数

  const appointmentRate = safeDiv(acquisitionCount, callCount) * 100;
  const cancelRate = safeDiv(cancelCount, acquisitionCount) * 100;
  const meetingRate = safeDiv(meetingCount, acquisitionCount) * 100;
  const closeRate = safeDiv(closeCount, meetingCount) * 100;

  // ⑥ 体制 (PR c94-C-3a)
  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);

  return (
    <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SECTION.GAP, gridAutoRows: "min-content" }}>
      <SectionTable title="① 新規対応・コスト・営業利益" group="rev" count={4} defaultOpen>
        <MetricRow label="売上"           actual={sales}            target={targets.targetSales}  {...mp} format={fmtYen} />
        <MetricRow label="広告費 (探偵LP)" actual={adCost}          target={targets.targetAdCost} {...mp} format={fmtYen} invertGap />
        <MetricRow label="販管費"         actual={sellingAdminCost} target={0}                     {...mp} format={fmtYen} invertGap />
        <MetricRow label="営業利益"       actual={profit}           target={targets.targetProfit} {...mp} format={fmtYen} />
      </SectionTable>

      <SectionTable title="② 入電" group="acq" count={6} defaultOpen={false}>
        <MetricRow label="電のみ 入電"     actual={phoneOnlyCount} target={0}                       {...mp} format={fmtCount} />
        <MetricRow label="メールのみ 入電" actual={mailOnlyCount}  target={0}                       {...mp} format={fmtCount} />
        <MetricRow label="LINEのみ 入電"   actual={lineOnlyCount}  target={0}                       {...mp} format={fmtCount} />
        <MetricRow label="間違い電話"      actual={wrongCount}     target={0}                       {...mp} format={fmtCount} />
        <MetricRow label="入電数"          actual={callCount}      target={targets.targetCallCount} {...mp} format={fmtCount} />
        <MetricRow label="入電単価"        actual={callUnitPrice}  target={0}                       {...mp} format={fmtYen} isRate />
      </SectionTable>

      <SectionTable title="③ 獲得" group="acq" count={8} defaultOpen={false}>
        <MetricRow label="電話 × 浮気"     actual={acqPhoneUwaki}    target={0}                   {...mp} format={fmtCount} />
        <MetricRow label="電話 × その他"   actual={acqPhoneOther}    target={0}                   {...mp} format={fmtCount} />
        <MetricRow label="メール × 浮気"   actual={acqMailUwaki}     target={0}                   {...mp} format={fmtCount} />
        <MetricRow label="メール × その他" actual={acqMailOther}     target={0}                   {...mp} format={fmtCount} />
        <MetricRow label="LINE × 浮気"     actual={acqLineUwaki}     target={0}                   {...mp} format={fmtCount} />
        <MetricRow label="LINE × その他"   actual={acqLineOther}     target={0}                   {...mp} format={fmtCount} />
        <MetricRow label="合計獲得件数 (面談予定数)" actual={acquisitionCount} target={targets.targetCount} {...mp} format={fmtCount} />
        <MetricRow label="CPA"                       actual={cpa}              target={targets.targetCpa}   {...mp} format={fmtYen} isRate invertGap />
      </SectionTable>

      <SectionTable title="④ 面談プロセス (探偵専用ファネル)" group="acq" count={7} defaultOpen={false}>
        <MetricRow label="アポ獲得率"           actual={appointmentRate} target={targets.targetConversionRate} {...mp} format={fmtPct} isRate />
        <MetricRow label="面談事前キャンセル数" actual={cancelCount}     target={0}                              {...mp} format={fmtCount} invertGap />
        <MetricRow label="キャンセル率"         actual={cancelRate}      target={0}                              {...mp} format={fmtPct} isRate invertGap />
        <MetricRow label="面談数"               actual={meetingCount}    target={targets.targetMeetingCount}    {...mp} format={fmtCount} />
        <MetricRow label="面談率"               actual={meetingRate}     target={targets.targetMeetingRate}     {...mp} format={fmtPct} isRate />
        <MetricRow label="成約件数"             actual={closeCount}      target={0}                              {...mp} format={fmtCount} />
        <MetricRow label="成約率"               actual={closeRate}       target={0}                              {...mp} format={fmtPct} isRate />
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
