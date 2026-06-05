"use client";
// PR c97-2: 未読バッジ表示コンポーネント (LINE 型: 赤丸 + 白文字)。
//
// 仕様 (反さん確定):
//   - count=0 → null (バッジ非表示)
//   - 1-99 → そのまま数字
//   - 100+ → "99+" (cap)
//   - 色: bg #DC2626 / fg #fff
//
// 利用: NavBar / MobileHeader の「日報」label の右上に absolute 配置。
//   親要素 (li / a 等) に position: relative を付ける必要あり (本コンポーネント内では指定しない)。

import { COLOR_DANGER } from "../lib/theme";

/** count → 表示文字列。0 のときは null (非表示)、1-99 そのまま、100+ で "99+" cap。 */
export function formatBadgeCount(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  if (count > 99) return "99+";
  return String(Math.floor(count));
}

type Props = {
  count: number;
  /** 配置位置の微調整 (デフォルト: 右上、top -6px / right -10px) */
  style?: React.CSSProperties;
  /** ARIA ラベル (デフォルト: 「未読 N 件」) */
  ariaLabel?: string;
};

export default function UnreadBadge({ count, style, ariaLabel }: Props) {
  const label = formatBadgeCount(count);
  if (label === null) return null;
  return (
    <span
      aria-label={ariaLabel ?? `未読 ${count} 件`}
      style={{
        position: "absolute",
        top: -6,
        right: -10,
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        background: COLOR_DANGER, // #DC2626
        color: "#fff",
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 700,
        lineHeight: "18px",
        textAlign: "center",
        boxSizing: "border-box",
        pointerEvents: "none",
        ...style,
      }}
    >
      {label}
    </span>
  );
}
