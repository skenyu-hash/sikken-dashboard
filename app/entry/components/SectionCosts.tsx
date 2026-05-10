"use client";
// ② コスト セクション: 入力 4 (f11/f12/f13/f14)

import type { EntryFormState, ValidationErrors, InputFieldKey, InputValue } from "../types";
import type { FieldLabels } from "../../lib/business-labels";
import SectionShell from "./SectionShell";
import NumberField from "./NumberField";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
};

export default function SectionCosts({ state, setField, validateField, errors, labels }: Props) {
  return (
    <SectionShell title={labels.section_costs} subtitle="入力 4項目">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <NumberField field="total_labor_cost" label={labels.total_labor_cost} unit="円"
          value={state.total_labor_cost} onChange={(v) => setField("total_labor_cost", v)}
          onBlur={validateField} state={state} error={errors.total_labor_cost} />
        <NumberField field="material_cost" label={labels.material_cost} unit="円"
          value={state.material_cost} onChange={(v) => setField("material_cost", v)}
          onBlur={validateField} state={state} error={errors.material_cost} />
        <NumberField field="sales_outsourcing_cost" label={labels.sales_outsourcing_cost} unit="円"
          value={state.sales_outsourcing_cost} onChange={(v) => setField("sales_outsourcing_cost", v)}
          onBlur={validateField} state={state} error={errors.sales_outsourcing_cost} />
        <NumberField field="card_processing_fee" label={labels.card_processing_fee} unit="円"
          value={state.card_processing_fee} onChange={(v) => setField("card_processing_fee", v)}
          onBlur={validateField} state={state} error={errors.card_processing_fee} />
      </div>
    </SectionShell>
  );
}
