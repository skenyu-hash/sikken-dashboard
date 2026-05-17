"use client";
// PR #48b c4-locksmith: 鍵業態フォーム。
//
// 仕様確定 (Web Claude 5/16):
//   ① 新規対応: 売上、工事費、材料費、広告費、手数料、販管費 (販管費は記録のみ Phase B)
//   ② 入電  : 車LP+メール / インハウス + 自動 (総入電件数 / 入電単価)
//   ③ 獲得  : 車LP+メール / インハウス / リピート(紹介) / 再訪問 / HELP + 自動 (総獲得件数 / 獲得単価 / 成約率)
//   ④ HELP : HELP 売上のみ + 自動 (HELP 客単価 / HELP 率)
//   ⑤ SectionConstruction: 非表示
//
// DB マッピング (既存 monthly_summaries 列を流用):
//   売上          → outsourced_sales_revenue (locksmith では単独入力、internal は 0 据置 → calc.total_revenue = 売上)
//   工事費        → total_labor_cost (UI ラベル「工事費」)
//   材料費        → material_cost
//   広告費        → ad_cost
//   手数料        → sales_outsourcing_cost (UI ラベル「手数料」)
//   販管費        → 保存しない (Phase B / 入力欄は記録用、state は LocksmithForm-local)
//   総入電件数 (自動) → call_count   (内訳の和、内訳自体は保存しない)
//   総獲得件数 (自動) → acquisition_count (5 内訳の和、HELP は help_count にも保存)
//   HELP 件数     → help_count (獲得 5 の HELP スロット = state.help_count を共有)
//   HELP 売上     → help_revenue
//   入電単価/獲得単価/成約率 → 既存 calc が AdCost/CallCount/AcquisitionCount から自動算出
//   粗利 (自動)   → total_profit (= calc.profit、calc.profit 式は card_processing_fee=0 で
//                  locksmith 仕様の 売上-(工事費+材料費+広告費+手数料) と一致)
//
// state 配置:
//   - 既存 EntryFormState の列 (上記マッピング先) はそのまま使用
//   - locksmith 固有 7 フィールド (販管費 + 内訳 6) は LocksmithForm-local useState
//     (EntryFormState を業態固有で汚さないため、handleSave/fetchExisting は無改修)
//
// edit モードの既知制限:
//   既存 DB に call_count=100 が保存済の場合、初期表示は state.call_count=100 だが
//   内訳 (locksmith-local) は空。ユーザーが内訳を入力すると合計値で上書きされる。
//   Phase B (PR #49 以降) で内訳を DB 化することで解消予定。

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

const num = (v: InputValue): number => (v === "" ? 0 : v);
const safePct = (a: number, b: number): number => (b === 0 ? 0 : (a / b) * 100);

