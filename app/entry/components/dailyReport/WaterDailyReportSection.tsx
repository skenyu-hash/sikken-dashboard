"use client";
// PR c95-A-3: 水道業態 DailyReport セクション (モック daily_report_kansai_0530.html 準拠)。
// 左 ① 新規対応・コスト・粗利 (fill) + 右 ③ 広告・効率 / ④ 施工 / ⑥ 体制 の積み。

import type { DailyEntry } from "../../../lib/calculations";
import { Panel, Row, HighlightProfitRow, TaiseiPanel, yen, cnt, pct } from "./reportPrimitives";
// PR c95-D-5 (slice 5): 日報 water 粗利を「自動 7.7%」から「手入力 e.consultant_fee」直接控除に切替。
//   月境界定数のみ流用 (slice 6 で consultantFee.ts 撤去予定)。
import { CONSULTANT_FEE_APPLIED_FROM_YYYYMM } from "../../../lib/consultantFee";

const num = (v: number | undefined | null): number => Number(v ?? 0) || 0;
const safePct = (a: number, b: number): number | null => (b === 0 ? null : (a / b) * 100);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

type Props = { todayEntry: DailyEntry };

export default function WaterDailyReportSection({ todayEntry: e }: Props) {
  const outSales = num(e.outsourced_sales_revenue);
  const intSales = num(e.internal_staff_revenue);
  const totalSales = outSales + intSales;
  const outResp = num(e.outsourced_response_count);
  const intResp = num(e.internal_staff_response_count);
  const totalResp = outResp + intResp;

  const labor = num(e.total_labor_cost);
  const material = num(e.material_cost);
  const outsource = num(e.sales_outsourcing_cost);
  const card = num(e.card_processing_fee);
  const ad = num(e.ad_cost);

  // PR c95-D-5 (slice 5): 日報 water 粗利は手入力 e.consultant_fee 直接控除。
  //   旧 c95-B-3: consultFee = consultantFee("water", totalSales, yyyymm) (= totalSales × 0.077)
  //   新 c95-D-5: water + yyyymm >= 202605 で e.consultant_fee を控除。
  //   月境界 (yyyymm >= 202605) は維持 → 4 月以前の当日表示は控除 0 で従来通り (絶対不変)。
  const yyyymm = Number(e.date.slice(0, 4)) * 100 + Number(e.date.slice(5, 7));
  const consultFee = yyyymm >= CONSULTANT_FEE_APPLIED_FROM_YYYYMM ? num(e.consultant_fee) : 0;
  const profit = totalSales - labor - material - ad - outsource - card - consultFee;
  const profitRate = safePct(profit, totalSales);
  const unitPrice = totalResp === 0 ? 0 : Math.round(totalSales / totalResp);

  // ③ 広告
  const callCount = num(e.call_count);
  const acqCount = num(e.acquisition_count);
  const callUp = safeDiv(ad, callCount);
  const cpa = safeDiv(ad, acqCount);
  const convRate = safeDiv(acqCount, callCount) * 100;

  // ④ 施工
  const constCount = num(e.construction_count);
  const intConst = num(e.internal_construction_count);
  const intRatio = constCount === 0 ? 0 : (intConst / constCount) * 100;
  const outConstCost = num(e.outsourced_construction_cost);
  const intConstProfit = num(e.internal_construction_profit);

  // ⑥ 体制
  const vehicleCount = num(e.vehicle_count);
  const traineeCount = num(e.trainee_count);

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
      padding: "6px 36px 0", alignItems: "stretch",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel num="①" title="新規対応・コスト・粗利" color="n1" fill>
          <Row label="業務委託売上" value={yen(outSales)} />
          <Row label="内勤社員売上" value={yen(intSales)} />
          <Row label="全体売上(自動)" value={yen(totalSales)} highlight />
          <Row label="業務委託対応件数" value={cnt(outResp)} />
          <Row label="内勤社員対応件数" value={cnt(intResp)} />
          <Row label="合計対応件数(自動)" value={cnt(totalResp)} highlight />
          <Row label="職人費" sub={pct(safePct(labor, totalSales))} value={yen(labor)} />
          <Row label="材料費" sub={pct(safePct(material, totalSales))} value={yen(material)} />
          <Row label="営業外注費" sub={pct(safePct(outsource, totalSales))} value={yen(outsource)} />
          <Row label="カード手数料" sub={pct(safePct(card, totalSales))} value={yen(card)} />
          <HighlightProfitRow label="粗利(自動)" profitRate={pct(profitRate)} value={yen(profit)} />
          <Row label="客単価(自動)" value={yen(unitPrice)} />
        </Panel>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel num="③" title="広告・効率" color="n3">
          <Row label="総広告費" value={yen(ad)} />
          <Row label="入電件数" value={cnt(callCount)} />
          <Row label="獲得件数" value={cnt(acqCount)} />
          <Row label="入電単価(自動)" value={yen(Math.round(callUp))} />
          <Row label="CPA(自動)" value={yen(Math.round(cpa))} />
          <Row label="成約率(自動)" value={pct(convRate)} />
        </Panel>
        <Panel num="④" title="施工" color="n4">
          <Row label="工事件数" value={cnt(constCount)} />
          <Row label="自社工事件数" value={cnt(intConst)} />
          <Row label="自社工事比率(自動)" value={pct(intRatio)} />
          <Row label="外注工事費" value={yen(outConstCost)} />
          <Row label="自社工事利益" value={yen(intConstProfit)} />
        </Panel>
        <TaiseiPanel vehicleCount={vehicleCount} traineeCount={traineeCount} />
      </div>
    </div>
  );
}
