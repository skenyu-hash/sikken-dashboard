// xlsx (SheetJS) を動的 import して Workbook を生成、Blob としてダウンロードさせる。
// 動的 import により、エクスポートUI を開かない限り xlsx の ~600KB がバンドルに乗らない。

import { applyRound, type ColumnDef } from "./columnMappings";
import { triggerBlobDownload } from "./triggerBlobDownload";

type Sheet = {
  name: string;
  headers: string[];
  rows: Array<Array<number | string>>;
};

async function buildWorkbookBlob(sheets: Sheet[]): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const aoa: Array<Array<number | string>> = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function downloadWorkbook(filename: string, sheets: Sheet[]): Promise<void> {
  const blob = await buildWorkbookBlob(sheets);
  triggerBlobDownload(blob, filename);
}

// 単一テーブル → 単一シートの Workbook
export async function downloadSingleSheetXlsx(
  filename: string,
  sheetName: string,
  rows: Array<Record<string, unknown>>,
  columns: ColumnDef[]
): Promise<void> {
  const headers = columns.map((c) => c.label);
  const data = rows.map((r) =>
    columns.map((c) => applyRound(r[c.key], c.roundType))
  );
  await downloadWorkbook(filename, [{ name: sheetName, headers, rows: data }]);
}

// matrix-cells のグリッドを単一シートに展開
export async function downloadMatrixXlsx(
  filename: string,
  sheetName: string,
  header: string[],
  rows: Array<{ salesMan: number; cells: Array<{ displayVal: number }> }>
): Promise<void> {
  const data: Array<Array<number | string>> = rows.map((r) => [
    Math.round(r.salesMan),
    ...r.cells.map((c) => Math.round(c.displayVal)),
  ]);
  await downloadWorkbook(filename, [{ name: sheetName, headers: header, rows: data }]);
}

export type { Sheet };
