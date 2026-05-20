import type { ReactNode } from "react";

export type BadgeColor = "red" | "green" | "yellow" | "gray";

/** 達成率の方向性。
 *  - "higher_is_better": 売上 / 粗利 / 件数 / 客単価 等。actual が target を上回るほど良い。
 *  - "lower_is_better" : 広告費 / CPA / 入電単価 / 各種コスト等。actual が target を下回るほど良い。
 *  PR c87: getBadgeColor / formatAchievement の invert 引数として渡す。
 */
export type AchievementDirection = "higher_is_better" | "lower_is_better";

/** PR c87: getBadgeColor が受け付ける任意オプション。
 *  invert=true は lower_is_better セマンティクス (cost 系) を意味する。 */
export type BadgeOptions = { invert?: boolean };

/**
 * 達成率から表示色を決定する。
 *
 * 判定ルール (higher_is_better、デフォルト):
 *   null / undefined → gray (未設定)
 *   < 0              → red  (PR c87: 赤字、formatAchievement と組で "未達" 表示)
 *   < 80%            → red  (未達)
 *   80-99%           → yellow (惜しい)
 *   ≥ 100%           → green (達成)
 *
 * 判定ルール (lower_is_better, invert=true、PR c87 で追加):
 *   null / undefined → gray
 *   ≤ 100%           → green (cost が target 以下、節約)
 *   ≤ 120%           → yellow (cost ギリギリ超過)
 *   > 120%           → red   (大幅超過)
 *   < 0 は cost で通常起こらないが、defensive で green 扱い
 *
 * @example
 *   getBadgeColor(42.2);                       // 'red'   — 未達
 *   getBadgeColor(85);                         // 'yellow'— 惜しい
 *   getBadgeColor(139.3);                      // 'green' — 達成
 *   getBadgeColor(-83.2);                      // 'red'   — 赤字 (PR c87)
 *   getBadgeColor(110, { invert: true });      // 'yellow'— cost ギリギリ超過 (PR c87)
 *   getBadgeColor(95, { invert: true });       // 'green' — cost 節約 (PR c87)
 *   getBadgeColor(null);                       // 'gray'  — 未設定
 */
export function getBadgeColor(
  achievementPct: number | null | undefined,
  opts?: BadgeOptions,
): BadgeColor {
  if (achievementPct === null || achievementPct === undefined) return "gray";
  if (opts?.invert) {
    // lower_is_better: target 以下が良い、超過するほど悪い (3 区分)
    if (achievementPct < 0) return "green"; // defensive: 通常 cost は非負
    if (achievementPct <= 100) return "green";
    if (achievementPct <= 120) return "yellow";
    return "red";
  }
  // higher_is_better: 達成率が高いほど良い (3 区分 + 負値=赤字)
  if (achievementPct < 0) return "red";
  if (achievementPct >= 100) return "green";
  if (achievementPct >= 80) return "yellow";
  return "red";
}

/**
 * 達成率の表示文字列を生成する (PR c87 で追加)。
 *
 * - null / undefined → "—"        (未設定)
 * - < 0 (higher_is_better のみ)  → "未達"  (赤字、数値非表示で混乱回避)
 * - それ以外                      → "X.X%" (小数 1 桁)
 *
 * **getBadgeColor と必ず同じ pct / opts を渡す**こと。
 * 両者の semantic (negative→red + "未達" 等) は drift しないよう binding する設計。
 *
 * @example
 *   formatAchievement(95.5);                   // '95.5%'
 *   formatAchievement(-83.2);                  // '未達'  (PR c87)
 *   formatAchievement(110, { invert: true });  // '110.0%'  (cost 系は数値そのまま、color が yellow/red を伝える)
 *   formatAchievement(null);                   // '—'
 */
export function formatAchievement(
  achievementPct: number | null | undefined,
  opts?: BadgeOptions,
): string {
  if (achievementPct === null || achievementPct === undefined) return "—";
  // 負値: higher_is_better では赤字 → "未達" 表示で UX 改善 (本番フィードバック)
  // lower_is_better では負の cost は意味を持たないため通常通り数値表示 (defensive)
  if (!opts?.invert && achievementPct < 0) return "未達";
  return `${achievementPct.toFixed(1)}%`;
}

const BADGE_CLASSES: Record<BadgeColor, string> = {
  red:    "bg-badge-red-bg text-badge-red-fg",
  green:  "bg-badge-green-bg text-badge-green-fg",
  yellow: "bg-badge-yellow-bg text-badge-yellow-fg",
  gray:   "bg-badge-gray-bg text-badge-gray-fg",
};

export interface MetricBadgeProps {
  color: BadgeColor;
  children: ReactNode;
  /** 50px 最低幅で揃える (default: true) */
  minWidth?: boolean;
}

/**
 * 達成率バッジ。
 *
 * @example
 *   <MetricBadge color="red">42.2%</MetricBadge>
 *   <MetricBadge color={getBadgeColor(metric.achievement)}>
 *     {formatAchievement(metric.achievement)}
 *   </MetricBadge>
 */
export function MetricBadge({ color, children, minWidth = true }: MetricBadgeProps) {
  return (
    <span
      className={`inline-block text-center px-2 py-0.5 text-[10px] font-medium rounded leading-normal whitespace-nowrap ${
        minWidth ? "min-w-[50px]" : ""
      } ${BADGE_CLASSES[color]}`}
    >
      {children}
    </span>
  );
}
