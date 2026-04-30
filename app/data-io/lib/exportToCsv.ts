// papaparse を使って CSV 文字列を生成し、ブラウザでダウンロードさせる。
// Excel 文字化け対策として UTF-8 BOM を先頭に付与する。

import Papa from "papaparse";
import { applyRound, type ColumnDef } from "./columnMappings";

const BOM = "﻿";

export function rowsToCsv(
  rows: Array<Record<string, unknown>>,
  columns: ColumnDef[]
): string {
  const header = columns.map((c) => c.label);
  const data = rows.map((r) => columns.map((c) => applyRound(r[c.key], c.roundType)));
  const csv = Papa.unparse({ fields: header, data }, { quotes: false });
  return BOM + csv;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// matrix-cells 用: 売上(万) + 広告費率列 のグリッドを CSV 化
export function matrixToCsv(
  header: string[],
  rows: Array<{ salesMan: number; cells: Array<{ displayVal: number }> }>
): string {
  const data = rows.map((r) => [
    Math.round(r.salesMan),
    ...r.cells.map((c) => Math.round(c.displayVal)),
  ]);
  const csv = Papa.unparse({ fields: header, data }, { quotes: false });
  return BOM + csv;
}
