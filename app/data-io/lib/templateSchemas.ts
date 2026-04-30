// Phase 9.2.2 入力テンプレートの列定義とサンプルデータ。
// PR-A の columnMappings.ts (DAILY_ENTRIES_COLUMNS / MONTHLY_SUMMARY_COLUMNS) と
// 列名・順序が完全互換になるよう設計（PR-C のエクスポート再アップロード可能性のため）。

import type { BusinessCategory } from "../../lib/businesses";

export type TemplateColumn = {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
  readonly?: boolean; // PR-C のバリデータが取込時にスキップする列
};

export type TemplateKind = "monthly" | "daily";
export type TemplateVariant = "blank" | "sample";

// ヘッダー直下に出力する注釈行の固定テキスト。
// PR-C の取込バリデータは、この文字列で始まる行を注釈とみなして読み飛ばす想定。
// 詳細は KNOWN_ISSUES.md セクション 4 を参照。
export const TEMPLATE_ANNOTATION_ROW_TEXT =
  "* = 必須項目です。空欄のまま保存しないでください";

// =====================================================================
// 月次テンプレート列定義
//   識別 3 (year/month/area_id) + 派生 2 (area_name/business_label)
//   + 必須 7 (business_category/total_revenue/total_profit/total_count
//            /ad_cost/ad_rate/profit_rate)
//   + 任意 9 (unit_price/cpa/call_count/acquisition_count/conv_rate
//            /help_revenue/help_count/help_unit_price/vehicle_count)
//   = 21 列（call_unit_price は PR-A 互換のため除外）
// =====================================================================
export const MONTHLY_TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "year",              label: "年 *",          required: true,  hint: "西暦4桁。例: 2026" },
  { key: "month",             label: "月 *",          required: true,  hint: "1〜12" },
  { key: "area_id",           label: "エリアID *",     required: true,  hint: "kansai/kanto/nagoya/kyushu/kitakanto/hokkaido/chugoku/shizuoka" },
  { key: "area_name",         label: "エリア",         required: false, hint: "（任意・取込時に自動補完）" },
  { key: "business_category", label: "業態ID *",       required: true,  hint: "water/electric/locksmith/road/detective" },
  { key: "business_label",    label: "業態",           required: false, hint: "（任意・取込時に自動補完）" },
  { key: "total_revenue",     label: "総売上(円) *",   required: true },
  { key: "total_profit",      label: "総粗利(円) *",   required: true },
  { key: "total_count",       label: "総件数 *",       required: true },
  { key: "unit_price",        label: "客単価(円)",     required: false, hint: "総売上÷総件数で算出可" },
  { key: "ad_cost",           label: "広告費(円) *",   required: true },
  { key: "cpa",               label: "CPA(円)",        required: false, hint: "広告費÷獲得数で算出可" },
  { key: "call_count",        label: "受電数",         required: false },
  { key: "acquisition_count", label: "獲得数",         required: false },
  { key: "ad_rate",           label: "広告費率(%) *",  required: true },
  { key: "conv_rate",         label: "成約率(%)",      required: false },
  { key: "profit_rate",       label: "粗利率(%) *",    required: true },
  { key: "help_revenue",      label: "ヘルプ売上(円)", required: false },
  { key: "help_count",        label: "ヘルプ件数",     required: false },
  { key: "help_unit_price",   label: "ヘルプ客単価(円)", required: false },
  { key: "vehicle_count",     label: "車両数",         required: false },
];

