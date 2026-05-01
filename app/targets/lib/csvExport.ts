// /targets ページの CSV エクスポート専用ユーティリティ。
// 既存 app/data-io/lib/exportToCsv.ts は data-io 専用の column マッピングに
// 依存しているため、targets 用には軽量な独立実装を用意。
// triggerBlobDownload は data-io と共有（DRY）。

import { triggerBlobDownload } from "../../data-io/lib/triggerBlobDownload";

const BOM = "﻿"; // Excel UTF-8 文字化け対策

function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * 2次元配列を CSV 文字列化（UTF-8 BOM 付き）。
 * 1行目はヘッダー、2行目以降はデータ。
 */
export function buildTargetsCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((r) => r.map(escapeCell).join(",")),
  ];
  return BOM + lines.join("\n");
}

/**
 * filename の例: sikken_targets_water_2026-04_20260501_1430.csv
 */
export function buildTargetsFilename(
  category: string,
  year: number,
  month: number,
  referenceDate: Date = new Date()
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${referenceDate.getFullYear()}${pad(referenceDate.getMonth() + 1)}${pad(referenceDate.getDate())}`;
  const hm = `${pad(referenceDate.getHours())}${pad(referenceDate.getMinutes())}`;
  return `sikken_targets_${category}_${year}-${pad(month)}_${ymd}_${hm}.csv`;
}

/**
 * CSV をブラウザでダウンロードトリガー。
 */
export function downloadTargetsCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerBlobDownload(blob, filename);
}
