"use client";
// ② コスト セクション: 入力 4 (f11/f12/f13/f14)
// PR c95-D-1 (slice 1+2): water のみ 5 項目目「コンサル費」(consultant_fee) を追加。
//   category === "water" のみ NumberField を表示、subtitle / count も 5 に切替。
//   他業態 (electric/locksmith/road/detective) は従来通り 4 項目で変化なし。

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
  /** PR #61 c5: アコーディオン初期開閉 */
  defaultOpen?: boolean;
};

export default function SectionCosts({ state, setField, validateField, errors, labels, defaultOpen }: Props) {
  const isWater = state.category === "water";
  const itemCount = isWater ? 5 : 4;
  return (
    <SectionShell title={labels.section_costs} subtitle={`入力 ${itemCount}項目`} group="cost" count={itemCount} defaultOpen={defaultOpen}>
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
        {isWater && (
          <NumberField field="consultant_fee" label={labels.consultant_fee} unit="円"
            value={state.consultant_fee} onChange={(v) => setField("consultant_fee", v)}
            onBlur={validateField} state={state} error={errors.consultant_fee} />
        )}
      </div>
    </SectionShell>
  );
}
