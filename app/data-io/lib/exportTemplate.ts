// Phase 9.2.2 入力テンプレートの CSV/XLSX ダウンロードラッパ。
// PR-A の下層関数（downloadCsv / downloadWorkbook）を無改変で流用しつつ、
// 注釈行（ヘッダー直下）を含めた独自レイアウトを構築する。

import Papa from "papaparse";
import type { BusinessCategory } from "../../lib/businesses";
import {
  buildTemplateRows,
  buildTemplateFilename,
  type TemplateColumn,
  type TemplateKind,
  type TemplateVariant,
} from "./templateSchemas";
import { downloadCsv } from "./exportToCsv";
import { downloadWorkbook } from "./exportToXlsx";

const BOM = "﻿";

// セル値の整形: null / undefined は空文字、それ以外はそのまま
// （テンプレートは数値丸めや単位付与をしない。経営層が編集するため、
// 元の数値表現をそのまま出力するのが見やすい）
function formatCell(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && !isFinite(value)) return "";
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

// 注釈行: 1セル目に注釈テキスト、残りは空セル
function annotationRow(annotation: string, colCount: number): Array<string | number> {
  return [annotation, ...Array(Math.max(0, colCount - 1)).fill("")];
}

function buildSheetName(kind: TemplateKind): string {
  return kind === "monthly" ? "月次テンプレ" : "日次テンプレ";
}

export function downloadTemplateCsv(
  kind: TemplateKind,
  variant: TemplateVariant,
  category?: BusinessCategory,
  referenceDate?: Date
): void {
  const ref = referenceDate ?? new Date();
  const filename = buildTemplateFilename(kind, variant, "csv", category, ref);
  const { columns, rows, annotation } = buildTemplateRows(kind, variant, category, ref);
  const headers = columns.map((c: TemplateColumn) => c.label);
  const dataRows = rows.map((r) =>
    columns.map((c) => formatCell(r[c.key]))
  );
  const csv = Papa.unparse(
    { fields: headers, data: [annotationRow(annotation, columns.length), ...dataRows] },
    { quotes: false }
  );
  // PR-A の downloadCsv は BOM を付与しない仕様のため、ここで一度だけ BOM を前置
  downloadCsv(filename, BOM + csv);
}

export async function downloadTemplateXlsx(
  kind: TemplateKind,
  variant: TemplateVariant,
  category?: BusinessCategory,
  referenceDate?: Date
): Promise<void> {
  const ref = referenceDate ?? new Date();
  const filename = buildTemplateFilename(kind, variant, "xlsx", category, ref);
  const { columns, rows, annotation } = buildTemplateRows(kind, variant, category, ref);
  const headers = columns.map((c: TemplateColumn) => c.label);
  const dataRows: Array<Array<string | number>> = rows.map((r) =>
    columns.map((c) => formatCell(r[c.key]))
  );
  await downloadWorkbook(filename, [
    {
      name: buildSheetName(kind),
      headers,
      rows: [annotationRow(annotation, columns.length), ...dataRows],
    },
  ]);
}
