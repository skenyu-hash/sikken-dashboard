// /api/export/full-report のレスポンスから XLSX 用 3 シートを組み立てる。
// シート構成（指示書通り）:
//   ① 月次×カテゴリ: 月(行) × カテゴリ(列)、3指標を結合した1シート
//   ② 月次×エリア:   月(行) × エリア(列)、3指標を結合した1シート
//   ③ カテゴリ×エリア: カテゴリ(行) × エリア(列)、3指標を結合した1シート
// 指標（売上・粗利・広告費）は同シート内で「区分列」を使って区分けする。

import type { Sheet } from "./exportToXlsx";

type Cat = { id: string; label: string };
type Area = { area_id: string; area_name: string };

export type FullReportResponse = {
  sheet1_monthly_by_category: {
    months: string[];
    categories: Cat[];
    revenue: number[][];
    profit: number[][];
    ad_cost: number[][];
  };
  sheet2_monthly_by_area: {
    months: string[];
    areas: Area[];
    revenue: number[][];
    profit: number[][];
    ad_cost: number[][];
  };
  sheet3_category_by_area: {
    categories: Cat[];
    areas: Area[];
    revenue: number[][];
    profit: number[][];
    ad_cost: number[][];
  };
};

const METRICS: Array<{ key: "revenue" | "profit" | "ad_cost"; label: string }> = [
  { key: "revenue", label: "売上(円)" },
  { key: "profit",  label: "粗利(円)" },
  { key: "ad_cost", label: "広告費(円)" },
];

// 共通: 指標ごとにブロックを縦に積んで1シートにまとめる
function buildCombinedSheet(
  name: string,
  rowAxisLabel: string,
  rowItems: string[],          // 行ヘッダー値（月名 or エリア名 or カテゴリ名）
  colItems: string[],          // 列ヘッダー値
  matrices: Record<"revenue" | "profit" | "ad_cost", number[][]>
): Sheet {
  const headers = ["指標", rowAxisLabel, ...colItems];
  const rows: Array<Array<number | string>> = [];
  for (const m of METRICS) {
    const matrix = matrices[m.key];
    rowItems.forEach((rowName, ri) => {
      rows.push([
        m.label,
        rowName,
        ...colItems.map((_, ci) => Math.round(matrix[ri]?.[ci] ?? 0)),
      ]);
    });
    // 区切りに空行を入れてブロックを視覚分離
    rows.push(["", "", ...colItems.map(() => "")]);
  }
  return { name, headers, rows };
}

export function buildFullReportSheets(data: FullReportResponse): Sheet[] {
  const s1 = data.sheet1_monthly_by_category;
  const s2 = data.sheet2_monthly_by_area;
  const s3 = data.sheet3_category_by_area;

  return [
    buildCombinedSheet(
      "月次×カテゴリ",
      "月",
      s1.months,
      s1.categories.map((c) => c.label),
      { revenue: s1.revenue, profit: s1.profit, ad_cost: s1.ad_cost }
    ),
    buildCombinedSheet(
      "月次×エリア",
      "月",
      s2.months,
      s2.areas.map((a) => a.area_name),
      { revenue: s2.revenue, profit: s2.profit, ad_cost: s2.ad_cost }
    ),
    buildCombinedSheet(
      "カテゴリ×エリア",
      "カテゴリ",
      s3.categories.map((c) => c.label),
      s3.areas.map((a) => a.area_name),
      { revenue: s3.revenue, profit: s3.profit, ad_cost: s3.ad_cost }
    ),
  ];
}
