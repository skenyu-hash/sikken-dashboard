"use client";
// PR #48b c5-road: ロード業態フォーム。
//
// 仕様確定 (Web Claude 5/16):
//   ① 新規対応: 売上 / 保険売上 / 無保険売上 / 広告費 / 手数料 / 販管費
//   ② 入電  : 7 チャネル合計 → 総入電件数 / 入電単価 (自動)
//   ③ 獲得  : 7 チャネル合計 → 総獲得件数 / 獲得単価 / 成約率 (自動)
//   ④ HELP : 非表示
//   ⑤ 施工 : 非表示
//
// 7 チャネル (入電・獲得共通):
//   1. 広告件数 / 2. リピート件数 / 3. 紹介件数 / 4. 再訪問件数
//   5. ウェルネスト件数 (提携保険会社) / 6. SEO件数 / 7. 保険会社件数
//
// DB マッピング (既存列流用):
//   売上          → outsourced_sales_revenue (internal は 0 → calc.total_revenue = 売上)
//   広告費        → ad_cost
//   手数料        → sales_outsourcing_cost
//   販管費        → 保存しない (Phase B、注記表示)
//   保険売上 / 無保険売上 → UI のみ (Phase B で別カラム候補)
//   7 チャネル内訳 → UI のみ (合計のみ DB へ)
//   総入電件数 (自動) → call_count
//   総獲得件数 (自動) → acquisition_count
//   粗利 (自動)   → total_profit (calc.profit 式 = 売上 - 材料 - 工事 - 広告 - 手数料 - カード
//                  ロードでは工事/材料/カード=0 → 売上 - (広告+手数料) と一致)
//
// state 配置 (LocksmithForm と同パターン):
//   - 共通 EntryFormState の列はそのまま流用 (売上 / 広告費 / 手数料)
//   - 業態固有 UI-only (販管費 / 保険・無保険売上 / 14 チャネル内訳) は
//     RoadForm-local useState (EntryFormState を業態固有で汚さない)
//   - 内訳 onChange → 直接 setField("call_count" / "acquisition_count", sum) 同期
//
// バリデーション:
//   - 売上 ≒ 保険売上 + 無保険売上 → 不一致時 warning (エラーにせず保存可)

import { useMemo, useState } from "react";
import SectionShell from "../SectionShell";
import NumberField from "../NumberField";
import LocalNumberField from "../LocalNumberField";
import { AutoRow, fmtYen, fmtCount, fmtPct } from "../AutoCalcDisplay";
import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue } from "../../types";
import type { FieldLabels } from "../../../lib/business-labels";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
};

type ChannelKey = "ad" | "repeat" | "referral" | "revisit" | "wellnest" | "seo" | "insurance";

const CHANNEL_KEYS: readonly ChannelKey[] = [
  "ad", "repeat", "referral", "revisit", "wellnest", "seo", "insurance",
] as const;

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  ad: "広告件数",
  repeat: "リピート件数",
  referral: "紹介件数",
  revisit: "再訪問件数",
  wellnest: "ウェルネスト件数",
  seo: "SEO件数",
  insurance: "保険会社件数",
};

type ChannelState = Record<ChannelKey, InputValue>;
const emptyChannels: ChannelState = {
  ad: "", repeat: "", referral: "", revisit: "", wellnest: "", seo: "", insurance: "",
};

const num = (v: InputValue): number => (v === "" ? 0 : v);
const safePct = (a: number, b: number): number => (b === 0 ? 0 : (a / b) * 100);
const sumChannels = (c: ChannelState): number =>
  CHANNEL_KEYS.reduce((sum, k) => sum + num(c[k]), 0);

