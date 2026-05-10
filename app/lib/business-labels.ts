// SIKKEN Dashboard 業態別フィールドラベル定義
//
// 仕様書: docs/specs/spec-form-redesign.md §4 (水道フォーム31フィールド) / §5
// PR #39: 水道版を canonical として完成。他4業態は placeholder。
// PR #40 以降で 5 業態展開時に locksmith/electric/road/detective を埋める。
//
// 設計:
//   - BusinessCategory 型は lib/permissions.ts と整合
//   - getLabel() で「業態 × フィールド」のラベルを取得
//   - placeholder は getLabel() で water 版にフォールバック

import type { BusinessCategory } from "./permissions";

export type { BusinessCategory };

// 入力 20 + auto 11 = 31 フィールドのラベル定義。
// セクション見出しもここに集約 (water 版を canonical)。
export interface FieldLabels {
  // セクション見出し
  section_sales: string;
  section_costs: string;
  section_acquisition: string;
  section_construction: string;
  section_help: string;
  section_auto: string;

  // ① 新規対応 (入力 7 + auto 3)
  outsourced_sales_revenue: string;
  internal_staff_revenue: string;
  total_revenue: string; // auto
  outsourced_response_count: string;
  internal_staff_response_count: string;
  total_response_count: string; // auto
  unit_price: string; // auto
  repeat_count: string;
  revisit_count: string;
  review_count: string;

  // ② コスト (入力 4)
  total_labor_cost: string;
  material_cost: string;
  sales_outsourcing_cost: string;
  card_processing_fee: string;

  // ③ 広告費 (入力 3 + auto 3)
  ad_cost: string; // = total_ad_spend
  call_count: string; // = inquiry_count
  call_unit_price: string; // auto, = inquiry_unit_price
  acquisition_count: string;
  cpa: string; // auto
  conv_rate: string; // auto, = conversion_rate

  // ④ 施工 (入力 4 + auto 2) - 業態で語尾が変わる
  outsourced_construction_count: string;
  internal_construction_count: string;
  total_construction_count: string; // auto
  outsourced_construction_cost: string;
  internal_construction_profit: string;
  actual_construction_cost: string; // auto

  // ⑤ HELP (入力 2 + auto 1)
  help_count: string;
  help_revenue: string;
  help_unit_price: string; // auto

  // ⑥ 粗利 (auto 2)
  profit: string; // auto
  total_profit: string; // auto, 合計粗利
}

// 水道 canonical (仕様書 §4.2 に厳密一致)
const WATER_LABELS: FieldLabels = {
  section_sales: "① 新規対応",
  section_costs: "② コスト",
  section_acquisition: "③ 広告費",
  section_construction: "④ 施工",
  section_help: "⑤ HELP",
  section_auto: "⑥ 粗利・自動計算",

  outsourced_sales_revenue: "業務委託売上",
  internal_staff_revenue: "内勤社員売上",
  total_revenue: "全体売上",
  outsourced_response_count: "業務委託対応件数",
  internal_staff_response_count: "内勤社員対応件数",
  total_response_count: "合計対応件数",
  unit_price: "客単価",
  repeat_count: "リピート件数",
  revisit_count: "再訪問件数",
  review_count: "口コミ件数",

  total_labor_cost: "職人費（外注＋自社施工）",
  material_cost: "材料費",
  sales_outsourcing_cost: "営業外注費（業務委託費）",
  card_processing_fee: "カード決済手数料",

  ad_cost: "総広告費",
  call_count: "入電件数",
  call_unit_price: "入電単価",
  acquisition_count: "獲得件数",
  cpa: "獲得単価（CPA）",
  conv_rate: "成約率",

  outsourced_construction_count: "外注工事件数",
  internal_construction_count: "自社工事件数",
  total_construction_count: "総工事件数",
  outsourced_construction_cost: "外注工事費",
  internal_construction_profit: "自社工事利益",
  actual_construction_cost: "実質工事コスト",

  help_count: "HELP件数",
  help_revenue: "HELP売上",
  help_unit_price: "HELP単価",

  profit: "粗利",
  total_profit: "合計粗利",
};

// PR #40 で完成予定の placeholder。
// 仕様書 §5.3 に従い、④施工セクションのみ語尾が業態別 (工事/出動/調査)。
// 現状は water_LABELS をそのまま流用 (語尾は PR #40 で差替)。
export const BUSINESS_LABELS: Record<BusinessCategory, FieldLabels> = {
  water: WATER_LABELS,
  electric: WATER_LABELS, // TODO PR #40: 5業態展開時に固有ラベル
  locksmith: WATER_LABELS, // TODO PR #40
  road: WATER_LABELS, // TODO PR #40: 工事 → 出動
  detective: WATER_LABELS, // TODO PR #40: 工事 → 調査
};

/**
 * 業態 × フィールド名 から表示ラベルを取得。
 * 業態が未定義の場合は water (canonical) にフォールバック。
 */
export function getLabel(
  category: BusinessCategory,
  field: keyof FieldLabels
): string {
  return BUSINESS_LABELS[category]?.[field] ?? WATER_LABELS[field];
}
