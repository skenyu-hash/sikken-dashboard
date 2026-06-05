// c96-1: テーマ色定数 (中央集約)。
//
// 経緯: 旧プロジェクトは tailwind.config.* / globals.css の CSS 変数を持たず、色は inline style で
//   10+ ファイルにハードコード散在していた (例: #1B5E3F が AutoCalcDisplay / DailyReportContent /
//   NavBar / MobileHeader / ConsultantFeeBadge 等で個別記載)。
//   c96-1 で /daily-report 2 軸拡張に伴い大量の新規 UI を追加するため、本ファイルに色を集約。
//
// 適用範囲 (c96-1 着手時点):
//   - c96-1 以降に追加 / 改修する UI コンポーネントは本ファイル参照を必須
//   - 既存 inline ハードコードはそのまま残置 (touch すると差分が膨張、別 PR で順次置換)
//
// 出典: CLAUDE.md §4.5 デザイン基準 (Phase 7.5 確立) + 反さん確定値 (c96-1 2026-06-05)。
//   c96-1 で新規追加: 業態別アクセント色 (水道=青 / 電気=橙 / 鍵=紫 / ロード=朱 / 探偵=緑)。
//   既存テーマと整合する色相を選び、彩度はミュート寄り (Phase 7.5 装飾色とロジック色の分離原則)。

import type { BusinessCategory } from "./businesses";

/** ブランド緑 (アクセント、アクティブ状態、ヘッダーロゴ、フォーカス枠など)。 */
export const COLOR_BRAND_DARK = "#1B5E3F"; // 深緑、アクセント
export const COLOR_BRAND_MID = "#2E8B62";  // 中緑、フィルター帯 / モーダルヘッダー
export const COLOR_BRAND_LIGHT_BG = "#ecfdf5"; // ブランド薄背景 (バッジ薄背景等)
export const COLOR_BRAND_LIGHT_BORDER = "#d1fae5"; // ブランド薄ボーダー

/** 機能色 (ロジックを表す、装飾とは分離原則 / Phase 7.5)。 */
export const COLOR_HEALTHY = "#059669";  // 健全グリーン (正の指標)
export const COLOR_CAUTION = "#D97706";  // 注意オレンジ (注意指標)
export const COLOR_DANGER = "#DC2626";   // 警戒レッド (異常 / 閾値超過)
export const COLOR_INFO = "#3B82F6";     // BEP 用ブルー (情報・損益分岐)

/** ニュートラル (テキスト / 罫線 / 背景)。 */
export const COLOR_TEXT_PRIMARY = "#111827";   // 黒テキスト
export const COLOR_TEXT_SECONDARY = "#6B7280"; // セカンダリーグレー
export const COLOR_BORDER_LIGHT = "#E5E7EB";   // 薄ボーダー
export const COLOR_BG_BAR = "#F3F4F6";         // バー背景
export const COLOR_BG_CARD_LIGHT = "#FAFAFA";  // カード薄背景

/** 業態別アクセント色 (c96-1 で追加、/daily-report 事業別タブ / 一覧モードでの業態識別用)。
 *  反さん指示: 水=青 / 電=橙 / 鍵=紫 / ロード=朱 / 探偵=緑。
 *  Tailwind 標準色相を流用し、500 番台で統一 (彩度ミュート、装飾色)。 */
export const BUSINESS_ACCENT_COLOR: Record<BusinessCategory, string> = {
  water:     "#3B82F6", // 青 (Tailwind blue-500 相当)
  electric:  "#F97316", // 橙 (Tailwind orange-500 相当)
  locksmith: "#8B5CF6", // 紫 (Tailwind violet-500 相当)
  road:      "#EF4444", // 朱 (Tailwind red-500 相当)
  detective: "#10B981", // 緑 (Tailwind emerald-500 相当、ブランド緑と分離するため emerald 採用)
};

/** 業態別アクセント色の薄背景版 (バッジ / セクション背景に使用)。 */
export const BUSINESS_ACCENT_LIGHT_BG: Record<BusinessCategory, string> = {
  water:     "#EFF6FF", // blue-50
  electric:  "#FFF7ED", // orange-50
  locksmith: "#F5F3FF", // violet-50
  road:      "#FEF2F2", // red-50
  detective: "#ECFDF5", // emerald-50
};
