"use client";
// ⑤ HELP セクション: 担当者ごとの動的行入力 (PR c95-A-2)
//   State 型は help_staff: HelpStaffEntry[]、entries.data JSON は
//   handleSave で「help_staff 配列 + 派生 scalar」を併存書込 (G1 案 b)。
//
// UI:
//   - 行の動的追加/削除 (G4: 最後の 1 行も削除可 = HELP なし扱い)
//   - 派生表示: 合計売上 / 合計件数 / 合計成約数 / HELP 客単価 / (任意) HELP 率
//   - G7: Locksmith ④ もこの共通コンポーネントを使用 (インライン削除)。
//         helpRate prop (Locksmith のみ、業態別売上分母) でファネル外の率表示。

import type { EntryFormState, ValidationErrors, AutoCalcResult, HelpStaffEntry } from "../types";
import type { FieldLabels } from "../../lib/business-labels";
import SectionShell from "./SectionShell";
import HelpStaffRow from "./HelpStaffRow";
import { AutoRow, fmtYen, fmtCount, fmtPct } from "./AutoCalcDisplay";
import { sumHelpSales, sumHelpCount, sumHelpClose } from "../lib/helpStaffUtils";

type Props = {
  state: EntryFormState;
  setHelpStaff: (next: HelpStaffEntry[]) => void;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
  /** Locksmith のみで表示する HELP 率 (= HELP 売上合計 ÷ 業態別売上 × 100)。省略時は非表示。 */
  helpRate?: number;
  defaultOpen?: boolean;
};

export function emptyHelpStaffRow(): HelpStaffEntry {
  return { staff_name: "", help_sales: "", help_count: "", help_close_count: "" };
}

export default function SectionHelp({ state, setHelpStaff, errors, labels, calc, helpRate, defaultOpen }: Props) {
  const rows = state.help_staff;
  const sumSales = sumHelpSales(rows);
  const sumCount = sumHelpCount(rows);
  const sumClose = sumHelpClose(rows);

  const updateRow = (i: number, next: HelpStaffEntry) => {
    const arr = rows.slice();
    arr[i] = next;
    setHelpStaff(arr);
  };
  const removeRow = (i: number) => {
    const arr = rows.slice();
    arr.splice(i, 1);
    setHelpStaff(arr);
  };
  const addRow = () => setHelpStaff([...rows, emptyHelpStaffRow()]);

  return (
    <SectionShell
      title={labels.section_help}
      subtitle={`担当者別 (動的行) ${rows.length} 行 + 派生計算`}
      group="help"
      count={rows.length}
      defaultOpen={defaultOpen}
    >
      {rows.length === 0 ? (
        <p style={{
          padding: "12px 10px", fontSize: 12, color: "#6b7280", textAlign: "center",
          background: "#f9fafb", borderRadius: 6, border: "1px dashed #e5e7eb",
        }}>
          HELP 対応なし。発生したら下の「＋ 担当者を追加」で行を作成してください。
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row, i) => (
            <HelpStaffRow
              key={i}
              index={i}
              value={row}
              onChange={(next) => updateRow(i, next)}
              onRemove={() => removeRow(i)}
              errors={errors.help_staff_errors?.[i]}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        style={{
          marginTop: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700,
          color: "#065f46", background: "#ecfdf5", border: "1px solid #a7f3d0",
          borderRadius: 6, cursor: "pointer",
        }}
      >
        ＋ 担当者を追加
      </button>

      <AutoRow label="合計 HELP 売上" value={fmtYen(sumSales)} formula="= Σ 各担当者の HELP 売上" />
      <AutoRow label="合計 HELP 件数" value={fmtCount(sumCount)} formula="= Σ 各担当者の HELP 件数" />
      <AutoRow label="合計 成約数" value={fmtCount(sumClose)} formula="= Σ 各担当者の 成約数" />
      <AutoRow label={labels.help_unit_price} value={fmtYen(calc.help_unit_price)} formula="= 合計 HELP 売上 ÷ 合計 HELP 件数" />
      {helpRate !== undefined && (
        <AutoRow label="HELP 率" value={fmtPct(helpRate)} formula="= 合計 HELP 売上 ÷ 売上 × 100" />
      )}
    </SectionShell>
  );
}
