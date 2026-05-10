"use client";
// ⑤ HELP セクション: 入力 2 (f27/f28) + auto 1 (f29)

import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue } from "../types";
import type { FieldLabels } from "../../lib/business-labels";
import SectionShell from "./SectionShell";
import NumberField from "./NumberField";
import { AutoRow, fmtYen } from "./AutoCalcDisplay";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
};

export default function SectionHelp({ state, setField, validateField, errors, labels, calc }: Props) {
  return (
    <SectionShell title={labels.section_help} subtitle="入力 2項目 + 自動計算 1項目">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <NumberField field="help_count" label={labels.help_count} unit="件"
          value={state.help_count} onChange={(v) => setField("help_count", v)}
          onBlur={validateField} state={state} error={errors.help_count} />
        <NumberField field="help_revenue" label={labels.help_revenue} unit="円"
          value={state.help_revenue} onChange={(v) => setField("help_revenue", v)}
          onBlur={validateField} state={state} error={errors.help_revenue} />
      </div>
      <AutoRow label={labels.help_unit_price} value={fmtYen(calc.help_unit_price)} formula="= HELP売上 ÷ HELP件数" />
    </SectionShell>
  );
}
