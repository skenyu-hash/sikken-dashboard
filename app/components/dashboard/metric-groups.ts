// PR #59 c1: 5 メトリックグループ → 左 3px ボーダー色のヘルパー (案 B、簡素版)
//
// c0 検証で判明したラベル文字列不一致を回避するため、ラベル依存マッピングは廃止。
// 各 Section ファイルが Card / 行単位で GroupType を直接指定し、こちらは色変換のみ提供。

import type { GroupType } from "../ui";

export type { GroupType };

/**
 * グループ → 左 3px ボーダーの hex 色。
 * Electric/Locksmith/Road/Detective Section は inline style 100% なのでこちらを使う。
 *
 * @example
 *   <div style={{ borderLeft: `3px solid ${getGroupBorderColor("rev")}` }}>...</div>
 */
export function getGroupBorderColor(group: GroupType): string {
  return {
    rev:  "#065f46",
    cnt:  "#1e40af",
    acq:  "#854d0e",
    cost: "#831843",
    help: "#581c87",
  }[group];
}

/**
 * グループ → Tailwind 用 border class (className 側で使う場合)。
 * Tailwind v4 で動的 class が purge されないようリテラル文字列のみ返す。
 *
 * @example
 *   <tr className={`border-l-[3px] ${getGroupBorderClass("rev")}`}>...</tr>
 */
export function getGroupBorderClass(group: GroupType): string {
  return {
    rev:  "border-l-grp-rev-fg",
    cnt:  "border-l-grp-cnt-fg",
    acq:  "border-l-grp-acq-fg",
    cost: "border-l-grp-cost-fg",
    help: "border-l-grp-help-fg",
  }[group];
}