// =====================================================================
// 日次テンプレート列定義
//   識別 2 (entry_date/area_id)
//   + 必須 13 (DailyEntry の strict required - date を除く)
//   + 任意 10 (DailyEntry の Phase 1 拡張)
//   + 派生 3 (area_name/business_category/business_label)
//   + readonly 2 (data_raw/updated_at)
//   = 30 列
// =====================================================================
export const DAILY_TEMPLATE_COLUMNS: TemplateColumn[] = [
  // 識別 2列
  { key: "entry_date",        label: "日付 *",                required: true,  hint: "YYYY-MM-DD" },
  { key: "area_id",           label: "エリアID *",            required: true,  hint: "kansai/kanto/..." },
  // 派生 3列（business_category は入力必須だが、area_name / business_label と並べて識別系として配置）
  { key: "area_name",         label: "エリア",                required: false, hint: "（任意・取込時に自動補完）" },
  { key: "business_category", label: "業態ID *",              required: true,  hint: "water/electric/locksmith/road/detective" },
  { key: "business_label",    label: "業態",                  required: false, hint: "（任意・取込時に自動補完）" },
  // 必須 13列（DailyEntry の strict required）
  { key: "totalCount",        label: "全体件数 *",            required: true },
  { key: "constructionCount", label: "工事件数(10万以上) *",   required: true },
  { key: "selfRevenue",       label: "自社施工売上(円) *",     required: true },
  { key: "selfProfit",        label: "自社施工利益(円) *",     required: true },
  { key: "selfCount",         label: "自社施工件数 *",         required: true },
  { key: "newRevenue",        label: "新規営業売上(円) *",     required: true },
  { key: "newMaterial",       label: "新規営業材料費(円) *",   required: true },
  { key: "newLabor",          label: "新規営業職人費(円) *",   required: true },
  { key: "newCount",          label: "新規営業件数 *",         required: true },
  { key: "addRevenue",        label: "追加売上(円) *",         required: true },
  { key: "addMaterial",       label: "追加材料費(円) *",       required: true },
  { key: "addLabor",          label: "追加職人費(円) *",       required: true },
  { key: "addCount",          label: "追加/ヘルプ件数 *",      required: true },
  // 任意 10列（DailyEntry の Phase 1 拡張）
  { key: "insourceCount",     label: "内製対応件数",          required: false },
  { key: "outsourceCount",    label: "外注対応件数",          required: false },
  { key: "reviewCount",       label: "口コミ件数",            required: false },
  { key: "helpRevenue",       label: "HELP売上(円)",          required: false },
  { key: "helpCount",         label: "HELP件数",              required: false },
  { key: "adCost",            label: "広告費(円)",            required: false },
  { key: "laborCost",         label: "職人費(全体・円)",      required: false },
  { key: "materialCost",      label: "材料費(全体・円)",      required: false },
  { key: "outsourceCost",     label: "営業外注費(円)",        required: false },
  { key: "vehicleCount",      label: "車両数",                required: false },
  // readonly 2列（取込時無視）
  { key: "data_raw",          label: "data_raw(JSON)",        required: false, readonly: true, hint: "（取込時無視）" },
  { key: "updated_at",        label: "更新日時",              required: false, readonly: true, hint: "（取込時無視）" },
];

// =====================================================================
// サンプルデータ生成
// =====================================================================

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// 月次サンプル: 関西×水道 / 関東×電気 / 関西×探偵 の3行（直近月）
export function buildMonthlySamples(
  referenceDate: Date = new Date()
): Array<Record<string, unknown>> {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth() + 1;
  return [
    {
      year: y, month: m,
      area_id: "kansai", area_name: "関西",
      business_category: "water", business_label: "水道",
      total_revenue: 30_500_000, total_profit: 8_000_000, total_count: 152,
      unit_price: 200_658, ad_cost: 6_800_000, cpa: 44_737,
      call_count: 3_380, acquisition_count: 152,
      ad_rate: 22.30, conv_rate: 4.50, profit_rate: 26.20,
      help_revenue: 0, help_count: 0, help_unit_price: 0,
      vehicle_count: 8,
    },
    {
      year: y, month: m,
      area_id: "kanto", area_name: "関東",
      business_category: "electric", business_label: "電気",
      total_revenue: 8_200_000, total_profit: 2_300_000, total_count: 38,
      unit_price: 215_789, ad_cost: 1_900_000, cpa: 50_000,
      call_count: 820, acquisition_count: 38,
      ad_rate: 23.17, conv_rate: 4.63, profit_rate: 28.05,
      help_revenue: 0, help_count: 0, help_unit_price: 0,
      vehicle_count: 2,
    },
    {
      year: y, month: m,
      area_id: "kansai", area_name: "関西",
      business_category: "detective", business_label: "探偵",
      total_revenue: 1_200_000, total_profit: 420_000, total_count: 5,
      unit_price: 240_000, ad_cost: 540_000, cpa: 108_000,
      call_count: 92, acquisition_count: 5,
      ad_rate: 45.00, conv_rate: 5.43, profit_rate: 35.00,
      help_revenue: 0, help_count: 0, help_unit_price: 0,
      vehicle_count: 0,
    },
  ];
}

