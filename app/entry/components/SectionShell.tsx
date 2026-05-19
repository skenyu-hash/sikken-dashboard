"use client";
// セクション共通の見た目シェル (見出し付きカード)。
//
// PR #61 c1: v9 グループ色の左 3px ボーダー対応。
//   group prop は optional — 未指定時は従来の灰縁 (1px solid #d1fae5) のまま (回帰なし)。
//   指定時は左辺のみ 3px のグループ色に上書き (PR #59 c1 と同じ意味伝達パターン)。
//
// PR #61 c3: section title を <GroupPill> ラップで group color tint バッジ化。
//   ヘッダ背景は薄緑バー (#ecfdf5) から白に変更 → 全 group の pill が視認可能に。
//   group 未指定時は素のテキスト (回帰なし)。

import React from "react";
import { getGroupBorderColor, type GroupType } from "../../components/dashboard/metric-groups";
import { GroupPill } from "../../components/ui";

type Props = {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
  /** PR #61 c1: 未指定なら従来の灰縁、指定時は最外左辺を 3px グループ色に */
  group?: GroupType;
};

export default function SectionShell({ title, subtitle, group, children }: Props) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 10,
      border: "1px solid #d1fae5",
      ...(group && { borderLeft: `3px solid ${getGroupBorderColor(group)}` }),
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        // PR #61 c3: ヘッダ背景を白に変更、ボーダー色は neutral gray に → 全 group の pill が視認可能
        background: "#fff",
        padding: "8px 14px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        {/* PR #61 c3: group 指定時は GroupPill ラップ、未指定時は素のテキスト (回帰なし) */}
        {group ? (
          <GroupPill type={group}>{title}</GroupPill>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: "#065f46", letterSpacing: "0.04em" }}>
            {title}
          </span>
        )}
        {subtitle && (
          <span style={{ fontSize: 10, color: "#6b7280" }}>{subtitle}</span>
        )}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
