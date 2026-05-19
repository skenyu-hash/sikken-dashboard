import type { ReactNode } from "react";

export type BadgeColor = "red" | "green" | "yellow" | "gray";

/**
 * 達成率から表示色を決定する。
 *
 * 判定ルール:
 *   null / undefined → gray (未設定)
 *   < 80%            → red (未達)
 *   80-99%           → yellow (惜しい)
 *   ≥ 100%           → green (達成)
 *
 * @example
 *   getBadgeColor(42.2);  // 'red'
 *   getBadgeColor(85);    // 'yellow'
 *   getBadgeColor(139.3); // 'green'
 *   getBadgeColor(null);  // 'gray'
 */
export function getBadgeColor(achievementPct: number | null | undefined): BadgeColor {
  if (achievementPct === null || achievementPct === undefined) return "gray";
  if (achievementPct >= 100) return "green";
  if (achievementPct >= 80) return "yellow";
  return "red";
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
 *     {metric.achievement?.toFixed(1)}%
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
