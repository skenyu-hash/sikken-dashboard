"use client";
// ⑥ 粗利・自動計算 サマリ: profit / total_profit を強調表示。
// 各セクションで使う AutoRow / fmt 関数もここから export。

import type { AutoCalcResult } from "../types";
import type { FieldLabels } from "../../lib/business-labels";
import SectionShell from "./SectionShell";

export const fmtYen = (v: number): string => {
  if (!Number.isFinite(v) || v === 0) return "¥0";
  return `¥${Math.round(v).toLocaleString("ja-JP")}`;
};
export const fmtCount = (v: number): string => `${Math.round(v).toLocaleString("ja-JP")}件`;
export const fmtPct = (v: number): string => `${(Math.round(v * 10) / 10).toFixed(1)}%`;

// PR #61 c4: 自動計算行を灰系に振り、入力 (白) との視覚差別化を明確化。
//   - bg #f0fdf4 (薄緑) → #f9fafb (mockup .mic-input.auto 準拠の薄灰)
//   - border dashed #d1fae5 → #e5e7eb (薄灰 dashed)
//   - 値の色 #059669 (深緑) → #6b7280 (中灰、可読性確保のため #9ca3af より濃く)
//   - font-size 22 / font-weight 700 は維持 (存在感確保、縮小は c5 で再検討)
//   - DOM 構造・props インターフェース不変 (c5 のアコーディオン化と衝突回避)
export function AutoRow({ label, value, formula }: { label: string; value: string; formula: string }) {
  return (
    <div style={{
      marginTop: 10, padding: "8px 12px",
      background: "#f9fafb", borderRadius: 6, border: "1px dashed #e5e7eb",
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
    }}>
      <div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>{label}</span>
        <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 8 }}>(自動計算 {formula})</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#6b7280" }}>{value}</span>
    </div>
  );
}

type Props = {
  calc: AutoCalcResult;
  labels: FieldLabels;
};

export default function AutoCalcDisplay({ calc, labels }: Props) {
  return (
    <SectionShell title={labels.section_auto} subtitle="自動計算 2項目（仕上げの粗利指標）" group="rev" count={2}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <SummaryCard label={labels.profit} value={fmtYen(calc.profit)} variant={calc.profit < 0 ? "danger" : "ok"}
          subtitle="売上 − 材料 − 職人 − 広告 − 営業外注 − カード" />
        <SummaryCard label={labels.total_profit} value={fmtYen(calc.total_profit)} variant={calc.total_profit < 0 ? "danger" : "ok"}
          subtitle="粗利 + 自社工事利益（内製化ボーナス）" />
      </div>
    </SectionShell>
  );
}

function SummaryCard({ label, value, subtitle, variant }: {
  label: string; value: string; subtitle: string; variant: "ok" | "danger";
}) {
  const accentColor = variant === "danger" ? "#dc2626" : "#1B5E3F";
  const bgColor = variant === "danger" ? "#fef2f2" : "#ecfdf5";
  const borderColor = variant === "danger" ? "#fecaca" : "#d1fae5";
  return (
    <div style={{
      padding: "14px 16px",
      background: bgColor,
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      borderLeft: `4px solid ${accentColor}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accentColor, lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>{subtitle}</div>
    </div>
  );
}
