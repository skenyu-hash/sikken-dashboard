"use client";
// ④ 施工 セクション
//
// PR c93-2 で再構成:
//   旧 (発注ベース、~PR c93-1):
//     入力 4 (外注件数 / 自社件数 / 外注費 / 自社利益) + auto 2 (総件数 / 実質コスト)
//     合計件数 = 外注 + 自社 → 各社統計表との不一致 (二重カウント)、工事取得率 100% 超え
//   新 (対応ベース、PR c93-2):
//     入力 4 (工事件数 / 自社工事件数 / 外注工事費 / 自社工事利益) + auto 1 (自社工事比率)
//     工事件数 = 対応 1 件 = 工事 1 件 (10 万円以上、複数発注混合でも 1 件)
//     自社工事件数 = うち会社が内製化した件数 (営業マン自施工は除く、参考値)
//     自社工事比率 = 自社工事件数 / 工事件数 * 100
//
// 後方互換:
//   - 旧 outsourced_construction_count の UI 入力は撤去 (state 残置、常に 0)
//   - aggregation 側で COALESCE(construction_count, outsourced+internal) chain により
//     5月既存 entries (新フィールド不在) は旧 sum で fallback 集計される
//
// PR #48b: 電気業態のみ最下部に switchboard_count (分電盤件数) を追加表示。
// 工事件数とは独立カウント (仕様確定)。表示 ON/OFF は showSwitchboardCount
// prop で制御し、ElectricForm から true で渡される。

import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue } from "../types";
import type { FieldLabels } from "../../lib/business-labels";
import SectionShell from "./SectionShell";
import NumberField from "./NumberField";
import { AutoRow, fmtPct } from "./AutoCalcDisplay";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
  /** 電気業態のみ true: 最下部に 分電盤件数 (switchboard_count) 入力欄を表示 */
  showSwitchboardCount?: boolean;
  /** PR #61 c5: アコーディオン初期開閉 */
  defaultOpen?: boolean;
};

export default function SectionConstruction({ state, setField, validateField, errors, labels, calc, showSwitchboardCount, defaultOpen }: Props) {
  const subtitle = showSwitchboardCount ? "入力 5項目 + 自動計算 1項目" : "入力 4項目 + 自動計算 1項目";
  const count = showSwitchboardCount ? 6 : 5;
  return (
    <SectionShell title={labels.section_construction} subtitle={subtitle} group="cnt" count={count} defaultOpen={defaultOpen}>
      {/* PR c93-2 row 1: 工事件数 (対応ベース) + 自社工事件数 (会社内製化分) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <NumberFieldWithHint
          field="construction_count" label={labels.construction_count} unit="件"
          value={state.construction_count} onChange={(v) => setField("construction_count", v)}
          onBlur={validateField} state={state} error={errors.construction_count}
          hint="対応1件 = 工事1件 (複数発注・自社+外注混合でも1件、10万円以上のみ)" />
        <NumberFieldWithHint
          field="internal_construction_count" label={labels.internal_construction_count} unit="件"
          value={state.internal_construction_count} onChange={(v) => setField("internal_construction_count", v)}
          onBlur={validateField} state={state} error={errors.internal_construction_count}
          hint="うち会社が内製化した件数 (営業マン自施工は含まない)" />
      </div>
      <AutoRow
        label={labels.internal_construction_ratio}
        value={fmtPct(calc.internal_construction_ratio)}
        formula="= 自社工事件数 ÷ 工事件数 × 100" />

      {/* PR c93-2 row 2: 外注工事費 + 自社工事利益。
          旧 auto 「実質工事コスト = 外注工事費 − 自社工事利益」は廃止 (発注ベース時代の
          指標で対応ベース移行で意味喪失)。 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 14 }}>
        <NumberField field="outsourced_construction_cost" label={labels.outsourced_construction_cost} unit="円"
          value={state.outsourced_construction_cost} onChange={(v) => setField("outsourced_construction_cost", v)}
          onBlur={validateField} state={state} error={errors.outsourced_construction_cost} />
        <NumberField field="internal_construction_profit" label={labels.internal_construction_profit} unit="円"
          value={state.internal_construction_profit} onChange={(v) => setField("internal_construction_profit", v)}
          onBlur={validateField} state={state} error={errors.internal_construction_profit} />
      </div>

      {showSwitchboardCount && (
        <div style={{ marginTop: 14 }}>
          <NumberField field="switchboard_count" label={labels.switchboard_count} unit="件"
            value={state.switchboard_count} onChange={(v) => setField("switchboard_count", v)}
            onBlur={validateField} state={state} error={errors.switchboard_count} />
        </div>
      )}
    </SectionShell>
  );
}

// PR c93-2: NumberField + 小さなヒント文表示の local wrapper。
//   NumberField 本体に hint prop を追加せず、c93-2 で導入される 2 フィールドのみで
//   ヒント表示が必要なため SectionConstruction 内に閉じた wrapper として実装。
//   将来他セクションでも hint が欲しくなったら NumberField 本体に移植可。
function NumberFieldWithHint({
  field, label, unit, value, onChange, onBlur, state, error, hint,
}: {
  field: InputFieldKey;
  label: string;
  unit?: "円" | "件" | "%" | "";
  value: InputValue;
  onChange: (v: InputValue) => void;
  onBlur: (field: InputFieldKey, v: InputValue, state: EntryFormState) => boolean;
  state: EntryFormState;
  error?: string;
  hint: string;
}) {
  return (
    <div>
      <NumberField
        field={field} label={label} unit={unit}
        value={value} onChange={onChange} onBlur={onBlur} state={state} error={error}
      />
      <p style={{ fontSize: 9, color: "#9ca3af", marginTop: 4, lineHeight: 1.4 }}>{hint}</p>
    </div>
  );
}