// 業態別の代表エリア（サンプル生成用）
const SAMPLE_AREA: Record<BusinessCategory, { id: string; name: string }> = {
  water:     { id: "kansai", name: "関西" },
  electric:  { id: "kanto",  name: "関東" },
  locksmith: { id: "kansai", name: "関西" },
  road:      { id: "kansai", name: "関西" },
  detective: { id: "kansai", name: "関西" },
};

const BIZ_LABEL: Record<BusinessCategory, string> = {
  water: "水道",
  electric: "電気",
  locksmith: "鍵",
  road: "ロード",
  detective: "探偵",
};

// 日次サンプル: 業態別×3日分（month-01, month-05, month-10）。
// 桁数は経営層からの業界感ガイド（水道30〜80万/日、電気20〜50万/日、
// 鍵5〜15万/日、ロード3〜10万/日、探偵10〜50万/日）に基づく推測値。
// Kenyu さんが後日違和感ある数字を補正する前提。
export function buildDailySamples(
  category: BusinessCategory,
  referenceDate: Date = new Date()
): Array<Record<string, unknown>> {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth() + 1;
  const dateOf = (day: number) => `${y}-${pad(m)}-${pad(day)}`;
  const area = SAMPLE_AREA[category];
  const head = (day: number) => ({
    entry_date: dateOf(day),
    area_id: area.id,
    area_name: area.name,
    business_category: category,
    business_label: BIZ_LABEL[category],
  });

  switch (category) {
    case "water":
      return [
        {
          ...head(1),
          totalCount: 12, constructionCount: 2,
          selfRevenue: 380_000, selfProfit: 145_000, selfCount: 3,
          newRevenue: 210_000, newMaterial: 38_000, newLabor: 28_000, newCount: 5,
          addRevenue: 120_000, addMaterial: 20_000, addLabor: 15_000, addCount: 4,
          insourceCount: 7, outsourceCount: 5, reviewCount: 2,
          helpRevenue: 0, helpCount: 0,
          adCost: 110_000, laborCost: 145_000, materialCost: 80_000, outsourceCost: 25_000,
          vehicleCount: 2,
        },
        {
          ...head(5),
          totalCount: 15, constructionCount: 3,
          selfRevenue: 420_000, selfProfit: 165_000, selfCount: 3,
          newRevenue: 240_000, newMaterial: 45_000, newLabor: 35_000, newCount: 6,
          addRevenue: 130_000, addMaterial: 22_000, addLabor: 18_000, addCount: 6,
          insourceCount: 9, outsourceCount: 6, reviewCount: 3,
          helpRevenue: 0, helpCount: 0,
          adCost: 125_000, laborCost: 165_000, materialCost: 95_000, outsourceCost: 30_000,
          vehicleCount: 2,
        },
        {
          ...head(10),
          totalCount: 10, constructionCount: 1,
          selfRevenue: 320_000, selfProfit: 120_000, selfCount: 2,
          newRevenue: 170_000, newMaterial: 32_000, newLabor: 25_000, newCount: 4,
          addRevenue: 100_000, addMaterial: 17_000, addLabor: 13_000, addCount: 4,
          insourceCount: 6, outsourceCount: 4, reviewCount: 1,
          helpRevenue: 0, helpCount: 0,
          adCost: 95_000, laborCost: 130_000, materialCost: 70_000, outsourceCost: 22_000,
          vehicleCount: 2,
        },
      ];
    case "electric":
      return [
        {
          ...head(1),
          totalCount: 5, constructionCount: 1,
          selfRevenue: 170_000, selfProfit: 60_000, selfCount: 1,
          newRevenue: 100_000, newMaterial: 18_000, newLabor: 14_000, newCount: 2,
          addRevenue: 50_000, addMaterial: 8_000, addLabor: 6_000, addCount: 2,
          insourceCount: 3, outsourceCount: 2, reviewCount: 1,
          helpRevenue: 0, helpCount: 0,
          adCost: 75_000, laborCost: 70_000, materialCost: 35_000, outsourceCost: 12_000,
          vehicleCount: 1,
        },
        {
          ...head(5),
          totalCount: 7, constructionCount: 2,
          selfRevenue: 250_000, selfProfit: 90_000, selfCount: 2,
          newRevenue: 130_000, newMaterial: 25_000, newLabor: 18_000, newCount: 3,
          addRevenue: 60_000, addMaterial: 10_000, addLabor: 8_000, addCount: 2,
          insourceCount: 4, outsourceCount: 3, reviewCount: 1,
          helpRevenue: 0, helpCount: 0,
          adCost: 100_000, laborCost: 90_000, materialCost: 50_000, outsourceCost: 18_000,
          vehicleCount: 1,
        },
        {
          ...head(10),
          totalCount: 4, constructionCount: 0,
          selfRevenue: 140_000, selfProfit: 48_000, selfCount: 1,
          newRevenue: 80_000, newMaterial: 14_000, newLabor: 11_000, newCount: 2,
          addRevenue: 40_000, addMaterial: 7_000, addLabor: 5_000, addCount: 1,
          insourceCount: 2, outsourceCount: 2, reviewCount: 0,
          helpRevenue: 0, helpCount: 0,
          adCost: 60_000, laborCost: 60_000, materialCost: 28_000, outsourceCost: 10_000,
          vehicleCount: 1,
        },
      ];
    case "locksmith":
      return [
        {
          ...head(1),
          totalCount: 4, constructionCount: 0,
          selfRevenue: 30_000, selfProfit: 12_000, selfCount: 1,
          newRevenue: 30_000, newMaterial: 5_000, newLabor: 4_000, newCount: 2,
          addRevenue: 20_000, addMaterial: 3_000, addLabor: 2_000, addCount: 1,
          insourceCount: 3, outsourceCount: 1, reviewCount: 0,
          helpRevenue: 0, helpCount: 0,
          adCost: 35_000, laborCost: 18_000, materialCost: 8_000, outsourceCost: 4_000,
          vehicleCount: 0,
        },
        {
          ...head(5),
          totalCount: 6, constructionCount: 0,
          selfRevenue: 50_000, selfProfit: 20_000, selfCount: 2,
          newRevenue: 40_000, newMaterial: 7_000, newLabor: 5_000, newCount: 3,
          addRevenue: 30_000, addMaterial: 5_000, addLabor: 3_000, addCount: 1,
          insourceCount: 4, outsourceCount: 2, reviewCount: 1,
          helpRevenue: 0, helpCount: 0,
          adCost: 55_000, laborCost: 28_000, materialCost: 12_000, outsourceCost: 6_000,
          vehicleCount: 0,
        },
        {
          ...head(10),
          totalCount: 3, constructionCount: 0,
          selfRevenue: 25_000, selfProfit: 10_000, selfCount: 1,
          newRevenue: 20_000, newMaterial: 4_000, newLabor: 3_000, newCount: 1,
          addRevenue: 15_000, addMaterial: 2_500, addLabor: 1_500, addCount: 1,
          insourceCount: 2, outsourceCount: 1, reviewCount: 0,
          helpRevenue: 0, helpCount: 0,
          adCost: 27_000, laborCost: 14_000, materialCost: 6_500, outsourceCost: 3_000,
          vehicleCount: 0,
        },
      ];
    case "road":
      return [
        {
          ...head(1),
          totalCount: 3, constructionCount: 0,
          selfRevenue: 20_000, selfProfit: 8_000, selfCount: 1,
          newRevenue: 15_000, newMaterial: 0, newLabor: 0, newCount: 1,
          addRevenue: 15_000, addMaterial: 0, addLabor: 0, addCount: 1,
          insourceCount: 2, outsourceCount: 1, reviewCount: 0,
          helpRevenue: 0, helpCount: 0,
          adCost: 22_000, laborCost: 0, materialCost: 0, outsourceCost: 8_000,
          vehicleCount: 1,
        },
        {
          ...head(5),
          totalCount: 4, constructionCount: 0,
          selfRevenue: 30_000, selfProfit: 12_000, selfCount: 1,
          newRevenue: 25_000, newMaterial: 0, newLabor: 0, newCount: 2,
          addRevenue: 25_000, addMaterial: 0, addLabor: 0, addCount: 1,
          insourceCount: 3, outsourceCount: 1, reviewCount: 0,
          helpRevenue: 0, helpCount: 0,
          adCost: 35_000, laborCost: 0, materialCost: 0, outsourceCost: 12_000,
          vehicleCount: 1,
        },
        {
          ...head(10),
          totalCount: 2, constructionCount: 0,
          selfRevenue: 15_000, selfProfit: 6_000, selfCount: 1,
          newRevenue: 12_000, newMaterial: 0, newLabor: 0, newCount: 1,
          addRevenue: 13_000, addMaterial: 0, addLabor: 0, addCount: 0,
          insourceCount: 1, outsourceCount: 1, reviewCount: 0,
          helpRevenue: 0, helpCount: 0,
          adCost: 18_000, laborCost: 0, materialCost: 0, outsourceCost: 6_000,
          vehicleCount: 1,
        },
      ];
    case "detective":
      return [
        {
          ...head(1),
          totalCount: 1, constructionCount: 0,
          selfRevenue: 0, selfProfit: 0, selfCount: 0,
          newRevenue: 150_000, newMaterial: 0, newLabor: 60_000, newCount: 1,
          addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
          insourceCount: 1, outsourceCount: 0, reviewCount: 0,
          helpRevenue: 0, helpCount: 0,
          adCost: 65_000, laborCost: 60_000, materialCost: 0, outsourceCost: 0,
          vehicleCount: 0,
        },
        {
          ...head(5),
          totalCount: 2, constructionCount: 1,
          selfRevenue: 100_000, selfProfit: 35_000, selfCount: 1,
          newRevenue: 200_000, newMaterial: 0, newLabor: 80_000, newCount: 1,
          addRevenue: 50_000, addMaterial: 0, addLabor: 0, addCount: 0,
          insourceCount: 2, outsourceCount: 0, reviewCount: 0,
          helpRevenue: 0, helpCount: 0,
          adCost: 155_000, laborCost: 80_000, materialCost: 0, outsourceCost: 0,
          vehicleCount: 0,
        },
        {
          ...head(10),
          totalCount: 1, constructionCount: 0,
          selfRevenue: 0, selfProfit: 0, selfCount: 0,
          newRevenue: 120_000, newMaterial: 0, newLabor: 50_000, newCount: 1,
          addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
          insourceCount: 1, outsourceCount: 0, reviewCount: 0,
          helpRevenue: 0, helpCount: 0,
          adCost: 55_000, laborCost: 50_000, materialCost: 0, outsourceCost: 0,
          vehicleCount: 0,
        },
      ];
  }
}

