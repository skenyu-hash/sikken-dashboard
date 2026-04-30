// CSV/XLSX 出力時の列定義と丸めポリシー。
// 丸め方針（Phase 9.2）:
//   - 金額（円・万円）: Math.round で整数化
//   - 率（%）: 小数第2位四捨五入
//   - 件数: そのまま整数
//   - 文字列: 触らない
// matrix-cells のセル値（plMan/cfMan/displayVal）は UI 側 [matrix/page.tsx:196] が
// Math.round で整数表示しているため、CSV/XLSX も整数で揃える（intMan）。

export type RoundType = "intYen" | "intMan" | "pct2" | "intCount" | "raw";

export type ColumnDef = {
  key: string;        // データオブジェクトのキー
  label: string;      // ヘッダー（日本語、単位明記）
  roundType: RoundType;
};

export function applyRound(value: unknown, type: RoundType): number | string {
  if (value === null || value === undefined || value === "") return "";
  if (type === "raw") return String(value);
  const n = Number(value);
  if (!isFinite(n)) return "";
  switch (type) {
    case "intYen":
    case "intMan":
    case "intCount":
      return Math.round(n);
    case "pct2":
      return Math.round(n * 100) / 100;
  }
}

// #1 monthly-summary
export const MONTHLY_SUMMARY_COLUMNS: ColumnDef[] = [
  { key: "year",              label: "年",            roundType: "intCount" },
  { key: "month",             label: "月",            roundType: "intCount" },
  { key: "area_id",           label: "エリアID",      roundType: "raw" },
  { key: "area_name",         label: "エリア",        roundType: "raw" },
  { key: "business_category", label: "業態ID",        roundType: "raw" },
  { key: "business_label",    label: "業態",          roundType: "raw" },
  { key: "total_revenue",     label: "総売上(円)",    roundType: "intYen" },
  { key: "total_profit",      label: "総粗利(円)",    roundType: "intYen" },
  { key: "total_count",       label: "総件数",        roundType: "intCount" },
  { key: "unit_price",        label: "客単価(円)",    roundType: "intYen" },
  { key: "ad_cost",           label: "広告費(円)",    roundType: "intYen" },
  { key: "cpa",               label: "CPA(円)",       roundType: "intYen" },
  { key: "call_count",        label: "受電数",        roundType: "intCount" },
  { key: "acquisition_count", label: "獲得数",        roundType: "intCount" },
  { key: "ad_rate",           label: "広告費率(%)",   roundType: "pct2" },
  { key: "conv_rate",         label: "成約率(%)",     roundType: "pct2" },
  { key: "profit_rate",       label: "粗利率(%)",     roundType: "pct2" },
  { key: "help_revenue",      label: "ヘルプ売上(円)", roundType: "intYen" },
  { key: "help_count",        label: "ヘルプ件数",     roundType: "intCount" },
  { key: "help_unit_price",   label: "ヘルプ客単価(円)", roundType: "intYen" },
  { key: "vehicle_count",     label: "車両数",        roundType: "intCount" },
  { key: "created_at",        label: "登録日時",      roundType: "raw" },
];

// #2 daily-entries（フラット展開 + RAW列）
export const DAILY_ENTRIES_COLUMNS: ColumnDef[] = [
  { key: "entry_date",        label: "日付",          roundType: "raw" },
  { key: "area_id",           label: "エリアID",      roundType: "raw" },
  { key: "area_name",         label: "エリア",        roundType: "raw" },
  { key: "business_category", label: "業態ID",        roundType: "raw" },
  { key: "business_label",    label: "業態",          roundType: "raw" },
  { key: "totalCount",        label: "全体件数",       roundType: "intCount" },
  { key: "constructionCount", label: "工事件数(10万以上)", roundType: "intCount" },
  { key: "selfRevenue",       label: "自社施工売上(円)", roundType: "intYen" },
  { key: "selfProfit",        label: "自社施工利益(円)", roundType: "intYen" },
  { key: "selfCount",         label: "自社施工件数",   roundType: "intCount" },
  { key: "newRevenue",        label: "新規営業売上(円)", roundType: "intYen" },
  { key: "newMaterial",       label: "新規営業材料費(円)", roundType: "intYen" },
  { key: "newLabor",          label: "新規営業職人費(円)", roundType: "intYen" },
  { key: "newCount",          label: "新規営業件数",   roundType: "intCount" },
  { key: "addRevenue",        label: "追加売上(円)",   roundType: "intYen" },
  { key: "addMaterial",       label: "追加材料費(円)", roundType: "intYen" },
  { key: "addLabor",          label: "追加職人費(円)", roundType: "intYen" },
  { key: "addCount",          label: "追加/ヘルプ件数", roundType: "intCount" },
  { key: "insourceCount",     label: "内製対応件数",   roundType: "intCount" },
  { key: "outsourceCount",    label: "外注対応件数",   roundType: "intCount" },
  { key: "reviewCount",       label: "口コミ件数",     roundType: "intCount" },
  { key: "helpRevenue",       label: "HELP売上(円)",   roundType: "intYen" },
  { key: "helpCount",         label: "HELP件数",       roundType: "intCount" },
  { key: "adCost",            label: "広告費(円)",     roundType: "intYen" },
  { key: "laborCost",         label: "職人費(全体・円)", roundType: "intYen" },
  { key: "materialCost",      label: "材料費(全体・円)", roundType: "intYen" },
  { key: "outsourceCost",     label: "営業外注費(円)", roundType: "intYen" },
  { key: "vehicleCount",      label: "車両数",         roundType: "intCount" },
  { key: "data_raw",          label: "data_raw(JSON)", roundType: "raw" },
  { key: "updated_at",        label: "更新日時",       roundType: "raw" },
];

// #3 matrix-cells のセル値マッピング
// 行は salesMan + 各列の cells[].displayVal を 万円整数で展開する
export const MATRIX_CELL_DISPLAY_ROUND: RoundType = "intMan";
export const MATRIX_ROW_HEADER_LABEL = "売上(万)";
