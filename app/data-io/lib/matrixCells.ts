// Phase 8 で確立したマトリクス感応度グリッドのロジックを純粋関数化したもの。
// app/matrix/page.tsx 側のコードは触らず、ここで新規定義する。
// 将来 Phase 11 等で /matrix 側もこの関数を import する形に統合する想定。

export const ROW_UPPER_CAP = 15000;
export const SWITCH_POINT = 10000;

export type CellLabel = "CF黒" | "PL黒" | "赤字";

export type Cell = {
  adRate: number;
  label: CellLabel;
  plMan: number;
  cfMan: number;
  displayVal: number;
};

export type MatrixRow = {
  salesMan: number;
  cells: Cell[];
};

// 売上行（万円）の動的刻み:
// 〜1億(SWITCH_POINT) は 100万刻み、1億超〜1.5億(ROW_UPPER_CAP) は 500万刻み。
// 上限は常に ROW_UPPER_CAP に固定（鍵カテゴリ視野）。
export function buildMatrixRows(
  forecastRevenueMan: number,
  currentRevenueMan: number
): number[] {
  const points = [forecastRevenueMan, currentRevenueMan].filter((v) => v > 0);
  let minMan: number;
  if (points.length === 0) {
    minMan = 500;
  } else {
    const lowest = Math.min(...points);
    minMan = Math.max(100, Math.round((lowest * 0.5) / 100) * 100);
  }
  const maxMan = ROW_UPPER_CAP;
  const list: number[] = [];
  const denseEnd = Math.min(maxMan, SWITCH_POINT);
  for (let v = minMan; v <= denseEnd; v += 100) list.push(v);
  if (maxMan > SWITCH_POINT) {
    for (let v = SWITCH_POINT + 500; v <= maxMan; v += 500) list.push(v);
  }
  return list;
}

// 広告費率列: 13% 〜 45% を 1% 刻み (33列)
export function buildMatrixCols(): number[] {
  return Array.from({ length: 33 }, (_, i) => 13 + i);
}

export function computeCell(
  salesMan: number,
  adRate: number,
  profitRatePct: number,
  fixedCostMan: number,
  cfExtraMan: number
): Cell {
  const profitMan = salesMan * (profitRatePct / 100);
  const adCostMan = salesMan * (adRate / 100);
  const plMan = profitMan - adCostMan - fixedCostMan;
  const cfMan = plMan - cfExtraMan;
  const displayVal = fixedCostMan > 0 ? cfMan : plMan;
  let label: CellLabel;
  if (cfMan >= 0) label = "CF黒";
  else if (plMan >= 0) label = "PL黒";
  else label = "赤字";
  return { adRate, label, plMan, cfMan, displayVal };
}

export function buildMatrix(
  rowsMan: number[],
  cols: number[],
  profitRatePct: number,
  fixedCostMan: number,
  cfExtraMan: number
): MatrixRow[] {
  return rowsMan.map((salesMan) => ({
    salesMan,
    cells: cols.map((adRate) =>
      computeCell(salesMan, adRate, profitRatePct, fixedCostMan, cfExtraMan)
    ),
  }));
}
