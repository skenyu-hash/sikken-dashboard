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
// PR c95-D-6 (slice 6): consultantFee.ts から CONSULTANT_FEE_RATE 撤去。
//   月境界定数 CONSULTANT_FEE_APPLIED_FROM_YYYYMM + toYyyyMm のみ残置 (水道手入力 controle 適用判定用)。
import { CONSULTANT_FEE_APPLIED_FROM_YYYYMM, toYyyyMm } from "../../../lib/consultantFee";
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
  // PR c95-D-6 (slice 6): water + yyyymm >= 202605 で AutoCalcDisplay subtitle に「コンサル費(手入力)」表記。
  //   旧 c95-B-3 は CONSULTANT_FEE_RATE.water > 0 ガードもあったが、c95-D で手入力ベースに統一済のため撤去。
  //   月境界 (yyyymm >= 202605) は維持 → 4 月以前は subtitle に控除文言を出さない。
  const yyyymm = toYyyyMm(state.year, state.month);
  const consultantFeeApplied = yyyymm >= CONSULTANT_FEE_APPLIED_FROM_YYYYMM;
  return (
    <>
      <SectionSales state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} defaultOpen />
      <SectionCosts state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} />
      <SectionAcquisition state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
      <SectionConstruction state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
      <SectionHelp state={state} setHelpStaff={setHelpStaff} errors={errors} labels={labels} calc={calc} />
      <SectionShift state={state} setField={setField} errors={errors} vehicleSnapshot={vehicleSnapshot} traineeSnapshot={traineeSnapshot} />
      <AutoCalcDisplay calc={calc} labels={labels} consultantFeeApplied={consultantFeeApplied} />
    </>
  );
}
