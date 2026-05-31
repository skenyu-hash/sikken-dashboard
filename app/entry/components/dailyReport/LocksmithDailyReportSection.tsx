"use client";
// PR c95-A-3: 鍵業態 DailyReport セクション。
// 鍵 /entry: ① 新規対応・コスト・粗利 (locksmith 専用カラム)、③ 獲得 (5 内訳、5番目 HELP は派生)、⑥ 体制。
// HELP は ⑤ HELP セクション (DailyReportModal レベルで HelpStaffMonthlyTable) として表示。

import type { DailyEntry } from "../../../lib/calculations";
import { Panel, Row, HighlightProfitRow, TaiseiPanel, yen, cnt, pct } from "./reportPrimitives";
import { sumHelpCount } from "../../lib/helpStaffUtils";
import type { HelpStaffEntry } from "../../types";

const num = (v: number | undefined | null): number => Number(v ?? 0) || 0;
const safePct = (a: number, b: number): number | null => (b === 0 ? null : (a / b) * 100);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

type Props = { todayEntry: DailyEntry };

export default function LocksmithDailyReportSection({ todayEntry: e }: Props) {
  const sales = num(e.outsourced_sales_revenue);
  const construction = num(e.locksmith_construction_cost);
  const material = num(e.material_cost);
  const ad = num(e.ad_cost);
  const commission = num(e.locksmith_commission_fee);

  // 鍵粗利式: 売上 - (工事費 + 材料費 + 広告費 + 手数料)
  const profit = sales - construction - material - ad - commission;
  const profitRate = safePct(profit, sales);

  // 獲得 (PR c95-A-2 で HELP は help_staff SUM 派生)
  const acqCarLp = num(e.locksmith_car_lp_email_count);
  const acqInhouse = num(e.locksmith_inhouse_count);
  const acqRepeat = num(e.locksmith_repeat_count);
  const acqRevisit = num(e.locksmith_revisit_count);
  // entry.help_staff の型は計算で number[] になっている (handleSave 書込済) — 派生 sum
  const helpStaffFromEntry: HelpStaffEntry[] = (e.help_staff ?? []).map((s) => ({
    staff_name: s.staff_name ?? "",
    help_sales: s.help_sales ?? 0,
    help_count: s.help_count ?? 0,
    help_close_count: s.help_close_count ?? 0,
  }));
  const helpCountSum = sumHelpCount(helpStaffFromEntry);
  const acqTotal = acqCarLp + acqInhouse + acqRepeat + acqRevisit + helpCountSum;
  const cpa = safeDiv(ad, acqTotal);
  const callCount = num(e.call_count);
  const convRate = safeDiv(acqTotal, callCount) * 100;

  const unitPrice = acqTotal === 0 ? 0 : Math.round(sales / acqTotal);

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
          <Row label="工事費" sub={pct(safePct(construction, sales))} value={yen(construction)} />
          <Row label="材料費" sub={pct(safePct(material, sales))} value={yen(material)} />
          <Row label="広告費" sub={pct(safePct(ad, sales))} value={yen(ad)} />
          <Row label="手数料" sub={pct(safePct(commission, sales))} value={yen(commission)} />
          <HighlightProfitRow label="粗利(自動)" profitRate={pct(profitRate)} value={yen(profit)} />
          <Row label="客単価(自動)" value={yen(unitPrice)} />
        </Panel>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Panel num="③" title="獲得 (5 内訳)" color="n3">
          <Row label="車LP+メール" value={cnt(acqCarLp)} />
          <Row label="インハウス" value={cnt(acqInhouse)} />
          <Row label="リピート(紹介)" value={cnt(acqRepeat)} />
          <Row label="再訪問" value={cnt(acqRevisit)} />
          <Row label="HELP(派生)" value={cnt(helpCountSum)} />
          <Row label="総獲得件数(自動)" value={cnt(acqTotal)} highlight />
          <Row label="CPA(自動)" value={yen(Math.round(cpa))} />
          <Row label="成約率(自動)" value={pct(convRate)} />
        </Panel>
        <TaiseiPanel vehicleCount={vehicleCount} traineeCount={traineeCount} />
      </div>
    </div>
  );
}
