"use client";
// PR #48b c4-electric: 電気業態フォーム。
//
// 構造は WaterForm と同一 (5 セクション + AutoCalcDisplay) で、
// SectionConstruction にのみ showSwitchboardCount={true} を渡して
// 「分電盤件数」入力欄を最下部に追加表示する。
//
// 仕様確定 (Web Claude, 5/16):
//   - 分電盤件数は工事件数とは独立カウント
//   - 電気業態のみ表示・保存対象 (他業態は state="" → 保存時 0)
//   - DB は monthly_summaries.switchboard_count INTEGER (PR #48b c1)
//
// 注意: state の管理・保存ロジックは EntryForm が持つ。本 component は
// SectionConstruction に prop を渡すだけで、追加の state 操作はしない。

import SectionSales from "../SectionSales";
import SectionCosts from "../SectionCosts";
import SectionAcquisition from "../SectionAcquisition";
import SectionConstruction from "../SectionConstruction";
import SectionHelp from "../SectionHelp";
import SectionShift from "../SectionShift";
import AutoCalcDisplay from "../AutoCalcDisplay";
import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue } from "../../types";
import type { FieldLabels } from "../../../lib/business-labels";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
  vehicleSnapshot: number | null;
  traineeSnapshot: number | null;
};

export default function ElectricForm({ state, setField, validateField, errors, labels, calc, vehicleSnapshot, traineeSnapshot }: Props) {
  return (
    <>
      <SectionSales state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} defaultOpen />
      <SectionCosts state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} />
      <SectionAcquisition state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
      <SectionConstruction state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} showSwitchboardCount />
      <SectionHelp state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
      <SectionShift state={state} setField={setField} errors={errors} vehicleSnapshot={vehicleSnapshot} traineeSnapshot={traineeSnapshot} />
      <AutoCalcDisplay calc={calc} labels={labels} />
    </>
  );
}
