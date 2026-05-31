"use client";
// PR c95-A-3: DailyReportModal 共通プリミティブ (Panel / Row / TaiseiPanel)。
// モック docs/mocks/daily_report_kansai_0530.html の class .panel / .t / .taisei に忠実。
//
// 設計:
//   - Panel: 白カード + 緑帯ヘッダー (n: 番号バッジ色)、fill prop で col flex 高さ揃え
//   - Row: 3 列固定 (label / sub? / value)、sub なら中央列に売上比%、なければ value が右寄せ
//   - HighlightRow: 緑背景 + 太字 (自動計算ハイライト = .hl)
//   - CostRow: Row with sub (売上比%) — モック ① 職人費等の 3 列
//   - AutoRow: 軽量補助 (= .auto、薄字ラベルだが value は強調)
//   - TaiseiPanel: ⑥ 体制 専用 2 セルパネル (車両数 / 研修生)

import type { ReactNode } from "react";

export type GroupNumColor = "n1" | "n2" | "n3" | "n4" | "n6";
const NUM_COLORS: Record<GroupNumColor, string> = {
  n1: "#3d8bd4", n2: "#d96a8b", n3: "#d9a23b", n4: "#2f9e6e", n6: "#2f9e6e",
};

const SUB_STYLE: React.CSSProperties = {
  textAlign: "right", color: "#7d8f88", fontWeight: 500, fontSize: 11.5, padding: "8px 16px",
};
const SUB_STYLE_GREEN: React.CSSProperties = {
  textAlign: "right", color: "#0e6b4f", fontWeight: 600, fontSize: 11.5, padding: "8px 16px",
};

// Panel 外装
export function Panel({
  num, title, color, tag, fill, children,
}: {
  num?: string; title: string; color?: GroupNumColor; tag?: string; fill?: boolean; children: ReactNode;
}) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e0e8e4", borderRadius: 12, overflow: "hidden",
      display: fill ? "flex" : undefined,
      flexDirection: fill ? "column" : undefined,
      height: fill ? "100%" : undefined,
    }}>
      <div style={{
        background: "#f4f9f7", borderBottom: "1px solid #e8f1ed",
        padding: "11px 16px", fontWeight: 700, fontSize: 13.5, color: "#2a3d36",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {num && color && (
          <span style={{
            width: 21, height: 21, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, color: "#fff", background: NUM_COLORS[color],
          }}>{num}</span>
        )}
        <span>{title}</span>
        {tag && <span style={{ marginLeft: "auto", fontSize: 11, color: "#8a9c95", fontWeight: 500 }}>{tag}</span>}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, flex: fill ? 1 : undefined }}>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// 標準行 (2 列または 3 列、sub あれば中央に売上比%)
export function Row({
  label, value, sub, highlight,
}: {
  label: string; value: string; sub?: string; highlight?: boolean;
}) {
  const tdBase: React.CSSProperties = {
    padding: "8px 16px", borderBottom: "1px solid #f1f5f3", whiteSpace: "nowrap",
  };
  const trStyle: React.CSSProperties = highlight ? { background: "#f0f8f4" } : {};
  const labelStyle: React.CSSProperties = {
    ...tdBase, color: highlight ? "#0e6b4f" : "#46554e", fontWeight: highlight ? 700 : undefined,
  };
  const valueStyle: React.CSSProperties = {
    ...tdBase, textAlign: "right",
    fontWeight: 700, fontVariantNumeric: "tabular-nums",
    color: highlight ? "#0e6b4f" : "#1c2b25",
  };
  return (
    <tr style={trStyle}>
      <td style={labelStyle}>{label}</td>
      {sub !== undefined ? <td style={SUB_STYLE}>{sub}</td> : <td style={tdBase} />}
      <td style={valueStyle}>{value}</td>
    </tr>
  );
}

// ハイライト粗利行 (緑文字 sub = 粗利率%、value 緑強調)
export function HighlightProfitRow({
  label, profitRate, value,
}: {
  label: string; profitRate: string; value: string;
}) {
  return (
    <tr style={{ background: "#f0f8f4" }}>
      <td style={{
        padding: "8px 16px", borderBottom: "1px solid #f1f5f3",
        color: "#0e6b4f", fontWeight: 700,
      }}>{label}</td>
      <td style={SUB_STYLE_GREEN}>{profitRate}</td>
      <td style={{
        padding: "8px 16px", borderBottom: "1px solid #f1f5f3",
        textAlign: "right", color: "#0e6b4f", fontWeight: 700, fontVariantNumeric: "tabular-nums",
      }}>{value}</td>
    </tr>
  );
}

// ⑥ 体制パネル (2 セル: 車両数 / 研修生)
export function TaiseiPanel({ vehicleCount, traineeCount }: { vehicleCount: number; traineeCount: number }) {
  return (
    <Panel num="⑥" title="体制" color="n6" tag="スナップショット">
      <tr>
        <td colSpan={3} style={{ padding: 0, border: "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ padding: "14px 16px", textAlign: "center", borderRight: "1px solid #f1f5f3" }}>
              <div style={{ fontSize: 12, color: "#7d8f88", marginBottom: 5 }}>車両数</div>
              <div style={{ fontSize: 21, fontWeight: 700, color: "#0e6b4f" }}>{vehicleCount}台</div>
            </div>
            <div style={{ padding: "14px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#7d8f88", marginBottom: 5 }}>研修生</div>
              <div style={{ fontSize: 21, fontWeight: 700, color: "#0e6b4f" }}>{traineeCount}名</div>
            </div>
          </div>
        </td>
      </tr>
    </Panel>
  );
}

// formatters (モック準拠の表記)
export const yen = (n: number): string => `¥${Math.round(n).toLocaleString("ja-JP")}`;
export const cnt = (n: number): string => `${Math.round(n).toLocaleString("ja-JP")}件`;
export const pct = (n: number | null): string => (n === null ? "—" : `${(Math.round(n * 10) / 10).toFixed(1)}%`);
