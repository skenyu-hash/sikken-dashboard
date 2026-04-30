// /api/export/area-pivot のレスポンスから XLSX 用 3 シート（売上・粗利・広告費）を組み立てる。
// 各シートはエリア(行) × 月(列) の形式。値は円整数。

import type { Sheet } from "./exportToXlsx";

export type AreaPivotResponse = {
  months: string[];
  areas: Array<{ area_id: string; area_name: string }>;
  revenue: number[][];
  profit: number[][];
  ad_cost: number[][];
  category: string | null;
};

function buildSheet(
  name: string,
  months: string[],
  areas: Array<{ area_id: string; area_name: string }>,
  matrix: number[][]
): Sheet {
  const headers = ["エリア", ...months];
  const rows: Array<Array<number | string>> = areas.map((a, ri) => [
    a.area_name,
    ...months.map((_, ci) => Math.round(matrix[ri]?.[ci] ?? 0)),
  ]);
  return { name, headers, rows };
}

export function buildAreaPivotSheets(data: AreaPivotResponse): Sheet[] {
  return [
    buildSheet("売上(円)", data.months, data.areas, data.revenue),
    buildSheet("粗利(円)", data.months, data.areas, data.profit),
    buildSheet("広告費(円)", data.months, data.areas, data.ad_cost),
  ];
}
