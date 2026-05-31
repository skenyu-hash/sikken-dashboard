"use client";
// PR #48b c3: 水道業態 canonical フォーム。
//
// PR #48b 以前、EntryForm.tsx の本文セクションとして直接記述されていた
// 5 セクション + AutoCalcDisplay を WaterForm に集約。EntryForm は routing
// layer 化され、業態毎に異なる Form コンポーネントを呼び分ける構成になる。
//
// 仕様書: docs/specs/spec-form-redesign.md §4.2 (水道 31 フィールド)
// 入力 20 + auto 11 = 31 フィールドの全てが本コンポーネントの責務範囲。
//
// 入出力契約:
//   - state は EntryForm が所有 (single source of truth)
//   - setField / validateField / errors / labels / calc は EntryForm から受領
//   - 本コンポーネントは「水道仕様 31 フィールドを描画する」だけの責務

import SectionSales from "../SectionSales";
import SectionCosts from "../SectionCosts";
import SectionAcquisition from "../SectionAcquisition";
import SectionConstruction from "../SectionConstruction";
import SectionHelp from "../SectionHelp";
import SectionShift from "../SectionShift";
import AutoCalcDisplay from "../AutoCalcDisplay";
import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue, HelpStaffEntry } from "../../types";
import type { FieldLabels } from "../../../lib/business-labels";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  setHelpStaff: (next: HelpStaffEntry[]) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
  vehicleSnapshot: number | null;
  traineeSnapshot: number | null;
};

export default function WaterForm({ state, setField, setHelpStaff, validateField, errors, labels, calc, vehicleSnapshot, traineeSnapshot }: Props) {
  return (
    <>
      <SectionSales state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} defaultOpen />
      <SectionCosts state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} />
      <SectionAcquisition state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
      <SectionConstruction state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
      <SectionHelp state={state} setHelpStaff={setHelpStaff} errors={errors} labels={labels} calc={calc} />
      <SectionShift state={state} setField={setField} errors={errors} vehicleSnapshot={vehicleSnapshot} traineeSnapshot={traineeSnapshot} />
      <AutoCalcDisplay calc={calc} labels={labels} />
    </>
  );
}
