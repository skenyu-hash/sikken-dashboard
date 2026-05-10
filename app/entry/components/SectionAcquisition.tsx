"use client";
// ③ 広告費 セクション: 入力 3 (f15/f16/f18) + auto 3 (f17/f19/f20)

import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue } from "../types";
import type { FieldLabels } from "../../lib/business-labels";
import SectionShell from "./SectionShell";
import NumberField from "./NumberField";
import { AutoRow, fmtYen, fmtPct } from "./AutoCalcDisplay";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
};

export default function SectionAcquisition({ state, setField, validateField, errors, labels, calc }: Props) {
  return (
    <SectionShell title={labels.section_acquisition} subtitle="入力 3項目 + 自動計算 3項目">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <NumberField field="ad_cost" label={labels.ad_cost} unit="円"
          value={state.ad_cost} onChange={(v) => setField("ad_cost", v)}
          onBlur={validateField} state={state} error={errors.ad_cost} />
        <NumberField field="call_count" label={labels.call_count} unit="件"
          value={state.call_count} onChange={(v) => setField("call_count", v)}
          onBlur={validateField} state={state} error={errors.call_count} />
        <NumberField field="acquisition_count" label={labels.acquisition_count} unit="件"
          value={state.acquisition_count} onChange={(v) => setField("acquisition_count", v)}
          onBlur={validateField} state={state} error={errors.acquisition_count} />
      </div>
      <AutoRow label={labels.call_unit_price} value={fmtYen(calc.call_unit_price)} formula="= 総広告費 ÷ 入電件数" />
      <AutoRow label={labels.cpa} value={fmtYen(calc.cpa)} formula="= 総広告費 ÷ 獲得件数" />
      <AutoRow label={labels.conv_rate} value={fmtPct(calc.conv_rate)} formula="= 獲得件数 ÷ 入電件数 × 100" />
    </SectionShell>
  );
}
