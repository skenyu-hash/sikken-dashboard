// PR c95-D-6 (slice 6): 水道コンサル費「自動 7.7% 計算」関連ロジックを完全撤去。
//
// 旧 c95-B-1 設計 (撤去済): CONSULTANT_FEE_RATE / consultantFee() 関数 で水道粗利から
//   売上 × 0.077 を自動控除していた。c95-D で「実額の手入力」(monthly_summaries.consultant_fee
//   / entries.data.consultant_fee) ベースに完全移行。
//
// 残存しているもの (本ファイルの存在意義):
//   - CONSULTANT_FEE_APPLIED_FROM_YYYYMM = 202605: 月境界定数。手入力ベース移行後も
//     「2026/4 以前データ絶対不変ガード」として全 5 配線 (form / aggregation / day-level /
//     read fallback / 日報 / UI バッジ) で使用。4 月以前の粗利には controle を一切適用しない
//     ことを保証する単一の真実ソース。
//   - toYyyyMm(): year/month → year*100+month 変換 helper。月境界判定に必須、軽量。
//
// 旧 export の削除履歴:
//   - CONSULTANT_FEE_RATE: 削除 (c95-D-5 で water=0 化済、c95-D-6 で完全削除)
//   - consultantFee(category, revenue, yyyymm): 削除 (呼出箇所はすべて手入力ベースへ移行済)
//
// ファイル名 (consultantFee.ts) は歴史的経緯。リネーム余地あるが、月境界定数の意味は
// 「コンサル費適用境界」のままなので残置 (再リネームは別 PR の検討事項)。

/**
 * 水道コンサル費を適用する最古の年月 (year*100+month 形式)。
 *   202605 = 2026 年 5 月。これ未満の月は controle 対象外。
 *   2026 年 4 月以前データへの遡及変動を完全回避する境界 (絶対不変項目ガード)。
 *
 * 用途 (全 7 配線で本定数を参照):
 *   - app/lib/monthlyAggregation.ts (aggregation SQL の water 分岐 applyConsult)
 *   - app/lib/profit.ts             (read fallback の water 分岐)
 *   - app/entry/hooks/useFormCalculations.ts (form-level fee 計算)
 *   - app/entry/components/dailyReport/kpiCompute.ts (日報 day-level fee 計算)
 *   - app/entry/components/dailyReport/WaterDailyReportSection.tsx (日報 UI inline 計算)
 *   - app/entry/components/forms/WaterForm.tsx (AutoCalcDisplay subtitle 表示判定)
 *   - app/components/ConsultantFeeBadge.tsx   (UI バッジ表示判定、dashboard/trends/breakeven 等)
 *
 * archive (本ファイル参照、c95-D-6 で直値 0.077 化済の旧スクリプト):
 *   - scripts/migrations/c95-b_reaggregate_water_consultant.ts (旧 c95-B 移行、apply 完了済)
 *   - scripts/migrations/c95-d-4_reaggregate_water_may2026_onward.ts (slice 4 移行、apply 完了済)
 *   - scripts/check-c95-b-reagg-preview.ts (旧 c95-B プレビュー、現状参考用)
 */
export const CONSULTANT_FEE_APPLIED_FROM_YYYYMM = 202605;

/** year/month から yyyymm 形式 (year*100 + month) を生成する小道具。 */
export function toYyyyMm(year: number, month: number): number {
  return year * 100 + month;
}