export default function LocksmithForm({ state, setField, validateField, errors, labels, calc }: Props) {
  // locksmith 固有 UI-only state (DB 保存対象外、Phase B 化予定)
  const [sellingAdmin, setSellingAdmin] = useState<InputValue>("");
  const [callLpMail, setCallLpMail] = useState<InputValue>("");
  const [callInhouse, setCallInhouse] = useState<InputValue>("");
  const [acqLpMail, setAcqLpMail] = useState<InputValue>("");
  const [acqInhouse, setAcqInhouse] = useState<InputValue>("");
  const [acqRepeat, setAcqRepeat] = useState<InputValue>("");
  const [acqRevisit, setAcqRevisit] = useState<InputValue>("");

  // 入電 内訳 → state.call_count 同期 (直接代入、useEffect は使わない:
  // マウント時に DB-loaded 値を 0 に上書きするのを防ぐため)
  const syncCallCount = (lp: InputValue, ih: InputValue) => {
    setField("call_count", num(lp) + num(ih));
  };
  // 獲得 内訳 → state.acquisition_count 同期 (HELP は state.help_count を含める)
  const syncAcquisitionCount = (lp: InputValue, ih: InputValue, rep: InputValue, rev: InputValue, help: InputValue) => {
    setField("acquisition_count", num(lp) + num(ih) + num(rep) + num(rev) + num(help));
  };

  // 売上比% (UI 表示用、ローカル計算)
  const sales = num(state.outsourced_sales_revenue);
  const ratios = useMemo(() => ({
    labor: safePct(num(state.total_labor_cost), sales),
    material: safePct(num(state.material_cost), sales),
    ad: safePct(num(state.ad_cost), sales),
    commission: safePct(num(state.sales_outsourcing_cost), sales),
  }), [sales, state.total_labor_cost, state.material_cost, state.ad_cost, state.sales_outsourcing_cost]);

  const helpRate = useMemo(() => safePct(num(state.help_revenue), sales), [sales, state.help_revenue]);

  return (
    <>
      {/* ① 新規対応セクション */}
      <SectionShell title={labels.section_sales} subtitle="入力 6項目 (販管費は記録のみ) + 自動計算 (売上比 / 粗利)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <NumberField field="outsourced_sales_revenue" label={labels.total_revenue} unit="円"
            value={state.outsourced_sales_revenue} onChange={(v) => setField("outsourced_sales_revenue", v)}
            onBlur={validateField} state={state} error={errors.outsourced_sales_revenue} required />
          <NumberField field="total_labor_cost" label={labels.total_labor_cost} unit="円"
            value={state.total_labor_cost} onChange={(v) => setField("total_labor_cost", v)}
            onBlur={validateField} state={state} error={errors.total_labor_cost} />
          <NumberField field="material_cost" label={labels.material_cost} unit="円"
            value={state.material_cost} onChange={(v) => setField("material_cost", v)}
            onBlur={validateField} state={state} error={errors.material_cost} />
          <NumberField field="ad_cost" label={labels.ad_cost} unit="円"
            value={state.ad_cost} onChange={(v) => setField("ad_cost", v)}
            onBlur={validateField} state={state} error={errors.ad_cost} />
          <NumberField field="sales_outsourcing_cost" label={labels.sales_outsourcing_cost} unit="円"
            value={state.sales_outsourcing_cost} onChange={(v) => setField("sales_outsourcing_cost", v)}
            onBlur={validateField} state={state} error={errors.sales_outsourcing_cost} />
          <LocalNumberField label="販管費" unit="円" value={sellingAdmin} onChange={setSellingAdmin} />
        </div>

        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 販管費は現在は記録のみ。粗利計算への反映は Phase B (PR #49 以降) で対応予定。
        </p>

        <AutoRow label="工事費 売上比" value={fmtPct(ratios.labor)} formula="= 工事費 ÷ 売上 × 100" />
        <AutoRow label="材料費 売上比" value={fmtPct(ratios.material)} formula="= 材料費 ÷ 売上 × 100" />
        <AutoRow label="広告費 売上比" value={fmtPct(ratios.ad)} formula="= 広告費 ÷ 売上 × 100" />
        <AutoRow label="手数料 売上比" value={fmtPct(ratios.commission)} formula="= 手数料 ÷ 売上 × 100" />
        <AutoRow label="粗利" value={fmtYen(calc.profit)} formula="= 売上 − (工事費 + 材料費 + 広告費 + 手数料)" />
      </SectionShell>

      {/* ② 入電セクション */}
      <SectionShell title="② 入電" subtitle="入力 2項目 + 自動計算 (総入電件数 / 入電単価)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <LocalNumberField label="車LP+メール" unit="件" value={callLpMail}
            onChange={(v) => { setCallLpMail(v); syncCallCount(v, callInhouse); }} />
          <LocalNumberField label="インハウス" unit="件" value={callInhouse}
            onChange={(v) => { setCallInhouse(v); syncCallCount(callLpMail, v); }} />
        </div>
        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると総入電件数が自動更新されます。内訳自体は DB 保存対象外 (Phase B 予定)。
        </p>
        <AutoRow label={labels.call_count} value={fmtCount(num(state.call_count))} formula="= 車LP+メール + インハウス" />
        <AutoRow label={labels.call_unit_price} value={fmtYen(calc.call_unit_price)} formula="= 広告費 ÷ 総入電件数" />
      </SectionShell>

      {/* ③ 獲得セクション */}
      <SectionShell title="③ 獲得" subtitle="入力 5項目 + 自動計算 (総獲得件数 / 獲得単価 / 成約率)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <LocalNumberField label="車LP+メール" unit="件" value={acqLpMail}
            onChange={(v) => { setAcqLpMail(v); syncAcquisitionCount(v, acqInhouse, acqRepeat, acqRevisit, state.help_count); }} />
          <LocalNumberField label="インハウス" unit="件" value={acqInhouse}
            onChange={(v) => { setAcqInhouse(v); syncAcquisitionCount(acqLpMail, v, acqRepeat, acqRevisit, state.help_count); }} />
          <LocalNumberField label="リピート（紹介）" unit="件" value={acqRepeat}
            onChange={(v) => { setAcqRepeat(v); syncAcquisitionCount(acqLpMail, acqInhouse, v, acqRevisit, state.help_count); }} />
          <LocalNumberField label="再訪問" unit="件" value={acqRevisit}
            onChange={(v) => { setAcqRevisit(v); syncAcquisitionCount(acqLpMail, acqInhouse, acqRepeat, v, state.help_count); }} />
          <NumberField field="help_count" label="HELP件数" unit="件"
            value={state.help_count}
            onChange={(v) => { setField("help_count", v); syncAcquisitionCount(acqLpMail, acqInhouse, acqRepeat, acqRevisit, v); }}
            onBlur={validateField} state={state} error={errors.help_count} />
        </div>

        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると総獲得件数が自動更新されます。HELP 件数のみ DB 保存対象 (他 4 内訳は Phase B 予定)。
        </p>

        <AutoRow label={labels.acquisition_count} value={fmtCount(num(state.acquisition_count))} formula="= 5 内訳の合計" />
        <AutoRow label={labels.cpa} value={fmtYen(calc.cpa)} formula="= 広告費 ÷ 総獲得件数" />
        <AutoRow label={labels.conv_rate} value={fmtPct(calc.conv_rate)} formula="= 総獲得件数 ÷ 総入電件数 × 100" />
      </SectionShell>

      {/* ④ HELP セクション */}
      <SectionShell title="④ HELP" subtitle="入力 1項目 + 自動計算 (HELP 客単価 / HELP 率)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <NumberField field="help_revenue" label={labels.help_revenue} unit="円"
            value={state.help_revenue} onChange={(v) => setField("help_revenue", v)}
            onBlur={validateField} state={state} error={errors.help_revenue} />
        </div>
        <AutoRow label={labels.help_unit_price} value={fmtYen(calc.help_unit_price)} formula="= HELP売上 ÷ HELP件数" />
        <AutoRow label="HELP 率" value={fmtPct(helpRate)} formula="= HELP売上 ÷ 売上 × 100" />
      </SectionShell>
    </>
  );
}

