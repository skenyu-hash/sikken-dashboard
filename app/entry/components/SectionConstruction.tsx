"use client";
// ④ 施工 セクション: 入力 4 (f22/f23/f24/f25) + auto 2 (f21/f26)
// 業態別語尾は labels で吸収 (water=工事 / road=出動 / detective=調査)

import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue } from "../types";
import type { FieldLabels } from "../../lib/business-labels";
import SectionShell from "./SectionShell";
import NumberField from "./NumberField";
import { AutoRow, fmtYen, fmtCount } from "./AutoCalcDisplay";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
};

export default function SectionConstruction({ state, setField, validateField, errors, labels, calc }: Props) {
  return (
    <SectionShell title={labels.section_construction} subtitle="入力 4項目 + 自動計算 2項目">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <NumberField field="outsourced_construction_count" label={labels.outsourced_construction_count} unit="件"
          value={state.outsourced_construction_count} onChange={(v) => setField("outsourced_construction_count", v)}
          onBlur={validateField} state={state} error={errors.outsourced_construction_count} />
        <NumberField field="internal_construction_count" label={labels.internal_construction_count} unit="件"
          value={state.internal_construction_count} onChange={(v) => setField("internal_construction_count", v)}
          onBlur={validateField} state={state} error={errors.internal_construction_count} />
      </div>
      <AutoRow label={labels.total_construction_count} value={fmtCount(calc.total_construction_count)} formula="= 外注工事件数 + 自社工事件数" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 14 }}>
        <NumberField field="outsourced_construction_cost" label={labels.outsourced_construction_cost} unit="円"
          value={state.outsourced_construction_cost} onChange={(v) => setField("outsourced_construction_cost", v)}
          onBlur={validateField} state={state} error={errors.outsourced_construction_cost} />
        <NumberField field="internal_construction_profit" label={labels.internal_construction_profit} unit="円"
          value={state.internal_construction_profit} onChange={(v) => setField("internal_construction_profit", v)}
          onBlur={validateField} state={state} error={errors.internal_construction_profit} />
      </div>
      <AutoRow label={labels.actual_construction_cost} value={fmtYen(calc.actual_construction_cost)} formula="= 外注工事費 − 自社工事利益" />
    </SectionShell>
  );
}
