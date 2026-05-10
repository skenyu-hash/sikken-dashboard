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

export function AutoRow({ label, value, formula }: { label: string; value: string; formula: string }) {
  return (
    <div style={{
      marginTop: 10, padding: "8px 12px",
      background: "#f0fdf4", borderRadius: 6, border: "1px dashed #d1fae5",
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
    }}>
      <div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46" }}>{label}</span>
        <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 8 }}>(自動計算 {formula})</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>{value}</span>
    </div>
  );
}

type Props = {
  calc: AutoCalcResult;
  labels: FieldLabels;
};

export default function AutoCalcDisplay({ calc, labels }: Props) {
  return (
    <SectionShell title={labels.section_auto} subtitle="自動計算 2項目（仕上げの粗利指標）">
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
