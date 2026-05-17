"use client";
// PR #55: /meeting ページ用の共有 UI 部品。
//
// 元々 app/meeting/page.tsx に inline 定義されていた MetricRow / SectionTable
// および calc 補助関数を、業態別 MeetingSection から再利用するために共有化。
//
// 設計 (PR #51-54 の MeetingSection から import):
//   - MetricRow: 1 行 = 5 列 (指標 / 実績 / 着地予測 / 達成率 / 目標差 / 1日の目安)
//   - SectionTable: 行群を包む card-style ラッパー (緑系アクセント)
//   - calc 補助関数: 着地予測 / 達成率 / 目標差 / 1日の目安 を厳密にロジック分離
//
// 着地予測ロジック:
//   isRate=true なら landing = actual (率系は projection しない)
//   それ以外: landing = round(actual / elapsed * dim)
//
// invertGap=true は「低いほど良い」コスト系メトリクスの評価軸反転
// (例: 広告費は target を超えると "超過" 赤、target 以下なら "節約" 緑)

import React from "react";

// ===== calc 補助関数 (export して MeetingSection からも使用可) =====

export function calcLanding(actual: number, elapsed: number, dim: number): number {
  if (elapsed <= 0 || actual <= 0) return 0;
  return Math.round(actual / elapsed * dim);
}

export function calcAchievement(landing: number, target: number): number | null {
  if (target <= 0 || landing <= 0) return null;
  return Math.round(landing / target * 1000) / 10;
}

export function calcGap(landing: number, target: number): number | null {
  if (target <= 0) return null;
  return landing - target;
}

export function calcDaily(target: number, dim: number): number {
  if (target <= 0 || dim <= 0) return 0;
  return Math.round(target / dim);
}

// ===== 型 =====

/** /meeting 各業態セクションで共通の表示パラメータ (period から導出される定数群) */
export type MeetingPeriodProps = {
  isEndPeriod: boolean;   // period === "end" (= 月次レビュー)
  daysElapsed: number;    // 10 / 20 / daysInMonth
  daysInMonth: number;    // 当該月の日数
};

// ===== MetricRow =====

type MetricRowProps = MeetingPeriodProps & {
  label: string;
  actual: number;
  target: number;
  format: (v: number) => string;
  isRate?: boolean;        // %値・客単価などの率系。着地予測しない
  invertGap?: boolean;     // コスト系。値が低いほど良い (達成評価軸を反転)
};

export function MetricRow({
  label, actual, target, isEndPeriod, daysElapsed, daysInMonth,
  format, isRate = false, invertGap = false,
}: MetricRowProps) {
  const landing = isRate ? actual : calcLanding(actual, daysElapsed, daysInMonth);
  const compareVal = isEndPeriod ? actual : landing;
  const achievement = calcAchievement(compareVal, target);
  const gap = calcGap(compareVal, target);
  const daily = calcDaily(target, daysInMonth);

  const achBg = achievement === null ? "#f3f4f6"
    : achievement >= 100 ? "#d1fae5"
    : achievement >= 80 ? "#fef9c3" : "#fee2e2";
  const achColor = achievement === null ? "#d1d5db"
    : achievement >= 100 ? "#065f46"
    : achievement >= 80 ? "#854d0e" : "#991b1b";
  const gapPositive = invertGap ? (gap !== null && gap <= 0) : (gap !== null && gap >= 0);

  const td: React.CSSProperties = {
    padding: "9px 10px", fontSize: 12, textAlign: "right",
    color: "#374151", borderBottom: "1px solid #f0faf0",
  };

  return (
    <tr>
      <td style={{
        ...td, textAlign: "left", fontWeight: 600, fontSize: 13,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{label}</td>
      <td style={{ ...td, fontWeight: 700, color: "#111" }}>{format(actual)}</td>
      <td style={{ ...td, color: "#059669", fontWeight: 700 }}>
        {isEndPeriod || isRate ? "—" : format(landing)}
      </td>
      <td style={td}>
        {achievement !== null ? (
          <span style={{
            display: "inline-block", fontSize: 11, fontWeight: 700,
            borderRadius: 4, padding: "2px 8px",
            background: achBg, color: achColor,
          }}>{achievement.toFixed(1)}%</span>
        ) : <span style={{ color: "#d1d5db", fontSize: 11 }}>未設定</span>}
      </td>
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        {gap === null ? <span style={{ color: "#d1d5db", fontSize: 11 }}>{"—"}</span> : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: gapPositive ? "#059669" : "#dc2626" }}>
                {gap >= 0 ? "+" : "−"}{format(Math.abs(gap))}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600, borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                background: gapPositive ? "#d1fae5" : "#fee2e2",
                color: gapPositive ? "#065f46" : "#991b1b",
              }}>{gapPositive ? "超過" : "不足"}</span>
            </span>
            {target > 0 && (
              <span style={{
                fontSize: 10, color: "#6b7280", fontWeight: 500,
                borderTop: "1px dashed #e5e7eb", paddingTop: 3,
                whiteSpace: "nowrap", textAlign: "right",
              }}>🎯 目標: {format(target)}</span>
            )}
          </div>
        )}
      </td>
      <td style={td}>
        {daily > 0 && !isRate ? (
          <span style={{ color: "#d97706", fontWeight: 700, fontSize: 12 }}>{format(daily)}</span>
        ) : <span style={{ color: "#d1d5db", fontSize: 11 }}>{"—"}</span>}
      </td>
    </tr>
  );
}

// ===== SectionTable =====

export function SectionTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 10,
      border: "1px solid #d1fae5", overflow: "hidden",
    }}>
      <div style={{
        background: "#ecfdf5", padding: "8px 14px", borderBottom: "1px solid #d1fae5",
        fontSize: 11, fontWeight: 700, color: "#065f46",
        textTransform: "uppercase", letterSpacing: "0.07em",
      }}>{title}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 520 }}>
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#ecfdf5" }}>
              {["指標", "実績", "着地予測", "見込み", "目標差", "1日の目安"].map((h, i) => (
                <th key={h} style={{
                  padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#6b7280",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                  borderBottom: "1px solid #d1fae5",
                  textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

// ===== format 補助 (再利用) =====

export const fmtYen = (v: number): string => {
  if (!Number.isFinite(v) || v === 0) return "¥0";
  return `¥${Math.round(v).toLocaleString("ja-JP")}`;
};
export const fmtCount = (v: number): string => `${Math.round(v).toLocaleString("ja-JP")}件`;
export const fmtPct = (v: number): string => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
