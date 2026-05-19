import type { ReactNode } from "react";

/**
 * 5 メトリックグループの識別子
 * - rev: ① 収益 (売上 / 客単価 / 粗利)
 * - cnt: ② 件数 (合計 / 工事 / 対応率 / 車両数)
 * - acq: ③ 集客 (広告費 / 入電 / 獲得 / CPA / 成約率)
 * - cost: ④ コスト (職人費 / 材料費 / 営業外注費)
 * - help: ⑤ HELP (HELP売上 / HELP客単価 / HELP件数)
 */
export type GroupType = "rev" | "cnt" | "acq" | "cost" | "help";

export const GROUP_LABELS: Record<GroupType, string> = {
  rev:  "① 収益",
  cnt:  "② 件数",
  acq:  "③ 集客",
  cost: "④ コスト",
  help: "⑤ HELP",
};

/**
 * 業態共通の標準項目 (水道 canonical)。
 * 各業態 Section ファイルは自身の業態固有項目をこのリストとは別に持つ。
 */
export const GROUP_METRICS: Record<GroupType, string[]> = {
  rev:  ["売上", "客単価", "粗利"],
  cnt:  ["合計件数", "工事件数", "対応率", "車両数"],
  acq:  ["広告費", "入電件数", "入電単価", "獲得件数", "CPA", "成約率"],
  cost: ["職人費", "材料費", "営業外注費"],
  help: ["HELP売上", "HELP客単価", "HELP件数"],
};

const GROUP_CLASSES: Record<GroupType, string> = {
  rev:  "bg-grp-rev-bg text-grp-rev-fg",
  cnt:  "bg-grp-cnt-bg text-grp-cnt-fg",
  acq:  "bg-grp-acq-bg text-grp-acq-fg",
  cost: "bg-grp-cost-bg text-grp-cost-fg",
  help: "bg-grp-help-bg text-grp-help-fg",
};

const GROUP_BORDER_COLORS: Record<GroupType, string> = {
  rev:  "#065f46",
  cnt:  "#1e40af",
  acq:  "#854d0e",
  cost: "#831843",
  help: "#581c87",
};

export interface GroupPillProps {
  type: GroupType;
  children?: ReactNode;
}

/**
 * グループラベルピル (色付きラベル)。
 *
 * @example
 *   <GroupPill type="rev" />                          // 「① 収益」を緑で表示
 *   <GroupPill type="rev">① 収益 (3項目)</GroupPill>   // children でカスタム
 */
export function GroupPill({ type, children }: GroupPillProps) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 text-[11px] font-medium rounded ${GROUP_CLASSES[type]}`}
    >
      {children ?? GROUP_LABELS[type]}
    </span>
  );
}

/**
 * グループの左ボーダー色を取得 (テーブル行の左 3px ボーダーに使用)。
 *
 * @example
 *   <td style={{ borderLeft: `3px solid ${getGroupBorderColor("rev")}` }}>...</td>
 */
export function getGroupBorderColor(type: GroupType): string {
  return GROUP_BORDER_COLORS[type];
}
