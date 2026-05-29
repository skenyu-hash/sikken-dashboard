// PR c94-B-2: 5 業態 Section の共通 spacing 定数。
//
// 役割:
//   全 10 ファイル (Dashboard Section 5 + Meeting Section 5) + MetricRow.tsx で
//   重複している padding / margin / fontSize を中央管理。
//
// 設計判断 (Web Claude Q1=a 採用):
//   - 案 B (共通定数 + import) を採用、案 A (inline) と案 C (Card/Row 共通ヘルパー
//     抽出) は却下。案 C は AGENTS.md KNOWN_ISSUES §7 と同類の負債解消に該当する
//     が c94-B-2 スコープ超過、別 PR (c95 候補) で検討。
//
// 統一ルール (user 確定仕様):
//   - MARGIN   = 24px (セクション間)
//   - GAP      = 24px (grid 内セクション間隔)
//   - PADDING_H = 18px (テーブル左右パディング、vertical は各箇所の既存値を維持)
//   - HEADER_FONT = 13px / 700 (太字維持で印象変化最小、サイズ +2px)
//
// 注: padding は "vertical horizontal" 複合値のため、テンプレートリテラルで
//     `${V}px ${SECTION.PADDING_H}px` 形式で組み立てる (Web Claude Q3=a)。

export const SECTION = {
  MARGIN: 24,
  GAP: 24,
  PADDING_H: 18,
  HEADER_FONT_SIZE: 13,
  HEADER_FONT_WEIGHT: 700 as const,
  HEADER_COLOR: "#065f46",
} as const;