// =====================================================================
// 統合関数
// =====================================================================

export function buildTemplateRows(
  kind: TemplateKind,
  variant: TemplateVariant,
  category?: BusinessCategory,
  referenceDate: Date = new Date()
): {
  columns: TemplateColumn[];
  rows: Array<Record<string, unknown>>;
  annotation: string;
} {
  const columns =
    kind === "monthly" ? MONTHLY_TEMPLATE_COLUMNS : DAILY_TEMPLATE_COLUMNS;
  if (variant === "blank") {
    return { columns, rows: [], annotation: TEMPLATE_ANNOTATION_ROW_TEXT };
  }
  const rows =
    kind === "monthly"
      ? buildMonthlySamples(referenceDate)
      : buildDailySamples(category ?? "water", referenceDate);
  return { columns, rows, annotation: TEMPLATE_ANNOTATION_ROW_TEXT };
}

export function buildTemplateFilename(
  kind: TemplateKind,
  variant: TemplateVariant,
  fmt: "csv" | "xlsx",
  category?: BusinessCategory,
  referenceDate: Date = new Date()
): string {
  const ymd = `${referenceDate.getFullYear()}${pad(referenceDate.getMonth() + 1)}${pad(referenceDate.getDate())}`;
  const hm = `${pad(referenceDate.getHours())}${pad(referenceDate.getMinutes())}`;
  const catSuffix =
    kind === "daily" && variant === "sample" && category ? `_${category}` : "";
  return `sikken_template_${kind}_${variant}${catSuffix}_${ymd}_${hm}.${fmt}`;
}
