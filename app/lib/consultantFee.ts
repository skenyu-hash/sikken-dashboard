// PR c95-B-1: 業態別コンサル費控除 (純関数 lib)。
//
// 背景: 過去 Excel 損益分岐モデルで水道事業に売上の 7.7% をコンサル費として
//   変動費控除する設計だったが、現行 sikken-dashboard 未実装 → 水道粗利が
//   約 7.7 ポイント過大表示。本 lib で率マスター + 月境界判定を中央集約し、
//   B-2 以降の aggregation / day-level / read fallback から呼び出す。
//
// 設計原則 (Step 2 で確定):
//   - Record<BusinessCategory, number> で業態別管理 (将来 電気等への展開余地、G-2)
//   - 月境界 CONSULTANT_FEE_APPLIED_FROM_YYYYMM = 202605 で適用範囲制御 (G-1)
//     → 2026/4 以前のデータは控除対象外 (絶対不変項目、過去表示の遡及変動を回避)
//   - 派生計算のみ (DB 列追加なし、G-3) → schema 変更なし、4 月以前データ touch なし
//   - 全関数 pure (副作用なし、テスト容易)。
//
// 適用範囲メモ:
//   - B-1 (本 PR): 本 lib + テストのみ追加、既存粗利計算には未配線
//   - B-2: aggregation の water 分岐に consultantFee() を組み込み、202605 以降の write 時に控除
//   - B-3: day-level (useFormCalculations / WaterDailyReportSection / kpiCompute) に反映
//   - B-4: profit.ts resolveTotalProfit read fallback + UI 注記バッジ
//
// 注: 「2026/4 以前データ」 = 絶対不変項目。本 lib は 202605 未満で常に 0 を返すため、
//   過去データの粗利表示は遡って変動しない (= 過去の数字が動いて見えるリスクなし)。

import type { BusinessCategory } from "./businesses";

/**
 * 業態別コンサル費率 (売上に対する割合)。
 *   ⚠️ PR c95-D-5 (slice 5) で water 自動 7.7% を無効化 (0 に変更)。
 *   c95-D で「実額の手入力」(monthly_summaries.consultant_fee / entries.data.consultant_fee)
 *   ベースに完全移行したため、本定数による自動 % 計算は使われない。
 *   関数本体 consultantFee() は残置するが、全業態 rate=0 のため戻り値は常に 0。
 *   slice 6 で本ファイル / 関連テスト / CONSULTANT_FEE_APPLIED_FROM_YYYYMM 利用箇所を
 *   全体整理予定 (定数は呼び出し側に inline か別 lib に移動)。
 *
 * 旧値 (c95-B 当時): water = 0.077
 */
export const CONSULTANT_FEE_RATE: Record<BusinessCategory, number> = {
  water:     0, // c95-D-5: 0.077 → 0 (自動計算無効化)
  electric:  0,
  locksmith: 0,
  road:      0,
  detective: 0,
};

/**
 * コンサル費控除を適用する最古の年月 (year*100+month 形式)。
 *   202605 = 2026 年 5 月。これ未満の月は控除対象外 (= 戻り値 0)。
 *   2026 年 4 月以前データへの遡及変動を完全回避する境界。
 */
export const CONSULTANT_FEE_APPLIED_FROM_YYYYMM = 202605;

/** year/month から yyyymm 形式 (year*100 + month) を生成する小道具。 */
export function toYyyyMm(year: number, month: number): number {
  return year * 100 + month;
}

/**
 * 業態 / 売上 / 対象年月 を引数に、控除すべきコンサル費を返す。
 *
 *   1. yyyymm < 202605 → 0 (適用範囲外、過去データガード)
 *   2. 業態の率が 0 以下 → 0 (water 以外の現状ケース)
 *   3. revenue が 0 以下 / NaN / Infinity → 0 (異常値ガード、divide-by-zero に類する保護)
 *   4. それ以外 → revenue * rate
 *
 * 戻り値は小数 (Math.round は呼び出し側 = aggregation SQL / 表示層 の責務)。
 */
export function consultantFee(category: BusinessCategory, revenue: number, yyyymm: number): number {
  if (yyyymm < CONSULTANT_FEE_APPLIED_FROM_YYYYMM) return 0;
  const rate = CONSULTANT_FEE_RATE[category] ?? 0;
  if (rate <= 0) return 0;
  if (!Number.isFinite(revenue) || revenue <= 0) return 0;
  return revenue * rate;
}
