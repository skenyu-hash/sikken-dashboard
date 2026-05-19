"use client";
// PR #48b c5-road + PR #52 + PR #58c: ロード業態フォーム。
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
//
// PR #58c で変更点 (Phase B 完結):
//   - 入電 7 内訳を DB 保存化 (road_*_call_count、PR #58b 同型)
//   - 保険売上 / 無保険売上 を DB 保存化 (road_insurance_revenue / road_non_insurance_revenue、BIGINT)
//   - 販管費を DB 保存化 (road_selling_admin_cost、円単位)
//   - 営業利益式は変更しない (sales - adCost - sales_outsourcing_cost のまま、販管費は記録のみ)
//
// 注意 (保険関連 3 列):
//   road_insurance_count       = 保険会社経由の獲得件数 (既存、PR #52)
//   road_insurance_call_count  = 保険会社経由の入電件数 (新規、PR #58c)
//   road_insurance_revenue     = 保険業務由来の売上 (新規、PR #58c)
//
// DB マッピング (PR #58c 適用後):
//   売上                 → outsourced_sales_revenue (ロードは単独入力)
//   保険売上 / 無保険売上 → road_insurance_revenue / road_non_insurance_revenue
//   広告費               → ad_cost
//   手数料               → sales_outsourcing_cost
//   販管費               → road_selling_admin_cost
//   入電 7 内訳          → road_ad_call_count / road_repeat_call_count / ... / road_insurance_call_count
//   獲得 7 内訳          → road_ad_count / road_repeat_count / ... / road_insurance_count
//   総入電件数 (自動)    → call_count   (7 内訳の和)
//   総獲得件数 (自動)    → acquisition_count (7 内訳の和)
//   粗利 (自動)          → total_profit (calc.profit 流用)
//
// バリデーション:
//   - 売上 ≒ 保険売上 + 無保険売上 → 不一致時 warning (保存ブロックなし、splitMismatch 維持)

import { useMemo } from "react";
import SectionShell from "../SectionShell";
import NumberField from "../NumberField";
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

// PR #58c: 入電チャネル → EntryFormState フィールド名のマッピング (DB 列対応、PR #58b 同型)
const CALL_FIELD: Record<ChannelKey, InputFieldKey> = {
  ad: "road_ad_call_count",
  repeat: "road_repeat_call_count",
  referral: "road_referral_call_count",
  revisit: "road_revisit_call_count",
  wellnest: "road_wellnest_call_count",
  seo: "road_seo_call_count",
  insurance: "road_insurance_call_count",
};

const num = (v: InputValue): number => (v === "" ? 0 : v);
const safePct = (a: number, b: number): number => (b === 0 ? 0 : (a / b) * 100);

export default function RoadForm({ state, setField, validateField, errors, labels, calc }: Props) {
  // PR #58c: 入電チャネル更新 — state.road_*_call_count を直接更新 + call_count に sync (PR #58b 同型)
  const updateCallChannel = (key: ChannelKey, v: InputValue) => {
    setField(CALL_FIELD[key], v);
    const sum = CHANNEL_KEYS.reduce((s, k) => {
      const value = k === key ? v : state[CALL_FIELD[k]];
      return s + num(value);
    }, 0);
    setField("call_count", sum);
  };

  // 獲得チャネル更新: state.road_*_count を直接更新 + acquisition_count に sync
  // PR #52 で local state → shared state に切替、DB 保存・編集モード復元に対応。
  const updateAcqChannel = (key: ChannelKey, v: InputValue) => {
    setField(ACQ_FIELD[key], v);
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
  const ins = num(state.road_insurance_revenue);
  const nonIns = num(state.road_non_insurance_revenue);
  const splitSum = ins + nonIns;
  const splitMismatch = (ins > 0 || nonIns > 0) && sales > 0 && splitSum !== sales;
  const splitGap = sales - splitSum;

  return (
    <>
      {/* ① 新規対応セクション (PR #58c で保険売上 2 分割・販管費を DB 化) */}
      <SectionShell title={labels.section_sales} subtitle="入力 6項目 (販管費は記録のみ) + 自動計算 (売上比 / 粗利)" group="rev">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <NumberField field="outsourced_sales_revenue" label={labels.total_revenue} unit="円"
            value={state.outsourced_sales_revenue} onChange={(v) => setField("outsourced_sales_revenue", v)}
            onBlur={validateField} state={state} error={errors.outsourced_sales_revenue} required />
          <NumberField field="road_insurance_revenue" label="保険売上" unit="円"
            value={state.road_insurance_revenue} onChange={(v) => setField("road_insurance_revenue", v)}
            onBlur={validateField} state={state} error={errors.road_insurance_revenue} />
          <NumberField field="road_non_insurance_revenue" label="無保険売上" unit="円"
            value={state.road_non_insurance_revenue} onChange={(v) => setField("road_non_insurance_revenue", v)}
            onBlur={validateField} state={state} error={errors.road_non_insurance_revenue} />
          <NumberField field="ad_cost" label={labels.ad_cost} unit="円"
            value={state.ad_cost} onChange={(v) => setField("ad_cost", v)}
            onBlur={validateField} state={state} error={errors.ad_cost} />
          <NumberField field="sales_outsourcing_cost" label={labels.sales_outsourcing_cost} unit="円"
            value={state.sales_outsourcing_cost} onChange={(v) => setField("sales_outsourcing_cost", v)}
            onBlur={validateField} state={state} error={errors.sales_outsourcing_cost} />
          <NumberField field="road_selling_admin_cost" label="販管費" unit="円"
            value={state.road_selling_admin_cost} onChange={(v) => setField("road_selling_admin_cost", v)}
            onBlur={validateField} state={state} error={errors.road_selling_admin_cost} />
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
          💡 PR #58c で保険売上・無保険売上・販管費を DB 保存化。販管費は営業利益式には影響しません (記録のみ)。
        </p>

        <AutoRow label="広告費 売上比" value={fmtPct(ratios.ad)} formula="= 広告費 ÷ 売上 × 100" />
        <AutoRow label="手数料 売上比" value={fmtPct(ratios.commission)} formula="= 手数料 ÷ 売上 × 100" />
        <AutoRow label="粗利" value={fmtYen(calc.profit)} formula="= 売上 − (広告費 + 手数料)" />
      </SectionShell>

      {/* ② 入電セクション (PR #58c で 7 内訳を DB 保存化、PR #58b 同型) */}
      <SectionShell title="② 入電" subtitle="入力 7項目 + 自動計算 (総入電件数 / 入電単価)" group="acq">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {CHANNEL_KEYS.map((key) => (
            <NumberField key={key} field={CALL_FIELD[key]} label={CHANNEL_LABELS[key]} unit="件"
              value={state[CALL_FIELD[key]]}
              onChange={(v) => updateCallChannel(key, v)}
              onBlur={validateField} state={state} error={errors[CALL_FIELD[key]]} />
          ))}
        </div>
        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると総入電件数が自動更新されます。PR #58c で 7 内訳すべて DB 保存対象。
        </p>
        <AutoRow label="総入電件数" value={fmtCount(num(state.call_count))} formula="= 7 チャネル合計" />
        <AutoRow label={labels.call_unit_price} value={fmtYen(calc.call_unit_price)} formula="= 広告費 ÷ 総入電件数" />
      </SectionShell>

      {/* ③ 獲得セクション (PR #52 で 7 内訳を DB 保存化) */}
      <SectionShell title="③ 獲得" subtitle="入力 7項目 + 自動計算 (総獲得件数 / 獲得単価 / 成約率)" group="acq">
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
