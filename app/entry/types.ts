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

  // ④ 施工 (入力 4) — PR c93-2 で UI 入力フィールド構成を再構成
  //   新規入力: construction_count (対応ベース、10万円以上の工事1件)
  //   意味変更: internal_construction_count = 会社内製化分のみ (営業マン自施工は除く)
  //   UI 撤去: outsourced_construction_count は state には残置 (常に ""、後方互換)、
  //            ただし NumberField としては表示しない。旧 5月既存 entries の値は
  //            entries.data に保存され続け、aggregation の fallback chain で参照される。
  construction_count: InputValue; // 新規: 工事件数 (対応ベース)
  outsourced_construction_count: InputValue; // f22 (UI 撤去、state 残置のみ)
  internal_construction_count: InputValue; // f23 (意味変更: 会社内製化分)
  outsourced_construction_cost: InputValue; // f24
  internal_construction_profit: InputValue; // f25

  // ⑤ HELP (入力 2)
  help_count: InputValue; // f27
  help_revenue: InputValue; // f28

  // PR #48b: 電気業態専用 (他業態では常に "" → 保存時 0)
  switchboard_count: InputValue;

  // PR #51: 鍵業態専用 (他業態では常に "" → 保存時 0)
  //   獲得 4 内訳: 5 番目の HELP は state.help_count を再利用
  locksmith_car_lp_email_count: InputValue;
  locksmith_inhouse_count: InputValue;
  locksmith_repeat_count: InputValue;
  locksmith_revisit_count: InputValue;
  //   コスト 2 項目: 旧 total_labor_cost / sales_outsourcing_cost 流用から専用カラムへ
  locksmith_construction_cost: InputValue;
  locksmith_commission_fee: InputValue;

  // PR #52: ロード業態専用 獲得 7 チャネル (他業態では常に "" → 保存時 0)
  //   入電 7 内訳 / 保険売上 / 無保険売上 / 販管費は引き続き UI only
  //   コストは既存 ad_cost / sales_outsourcing_cost を流用 (calc.profit 互換)
  road_ad_count: InputValue;
  road_repeat_count: InputValue;
  road_referral_count: InputValue;
  road_revisit_count: InputValue;
  road_wellnest_count: InputValue;
  road_seo_count: InputValue;
  road_insurance_count: InputValue;

  // PR #53: 探偵業態専用 面談ファネル (他業態では常に "" → 保存時 0)
  //   面談数 + 面談事前キャンセル数 を DB 化 (案 C 採用)
  //   獲得 6 内訳 / 販管費は引き続き UI only (Phase B 後続候補)
  detective_meeting_count: InputValue;
  detective_cancel_count: InputValue;

  // PR #57: 探偵業態 入電 4 内訳 (Phase B 残課題、案 A 完結)
  //   電のみ / メールのみ / LINEのみ / 誤入電
  //   合計は call_count に DetectiveForm 内で sync
  detective_phone_only_call_count: InputValue;
  detective_mail_only_call_count: InputValue;
  detective_line_only_call_count: InputValue;
  detective_wrong_call_count: InputValue;

  // PR #58b: 探偵業態 獲得 6 内訳 + 販管費 (Phase B 残課題、案 A)
  //   獲得 6: 電話×浮気 / 電話×その他 / メール×浮気 / メール×その他 / LINE×浮気 / LINE×その他
  //   合計は acquisition_count に DetectiveForm 内で sync
  //   販管費: 円単位、営業利益式は変更なし (sales - adCost のまま、記録のみ)
  detective_phone_uwaki_acquisition_count: InputValue;
  detective_phone_other_acquisition_count: InputValue;
  detective_mail_uwaki_acquisition_count: InputValue;
  detective_mail_other_acquisition_count: InputValue;
  detective_line_uwaki_acquisition_count: InputValue;
  detective_line_other_acquisition_count: InputValue;
  detective_selling_admin_cost: InputValue;

  // PR #58c: ロード業態 入電 7 内訳 + 保険売上 2 分割 + 販管費 (Phase B 完結、PR #58b 同型)
  //
  // 注意: road_*_count = 獲得件数 (PR #52)、road_*_call_count = 入電件数 (本 PR、PR #58c)
  // 特に保険関連の 3 列は概念が異なるので注意:
  //   road_insurance_count       = 保険会社経由の獲得件数 (既存、PR #52)
  //   road_insurance_call_count  = 保険会社経由の入電件数 (新規、本 PR)
  //   road_insurance_revenue     = 保険業務由来の売上 (新規、本 PR、保険でカバーされる業務)
  //
  //   入電 7 内訳の合計は call_count に RoadForm 内で sync
  //   保険売上 + 無保険売上 = total_revenue は強制しない (splitMismatch warning のみ、記録優先)
  //   販管費: 円単位、営業利益式は変更なし (sales - adCost - sales_outsourcing_cost のまま、記録のみ)
  road_ad_call_count: InputValue;
  road_repeat_call_count: InputValue;
  road_referral_call_count: InputValue;
  road_revisit_call_count: InputValue;
  road_wellnest_call_count: InputValue;
  road_seo_call_count: InputValue;
  road_insurance_call_count: InputValue;
  road_insurance_revenue: InputValue;
  road_non_insurance_revenue: InputValue;
  road_selling_admin_cost: InputValue;

  // PR c94-C: ⑥ 体制 (スナップショット、MAX 集計)。全業態共通。
  //   車両数 (台) / 研修生・営業マン (人)。entries.data に snake_case で保存。
  vehicle_count: InputValue;
  trainee_count: InputValue;
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

  // ④ auto (1) — PR c93-2 で 2 → 1 縮減
  //   旧 f21 (総工事件数 = outsourced + internal sum) は対応ベース construction_count に
  //   置換、auto 不要。旧 f26 (実質工事コスト = outsourced_cost - internal_profit) も廃止。
  //   新: internal_construction_ratio = 内製化件数 / 工事件数 × 100 (自社工事比率)
  internal_construction_ratio: number;

  // ⑤ auto (1)
  help_unit_price: number; // f29 = f28 / f27

  // ⑥ auto (1) — PR c93-1 で 2 → 1 に縮減
  //   旧: profit (f30) + total_profit (f31 = f30 + f25)
  //   新: profit (f30) のみ。合計粗利 (f31) は内製化ボーナス加算で二重計上だったため廃止。
  //   monthly_summaries.total_profit カラムは保持し、aggregation で f30 相当を格納する
  //   (DB スキーマ不変、計算式のみ変更)。
  profit: number; // f30 = f1 - f12 - f11 - f15 - f13 - f14
}

/** フィールドごとのバリデーションエラー (undefined はエラーなし) */
export type ValidationErrors = Partial<Record<keyof EntryFormState, string>>;

/** 入力フィールドのキー (バリデーション・onBlur 用) */
export type InputFieldKey = Exclude<keyof EntryFormState, "area_id" | "year" | "month" | "category">;
