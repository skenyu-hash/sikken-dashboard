"use client";
// PR #48b c5-road + PR #52: ロード業態フォーム。
//
// 仕様確定 (Web Claude 5/16 / 5/18):
//   ① 新規対応: 売上 / 保険売上 / 無保険売上 / 広告費 / 手数料 / 販管費
//   ② 入電  : 7 チャネル合計 → 総入電件数 / 入電単価 (自動)
//   ③ 獲得  : 7 チャネル合計 → 総獲得件数 / 獲得単価 / 成約率 (自動)
//   ④ HELP / ⑤ 施工 : 非表示
//
// 7 チャネル (入電・獲得共通の名称):
//   ad: 広告 / repeat: リピート / referral: 紹介 / revisit: 再訪問
//   wellnest: ウェルネスト / seo: SEO / insurance: 保険会社
//
// PR #52 で変更点:
//   - 獲得 7 内訳を DB 保存化 (専用カラム road_*_count)
//     * 編集モードで内訳が DB から復元される (PR #48b の既知制限を解消)
//   - 入電 7 内訳・保険売上・無保険売上・販管費は引き続き UI only (Phase B 後続)
//   - profit 計算は既存 calc.profit (= revenue - labor 0 - material 0 - ad
//     - sales_outsourcing - card 0) でそのまま動作するため、locksmith のような
//     handleSave category-aware 分岐は不要 (Web Claude 確認、論点 1)
//
// DB マッピング (PR #52 適用後):
//   売上                 → outsourced_sales_revenue (ロードは単独入力)
//   広告費               → ad_cost
//   手数料               → sales_outsourcing_cost
//   販管費 / 保険売上 / 無保険売上 → UI のみ (LocalState)
//   入電 7 内訳          → UI のみ (LocalState、合計のみ call_count に sync)
//   獲得 7 内訳          → road_ad_count / road_repeat_count / road_referral_count
//                          / road_revisit_count / road_wellnest_count
//                          / road_seo_count / road_insurance_count
//   総入電件数 (自動)    → call_count   (7 内訳の和)
//   総獲得件数 (自動)    → acquisition_count (7 内訳の和)
//   粗利 (自動)          → total_profit (calc.profit 流用、material/labor/card=0 で
//                          売上 - (広告+手数料) と一致)
//
// 既知制限 (PR #52 後も残る、Phase B 後続):
//   - 入電 7 内訳: 編集モード復元なし (call_count は復元されるが内訳は空)
//   - 保険売上 / 無保険売上 / 販管費: UI のみ
//
// バリデーション:
//   - 売上 ≒ 保険売上 + 無保険売上 → 不一致時 warning (保存ブロックなし)

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

// PR #52: 獲得チャネル → EntryFormState フィールド名のマッピング (DB 列対応)
const ACQ_FIELD: Record<ChannelKey, InputFieldKey> = {
  ad: "road_ad_count",
  repeat: "road_repeat_count",
  referral: "road_referral_count",
  revisit: "road_revisit_count",
  wellnest: "road_wellnest_count",
  seo: "road_seo_count",
  insurance: "road_insurance_count",
};

type CallChannelState = Record<ChannelKey, InputValue>;
const emptyCallChannels: CallChannelState = {
  ad: "", repeat: "", referral: "", revisit: "", wellnest: "", seo: "", insurance: "",
};

const num = (v: InputValue): number => (v === "" ? 0 : v);
const safePct = (a: number, b: number): number => (b === 0 ? 0 : (a / b) * 100);
const sumCallChannels = (c: CallChannelState): number =>
  CHANNEL_KEYS.reduce((sum, k) => sum + num(c[k]), 0);

export default function RoadForm({ state, setField, validateField, errors, labels, calc }: Props) {
  // UI-only state (Phase B 後続)
  const [insuranceSales, setInsuranceSales] = useState<InputValue>("");
  const [nonInsuranceSales, setNonInsuranceSales] = useState<InputValue>("");
  const [sellingAdmin, setSellingAdmin] = useState<InputValue>("");
  // 入電 7 内訳は引き続き UI only (PR #52 では獲得のみ DB 化)
  const [callBreakdown, setCallBreakdown] = useState<CallChannelState>(emptyCallChannels);

  const updateCallChannel = (key: ChannelKey, v: InputValue) => {
    const next = { ...callBreakdown, [key]: v };
    setCallBreakdown(next);
    setField("call_count", sumCallChannels(next));
  };

  // 獲得チャネル更新: state.road_*_count を直接更新 + acquisition_count に sync
  // PR #52 で local state → shared state に切替、DB 保存・編集モード復元に対応。
  const updateAcqChannel = (key: ChannelKey, v: InputValue) => {
    setField(ACQ_FIELD[key], v);
    // 同期: 他 6 内訳の state + 新 v で sum
    const sum = CHANNEL_KEYS.reduce((s, k) => {
      const value = k === key ? v : state[ACQ_FIELD[k]];
      return s + num(value);
    }, 0);
    setField("acquisition_count", sum);
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
          💡 販管費・保険売上・無保険売上は現在は記録のみ。DB 保存は Phase B 後続予定。
        </p>

        <AutoRow label="広告費 売上比" value={fmtPct(ratios.ad)} formula="= 広告費 ÷ 売上 × 100" />
        <AutoRow label="手数料 売上比" value={fmtPct(ratios.commission)} formula="= 手数料 ÷ 売上 × 100" />
        <AutoRow label="粗利" value={fmtYen(calc.profit)} formula="= 売上 − (広告費 + 手数料)" />
      </SectionShell>

      {/* ② 入電セクション (内訳は UI のみ、PR #52 では DB 化せず) */}
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
          💡 内訳を入力すると総入電件数が自動更新されます。内訳自体は DB 保存対象外 (Phase B 後続予定)。
        </p>
        <AutoRow label="総入電件数" value={fmtCount(num(state.call_count))} formula="= 7 チャネル合計" />
        <AutoRow label={labels.call_unit_price} value={fmtYen(calc.call_unit_price)} formula="= 広告費 ÷ 総入電件数" />
      </SectionShell>

      {/* ③ 獲得セクション (PR #52 で 7 内訳を DB 保存化) */}
      <SectionShell title="③ 獲得" subtitle="入力 7項目 + 自動計算 (総獲得件数 / 獲得単価 / 成約率)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {CHANNEL_KEYS.map((key) => (
            <NumberField key={key} field={ACQ_FIELD[key]} label={CHANNEL_LABELS[key]} unit="件"
              value={state[ACQ_FIELD[key]]}
              onChange={(v) => updateAcqChannel(key, v)}
              onBlur={validateField} state={state} error={errors[ACQ_FIELD[key]]} />
          ))}
        </div>
        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると総獲得件数が自動更新されます。PR #52 で 7 内訳すべて DB 保存対象。
        </p>
        <AutoRow label="総獲得件数" value={fmtCount(num(state.acquisition_count))} formula="= 7 チャネル合計" />
        <AutoRow label={labels.cpa} value={fmtYen(calc.cpa)} formula="= 広告費 ÷ 総獲得件数" />
        <AutoRow label={labels.conv_rate} value={fmtPct(calc.conv_rate)} formula="= 総獲得件数 ÷ 総入電件数 × 100" />
      </SectionShell>
    </>
  );
}
