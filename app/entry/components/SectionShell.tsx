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
//
// PR #61 c5: アコーディオン化。
//   - count?: number で pill 右隣に「N 項目」薄灰表示 (省略時は非表示)
//   - defaultOpen?: boolean (default false) で初期開閉状態を制御
//   - ヘッダクリックで toggle (useState 管理)、▼/▲ chevron 表示
//   - children は isOpen の時のみ描画 (DOM 軽量化 + 検索性)
//   - アニメーション (CSS transition) は本 PR 範囲外 (後続 polish PR)

import React, { useState } from "react";
import { getGroupBorderColor, type GroupType } from "../../components/dashboard/metric-groups";
import { GroupPill } from "../../components/ui";

type Props = {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
  /** PR #61 c1: 未指定なら従来の灰縁、指定時は最外左辺を 3px グループ色に */
  group?: GroupType;
  /** PR #61 c5: ヘッダの pill 右隣に「N 項目」薄灰表示。省略時は非表示 */
  count?: number;
  /** PR #61 c5: 初期開閉状態。各 Form の第 1 section のみ true 推奨 */
  defaultOpen?: boolean;
};

export default function SectionShell({ title, subtitle, group, count, defaultOpen = false, children }: Props) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);
  return (
    <div style={{
      background: "#fff",
      borderRadius: 10,
      border: "1px solid #d1fae5",
      ...(group && { borderLeft: `3px solid ${getGroupBorderColor(group)}` }),
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    }}>
      {/* PR #61 c5: ヘッダを <button> 化、クリックで isOpen toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        style={{
          width: "100%",
          background: "#fff",
          padding: "8px 14px",
          borderTop: "none",
          borderRight: "none",
          borderLeft: "none",
          borderBottom: isOpen ? "1px solid #e5e7eb" : "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          font: "inherit",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* PR #61 c3: group 指定時は GroupPill ラップ、未指定時は素のテキスト */}
          {group ? (
            <GroupPill type={group}>{title}</GroupPill>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#065f46", letterSpacing: "0.04em" }}>
              {title}
            </span>
          )}
          {count !== undefined && (
            <span style={{ fontSize: 10, color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
              {count} 項目
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {subtitle && (
            <span style={{ fontSize: 10, color: "#6b7280" }}>{subtitle}</span>
          )}
          <span style={{ fontSize: 12, color: "#6b7280", lineHeight: 1 }} aria-hidden>
            {isOpen ? "▲" : "▼"}
          </span>
        </div>
      </button>
      {isOpen && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  );
}
