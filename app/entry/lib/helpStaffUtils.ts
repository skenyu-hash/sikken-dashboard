// PR c95-A-2: HELP 担当者配列の派生計算・整形ヘルパー (純関数)。
//
// 単一ソース化の動機:
//   useFormCalculations / SectionHelp / LocksmithForm / EntryForm.handleSave の 4 箇所で
//   同型の SUM / clean / validate を inline 実装すると drift bug の温床になる。
//   本 lib に集約し、test:integration:c95-a-2-help-staff から純関数として検証する。
//
// 設計原則:
//   - InputValue (number | "") の取り扱いを一箇所に閉じる (numOrZero と等価)
//   - validation は副作用なし: index と reason を返すだけ、表示は呼び出し側責務
//   - clean は元配列を破壊しない (filter で新配列)

import type { HelpStaffEntry, InputValue } from "../types";

export const numOrZeroLocal = (v: InputValue): number => (v === "" ? 0 : v);

export function sumHelpSales(rows: HelpStaffEntry[]): number {
  return rows.reduce((s, r) => s + numOrZeroLocal(r.help_sales), 0);
}
export function sumHelpCount(rows: HelpStaffEntry[]): number {
  return rows.reduce((s, r) => s + numOrZeroLocal(r.help_count), 0);
}
export function sumHelpClose(rows: HelpStaffEntry[]): number {
  return rows.reduce((s, r) => s + numOrZeroLocal(r.help_close_count), 0);
}
/** HELP 客単価 = 合計売上 ÷ 合計件数 (件数 0 のとき 0) */
export function helpUnitPrice(rows: HelpStaffEntry[]): number {
  const c = sumHelpCount(rows);
  return c === 0 ? 0 : sumHelpSales(rows) / c;
}

/** G4: 全項目空 (氏名 trim 後空 + 数値 3 つとも 0/"") の行 */
export function isHelpRowEmpty(r: HelpStaffEntry): boolean {
  return r.staff_name.trim() === ""
    && numOrZeroLocal(r.help_sales) === 0
    && numOrZeroLocal(r.help_count) === 0
    && numOrZeroLocal(r.help_close_count) === 0;
}
/** G5 判定補助: 数値がいずれか入っている (= staff_name 必須対象) */
export function helpRowHasNumber(r: HelpStaffEntry): boolean {
  return numOrZeroLocal(r.help_sales) > 0
    || numOrZeroLocal(r.help_count) > 0
    || numOrZeroLocal(r.help_close_count) > 0;
}

/** handleSave 直前の整形 + validation 結果。
 *  cleaned: 空行を除外した配列 (各 InputValue は number 化)。
 *  nameMissingIndex: cleaned のうち最初に「数値ありで氏名なし」となる index (なしは -1)。
 *  sumSales/sumCount: 派生 scalar 二重書込 (G1 案 b) 用の合算値。
 */
export function cleanHelpStaffForSave(rows: HelpStaffEntry[]): {
  cleaned: Array<{ staff_name: string; help_sales: number; help_count: number; help_close_count: number }>;
  nameMissingIndex: number;
  sumSales: number;
  sumCount: number;
} {
  const filtered = rows.filter((r) => !isHelpRowEmpty(r));
  const nameMissingIndex = filtered.findIndex((r) => r.staff_name.trim() === "" && helpRowHasNumber(r));
  const cleaned = filtered.map((r) => ({
    staff_name: r.staff_name.trim(),
    help_sales: numOrZeroLocal(r.help_sales),
    help_count: numOrZeroLocal(r.help_count),
    help_close_count: numOrZeroLocal(r.help_close_count),
  }));
  const sumSales = cleaned.reduce((s, r) => s + r.help_sales, 0);
  const sumCount = cleaned.reduce((s, r) => s + r.help_count, 0);
  return { cleaned, nameMissingIndex, sumSales, sumCount };
}
