// PR #60: SIKKEN Design System foundation — UI primitives barrel export.
//
// 後続 PR #59 (/dashboard) / #61 (/entry) / #62 (/targets) / #63 (/meeting) で利用。
// 新しい UI primitive を追加する際はこのファイルにも re-export を追加すること。

export { GroupPill, GROUP_LABELS, GROUP_METRICS, getGroupBorderColor } from "./group-pill";
export type { GroupType, GroupPillProps } from "./group-pill";

export { MetricBadge, getBadgeColor } from "./metric-badge";
export type { BadgeColor, MetricBadgeProps } from "./metric-badge";
