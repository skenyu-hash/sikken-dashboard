"use client";
// PR c95-A-3: ロード業態 DailyReport セクション。HELP 非表示、施工 非表示。
// /entry: ① 売上 (保険+無保険) ・コスト・粗利 / ② 入電 7 内訳 / ③ 獲得 7 内訳 / ⑥ 体制。

import type { DailyEntry } from "../../../lib/calculations";
import { Panel, Row, HighlightProfitRow, TaiseiPanel, yen, cnt, pct } from "./reportPrimitives";

const num = (v: number | undefined | null): number => Number(v ?? 0) || 0;
const safePct = (a: number, b: number): number | null => (b === 0 ? null : (a / b) * 100);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

type Props = { todayEntry: DailyEntry };

export default function RoadDailyReportSection({ todayEntry: e }: Props) {
  const sales = num(e.outsourced_sales_revenue);
  const insRev = num(e.road_insurance_revenue);
  const nonInsRev = num(e.road_non_insurance_revenue);
  const ad = num(e.ad_cost);
  const outsource = num(e.sales_outsourcing_cost);
  const sellingAdmin = num(e.road_selling_admin_cost);
  // ロード粗利式: 売上 - 広告費 - 営業外注費 (販管費は記録のみ)
  const profit = sales - ad - outsource;
  const profitRate = safePct(profit, sales);
  const acqTotal = num(e.acquisition_count);
  const callTotal = num(e.call_count);
  const unitPrice = acqTotal === 0 ? 0 : Math.round(sales / acqTotal);
  const cpa = safeDiv(ad, acqTotal);
  const convRate = safeDiv(acqTotal, callTotal) * 100;

  // ② 入電 7 内訳
  const callAd = num(e.road_ad_call_count);
  const callRepeat = num(e.road_repeat_call_count);
  const callRef = num(e.road_referral_call_count);
  const callRevisit = num(e.road_revisit_call_count);
  const callWell = num(e.road_wellnest_call_count);
  const callSeo = num(e.road_seo_call_count);
  const callIns = num(e.road_insurance_call_count);

  // ③ 獲得 7 内訳
  const acqAd = num(e.road_ad_count);
  const acqRepeat = num(e.road_repeat_count);
  const acqRef = num(e.road_referral_count);
  const acqRevisit = num(e.road_revisit_count);
  const acqWell = num(e.road_wellnest_count);
  const acqSeo = num(e.road_seo_count);
  const acqIns = num(e.road_insurance_count);

  const vehicleCount = num(e.vehicle_count);
  const traineeCount = num(e.trainee_count);

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
      padding: "6px 36px 0", alignItems: "stretch",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel num="①" title="新規対応・コスト・粗利" color="n1" fill>
          <Row label="売上(総)" value={yen(sales)} highlight />
          <Row label="保険売上" value={yen(insRev)} />
          <Row label="無保険売上" value={yen(nonInsRev)} />
          <Row label="広告費" sub={pct(safePct(ad, sales))} value={yen(ad)} />
          <Row label="営業外注費" sub={pct(safePct(outsource, sales))} value={yen(outsource)} />
          <Row label="販管費(記録のみ)" sub={pct(safePct(sellingAdmin, sales))} value={yen(sellingAdmin)} />
          <HighlightProfitRow label="粗利(自動)" profitRate={pct(profitRate)} value={yen(profit)} />
          <Row label="客単価(自動)" value={yen(unitPrice)} />
        </Panel>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel num="②" title="入電 7 内訳" color="n2">
          <Row label="広告" value={cnt(callAd)} />
          <Row label="リピート" value={cnt(callRepeat)} />
          <Row label="紹介" value={cnt(callRef)} />
          <Row label="再訪問" value={cnt(callRevisit)} />
          <Row label="ウェルネスト" value={cnt(callWell)} />
          <Row label="SEO" value={cnt(callSeo)} />
          <Row label="保険会社" value={cnt(callIns)} />
          <Row label="総入電件数" value={cnt(callTotal)} highlight />
        </Panel>
        <Panel num="③" title="獲得 7 内訳 + 集計" color="n3">
          <Row label="広告" value={cnt(acqAd)} />
          <Row label="リピート" value={cnt(acqRepeat)} />
          <Row label="紹介" value={cnt(acqRef)} />
          <Row label="再訪問" value={cnt(acqRevisit)} />
          <Row label="ウェルネスト" value={cnt(acqWell)} />
          <Row label="SEO" value={cnt(acqSeo)} />
          <Row label="保険会社" value={cnt(acqIns)} />
          <Row label="総獲得件数" value={cnt(acqTotal)} highlight />
          <Row label="CPA(自動)" value={yen(Math.round(cpa))} />
          <Row label="成約率(自動)" value={pct(convRate)} />
        </Panel>
        <TaiseiPanel vehicleCount={vehicleCount} traineeCount={traineeCount} />
      </div>
    </div>
  );
}