export default function RoadForm({ state, setField, validateField, errors, labels, calc }: Props) {
  // UI-only state (Phase B で DB 化予定)
  const [insuranceSales, setInsuranceSales] = useState<InputValue>("");
  const [nonInsuranceSales, setNonInsuranceSales] = useState<InputValue>("");
  const [sellingAdmin, setSellingAdmin] = useState<InputValue>("");
  const [callBreakdown, setCallBreakdown] = useState<ChannelState>(emptyChannels);
  const [acqBreakdown, setAcqBreakdown] = useState<ChannelState>(emptyChannels);

  const updateCallChannel = (key: ChannelKey, v: InputValue) => {
    const next = { ...callBreakdown, [key]: v };
    setCallBreakdown(next);
    setField("call_count", sumChannels(next));
  };
  const updateAcqChannel = (key: ChannelKey, v: InputValue) => {
    const next = { ...acqBreakdown, [key]: v };
    setAcqBreakdown(next);
    setField("acquisition_count", sumChannels(next));
  };

  // 売上比% (UI 表示用)
  const sales = num(state.outsourced_sales_revenue);
  const ratios = useMemo(() => ({
    ad: safePct(num(state.ad_cost), sales),
    commission: safePct(num(state.sales_outsourcing_cost), sales),
  }), [sales, state.ad_cost, state.sales_outsourcing_cost]);

  // 売上 ≒ 保険売上 + 無保険売上 warning (両方入力済 + 売上 > 0 のときのみ)
  const ins = num(insuranceSales);
  const nonIns = num(nonInsuranceSales);
  const splitSum = ins + nonIns;
  const splitMismatch = (ins > 0 || nonIns > 0) && sales > 0 && splitSum !== sales;
  const splitGap = sales - splitSum;

  return (
    <>
      {/* ① 新規対応セクション */}
      <SectionShell title={labels.section_sales} subtitle="入力 6項目 (販管費は記録のみ) + 自動計算 (売上比 / 粗利)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <NumberField field="outsourced_sales_revenue" label={labels.total_revenue} unit="円"
            value={state.outsourced_sales_revenue} onChange={(v) => setField("outsourced_sales_revenue", v)}
            onBlur={validateField} state={state} error={errors.outsourced_sales_revenue} required />
          <LocalNumberField label="保険売上" unit="円" value={insuranceSales} onChange={setInsuranceSales} />
          <LocalNumberField label="無保険売上" unit="円" value={nonInsuranceSales} onChange={setNonInsuranceSales} />
          <NumberField field="ad_cost" label={labels.ad_cost} unit="円"
            value={state.ad_cost} onChange={(v) => setField("ad_cost", v)}
            onBlur={validateField} state={state} error={errors.ad_cost} />
          <NumberField field="sales_outsourcing_cost" label={labels.sales_outsourcing_cost} unit="円"
            value={state.sales_outsourcing_cost} onChange={(v) => setField("sales_outsourcing_cost", v)}
            onBlur={validateField} state={state} error={errors.sales_outsourcing_cost} />
          <LocalNumberField label="販管費" unit="円" value={sellingAdmin} onChange={setSellingAdmin} />
        </div>

        {splitMismatch && (
          <p style={{
            marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#92400e", lineHeight: 1.5,
            background: "#fffbeb", borderRadius: 6, border: "1px solid #fde68a",
          }}>
            ⚠ 保険売上 + 無保険売上 ({fmtYen(splitSum)}) が売上 ({fmtYen(sales)}) と一致しません
            （差額 {fmtYen(Math.abs(splitGap))}{splitGap > 0 ? " 不足" : " 超過"}）。
            保存はブロックされませんが内訳を確認してください。
          </p>
        )}

        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 販管費・保険売上・無保険売上は現在は記録のみ。DB 保存は Phase B (PR #49 以降) で対応予定。
        </p>

        <AutoRow label="広告費 売上比" value={fmtPct(ratios.ad)} formula="= 広告費 ÷ 売上 × 100" />
        <AutoRow label="手数料 売上比" value={fmtPct(ratios.commission)} formula="= 手数料 ÷ 売上 × 100" />
        <AutoRow label="粗利" value={fmtYen(calc.profit)} formula="= 売上 − (広告費 + 手数料)" />
      </SectionShell>

      {/* ② 入電セクション */}
      <SectionShell title="② 入電" subtitle="入力 7項目 + 自動計算 (総入電件数 / 入電単価)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {CHANNEL_KEYS.map((key) => (
            <LocalNumberField key={key} label={CHANNEL_LABELS[key]} unit="件"
              value={callBreakdown[key]}
              onChange={(v) => updateCallChannel(key, v)} />
          ))}
        </div>
        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると総入電件数が自動更新されます。内訳自体は DB 保存対象外 (Phase B 予定)。
        </p>
        <AutoRow label="総入電件数" value={fmtCount(num(state.call_count))} formula="= 7 チャネル合計" />
        <AutoRow label={labels.call_unit_price} value={fmtYen(calc.call_unit_price)} formula="= 広告費 ÷ 総入電件数" />
      </SectionShell>

      {/* ③ 獲得セクション */}
      <SectionShell title="③ 獲得" subtitle="入力 7項目 + 自動計算 (総獲得件数 / 獲得単価 / 成約率)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {CHANNEL_KEYS.map((key) => (
            <LocalNumberField key={key} label={CHANNEL_LABELS[key]} unit="件"
              value={acqBreakdown[key]}
              onChange={(v) => updateAcqChannel(key, v)} />
          ))}
        </div>
        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると総獲得件数が自動更新されます。内訳自体は DB 保存対象外 (Phase B 予定)。
        </p>
        <AutoRow label="総獲得件数" value={fmtCount(num(state.acquisition_count))} formula="= 7 チャネル合計" />
        <AutoRow label={labels.cpa} value={fmtYen(calc.cpa)} formula="= 広告費 ÷ 総獲得件数" />
        <AutoRow label={labels.conv_rate} value={fmtPct(calc.conv_rate)} formula="= 総獲得件数 ÷ 総入電件数 × 100" />
      </SectionShell>
    </>
  );
}
