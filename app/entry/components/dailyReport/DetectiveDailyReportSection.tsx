"use client";
// PR c95-A-3: 探偵業態 DailyReport セクション。HELP 非表示、施工 非表示。
// /entry: ① 売上・コスト・販管費 / ② 入電 4 内訳 / ③ 獲得 6 内訳 / ④ 面談ファネル / ⑥ 体制。

import type { DailyEntry } from "../../../lib/calculations";
import { Panel, Row, HighlightProfitRow, TaiseiPanel, yen, cnt, pct } from "./reportPrimitives";

const num = (v: number | undefined | null): number => Number(v ?? 0) || 0;
const safePct = (a: number, b: number): number | null => (b === 0 ? null : (a / b) * 100);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

type Props = { todayEntry: DailyEntry };

export default function DetectiveDailyReportSection({ todayEntry: e }: Props) {
  const sales = num(e.outsourced_sales_revenue);
  const ad = num(e.ad_cost);
  const sellingAdmin = num(e.detective_selling_admin_cost);
  // 探偵粗利式: 売上 - 広告費 (販管費は記録のみ、c93-2)
  const profit = sales - ad;
  const profitRate = safePct(profit, sales);
  const acqTotal = num(e.acquisition_count);
  const callTotal = num(e.call_count);
  const unitPrice = acqTotal === 0 ? 0 : Math.round(sales / acqTotal);
  const cpa = safeDiv(ad, acqTotal);

  // ② 入電 4 内訳
  const callPhone = num(e.detective_phone_only_call_count);
  const callMail = num(e.detective_mail_only_call_count);
  const callLine = num(e.detective_line_only_call_count);
  const callWrong = num(e.detective_wrong_call_count);

  // ③ 獲得 6 内訳
  const acqPU = num(e.detective_phone_uwaki_acquisition_count);
  const acqPO = num(e.detective_phone_other_acquisition_count);
  const acqMU = num(e.detective_mail_uwaki_acquisition_count);
  const acqMO = num(e.detective_mail_other_acquisition_count);
  const acqLU = num(e.detective_line_uwaki_acquisition_count);
  const acqLO = num(e.detective_line_other_acquisition_count);

  // ④ 面談ファネル
  const meetingCount = num(e.detective_meeting_count);
  const cancelCount = num(e.detective_cancel_count);
  const meetingRate = safeDiv(meetingCount, acqTotal) * 100;
  const cancelRate = safeDiv(cancelCount, acqTotal) * 100;
  const appointmentRate = safeDiv(acqTotal, callTotal) * 100;

  const vehicleCount = num(e.vehicle_count);
  const traineeCount = num(e.trainee_count);

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
      padding: "6px 36px 0", alignItems: "stretch",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel num="①" title="新規対応・コスト・粗利" color="n1" fill>
          <Row label="売上" value={yen(sales)} highlight />
          <Row label="広告費" sub={pct(safePct(ad, sales))} value={yen(ad)} />
          <Row label="販管費(記録のみ)" sub={pct(safePct(sellingAdmin, sales))} value={yen(sellingAdmin)} />
          <HighlightProfitRow label="粗利(自動)" profitRate={pct(profitRate)} value={yen(profit)} />
          <Row label="客単価(自動)" value={yen(unitPrice)} />
          <Row label="CPA(自動)" value={yen(Math.round(cpa))} />
        </Panel>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel num="②" title="入電 4 内訳" color="n2">
          <Row label="電のみ" value={cnt(callPhone)} />
          <Row label="メールのみ" value={cnt(callMail)} />
          <Row label="LINEのみ" value={cnt(callLine)} />
          <Row label="誤入電" value={cnt(callWrong)} />
          <Row label="総入電件数" value={cnt(callTotal)} highlight />
        </Panel>
        <Panel num="③" title="獲得 6 内訳" color="n3">
          <Row label="電話×浮気" value={cnt(acqPU)} />
          <Row label="電話×その他" value={cnt(acqPO)} />
          <Row label="メール×浮気" value={cnt(acqMU)} />
          <Row label="メール×その他" value={cnt(acqMO)} />
          <Row label="LINE×浮気" value={cnt(acqLU)} />
          <Row label="LINE×その他" value={cnt(acqLO)} />
          <Row label="総獲得件数(=面談予定)" value={cnt(acqTotal)} highlight />
        </Panel>
        <Panel num="④" title="面談ファネル" color="n4">
          <Row label="アポ獲得率(自動)" value={pct(appointmentRate)} />
          <Row label="面談事前キャンセル数" value={cnt(cancelCount)} />
          <Row label="キャンセル率(自動)" value={pct(cancelRate)} />
          <Row label="面談数" value={cnt(meetingCount)} />
          <Row label="面談率(自動)" value={pct(meetingRate)} />
        </Panel>
        <TaiseiPanel vehicleCount={vehicleCount} traineeCount={traineeCount} />
      </div>
    </div>
  );
}
