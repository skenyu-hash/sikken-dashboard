// SIKKEN Dashboard 新フォーム (/entry) 型定義
//
// 仕様書: docs/specs/spec-form-redesign.md §4.2 (水道フォーム31フィールド)
//
// 構造:
//   入力 20 個 + auto 11 個 = 31 フィールド (仕様書通り)
//   - total_revenue / total_response_count は auto 計算 (入力ではない)
//   - vehicle_count は仕様書31フィールド外のため除外

import type { BusinessCategory } from "../lib/business-labels";

/** 入力フィールドの値型: 空文字 (入力中) または数値 */
export type InputValue = number | "";

/**
 * フォームの入力フィールド (20個) + メタ (4個) = 24 状態。
 * auto 計算項目 (total_revenue / total_response_count / unit_price 等) は
 * useFormCalculations が EntryFormState から導出するためここには含めない。
 */
export interface EntryFormState {
  // メタ
  area_id: string;
  year: number;
  month: number;
  // day: 月内の何日時点のスナップショットか (1-31)。
  // 既存 as_of_day 運用と統合: handleSave 時に as_of_day としてそのまま送信。
  day: number;
  category: BusinessCategory;

  // ① 新規対応 (入力 7)
  outsourced_sales_revenue: InputValue; // f2
  internal_staff_revenue: InputValue; // f3
  outsourced_response_count: InputValue; // f5
  internal_staff_response_count: InputValue; // f6
  repeat_count: InputValue; // f8
  revisit_count: InputValue; // f9
  review_count: InputValue; // f10

  // ② コスト (入力 4)
  total_labor_cost: InputValue; // f11
  material_cost: InputValue; // f12
  sales_outsourcing_cost: InputValue; // f13
  card_processing_fee: InputValue; // f14

  // ③ 広告費 (入力 3)
  ad_cost: InputValue; // f15 (= total_ad_spend、DB は ad_cost)
  call_count: InputValue; // f16 (= inquiry_count、DB は call_count)
  acquisition_count: InputValue; // f18

  // ④ 施工 (入力 4)
  outsourced_construction_count: InputValue; // f22
  internal_construction_count: InputValue; // f23
  outsourced_construction_cost: InputValue; // f24
  internal_construction_profit: InputValue; // f25

  // ⑤ HELP (入力 2)
  help_count: InputValue; // f27
  help_revenue: InputValue; // f28
}

/**
 * useFormCalculations が返す auto 計算項目 (11 個)。
 * 仕様書 §4.2 / §4.3 に厳密一致。
 */
export interface AutoCalcResult {
  // ① auto (3)
  total_revenue: number; // f1 = f2 + f3
  total_response_count: number; // f4 = f5 + f6
  unit_price: number; // f7 = f1 / f4

  // ③ auto (3)
  call_unit_price: number; // f17 = f15 / f16 (DB: call_unit_price、UI: 入電単価)
  cpa: number; // f19 = f15 / f18
  conv_rate: number; // f20 = f18 / f16 * 100 (DB: conv_rate、UI: 成約率)

  // ④ auto (2)
  total_construction_count: number; // f21 = f22 + f23
  actual_construction_cost: number; // f26 = f24 - f25

  // ⑤ auto (1)
  help_unit_price: number; // f29 = f28 / f27

  // ⑥ auto (2)
  profit: number; // f30 = f1 - f12 - f11 - f15 - f13 - f14
  total_profit: number; // f31 = f30 + f25 (DB: total_profit)
}

/** フィールドごとのバリデーションエラー (undefined はエラーなし) */
export type ValidationErrors = Partial<Record<keyof EntryFormState, string>>;

/** 入力フィールドのキー (バリデーション・onBlur 用) */
export type InputFieldKey = Exclude<keyof EntryFormState, "area_id" | "year" | "month" | "category">;
