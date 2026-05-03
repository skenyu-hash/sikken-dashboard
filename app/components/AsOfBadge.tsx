"use client";
// 「データは○月○日時点」を表示する共通バッジ。
// monthly_summaries.as_of_day を表示する。複数エリア集計時は min/max を
// 算出し、min ≠ max なら「混在」として範囲表示する。

import React from "react";

type Props = {
  asOfDays: number[];
  month: number;
  style?: React.CSSProperties;
};

export default function AsOfBadge({ asOfDays, month, style }: Props) {
  const valid = asOfDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31);
  if (valid.length === 0) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const label =
    min === max
      ? `データは${month}月${min}日時点`
      : `データは${month}月${min}〜${max}日時点（混在）`;
  return (
    <span
      style={{
        display: "inline-block",
        opacity: 0.7,
        fontSize: 12,
        padding: "4px 8px",
        borderRadius: 4,
        background: "rgba(0,0,0,0.05)",
        color: "#374151",
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </span>
  );
}
