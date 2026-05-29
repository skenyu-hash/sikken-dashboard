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
//
// PR c87: invertGap を達成率 badge にも適用 (旧 PR では gap 列のみだった)。
//   従来 PC table の achBg/achColor は invertGap を見ておらず、CPA 110% が
//   green になる semantic 逆転バグがあった。本 PR で getBadgeColor の invert
//   オプションに直結させ、formatAchievement で負値時は "未達" 表示。
//   gap 列のロジック (gapPositive / 余裕・不足) は変更なし — 既存挙動完全保持。
//
// PR #74: /meeting mobile v9 化。
//   - SectionTable に group / count / defaultOpen prop 追加
//   - PC は常時展開 (一覧性優先、会議中の頻繁参照画面)
//   - Mobile はアコーディオン (第 1 のみ初期 open)
//   - DOM 振り分け: PC は <table> (hide-mobile)、Mobile は <MobileMetricCard> 群 (show-mobile)
//   - 各 Section の <MetricRow> 呼び出しは無変更 (SectionTable 内で cloneElement / props 取り出し)
//   - calc 関数群 (calcLanding/calcAchievement/calcGap/calcDaily) は MetricRow と同じものを
//     MobileMetricCard 内でも流用 (集計ロジック不変原則)

import React, { useState } from "react";
import { getGroupBorderColor, type GroupType } from "../../components/dashboard/metric-groups";
import { GroupPill, getBadgeColor, formatAchievement, type BadgeColor } from "../../components/ui";
import { SECTION } from "../../components/sectionStyles";

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

// PR c87: BadgeColor → inline 用 bg / fg 色マップ。
//   PC table の達成率セルは旧来から inline span (列幅 / sizing 厳密管理) を採用
//   しているため、共通 <MetricBadge> コンポーネントは使わず、配色だけ
//   getBadgeColor (共通 helper) と semantic を揃える。
//   旧コード: 直接 #d1fae5 / #fee2e2 等を 3 段階で書き分けていた (invert 未対応)
//   新コード: getBadgeColor → BadgeColor → tuple → CSS 色 で 1 ホップ介在
const ACH_BG_MAP: Record<BadgeColor, string> = {
  gray:   "#f3f4f6",
  green:  "#d1fae5",
  yellow: "#fef9c3",
  red:    "#fee2e2",
};
const ACH_FG_MAP: Record<BadgeColor, string> = {
  gray:   "#d1d5db",
  green:  "#065f46",
  yellow: "#854d0e",
  red:    "#991b1b",
};

// ===== 型 =====

/** /meeting 各業態セクションで共通の表示パラメータ (period から導出される定数群) */
export type MeetingPeriodProps = {
  isEndPeriod: boolean;   // period === "end" (= 月次レビュー)
  daysElapsed: number;    // 10 / 20 / daysInMonth
  daysInMonth: number;    // 当該月の日数
};

/** MetricRow / MobileMetricCard 共通の props 形状 */
type MetricRowProps = MeetingPeriodProps & {
  label: string;
  actual: number;
  target: number;
  format: (v: number) => string;
  isRate?: boolean;        // %値・客単価などの率系。着地予測しない
  invertGap?: boolean;     // コスト系。値が低いほど良い (達成評価軸を反転)
};

// ===== MetricRow (PC table 用、既存挙動完全維持) =====

export function MetricRow({
  label, actual, target, isEndPeriod, daysElapsed, daysInMonth,
  format, isRate = false, invertGap = false,
}: MetricRowProps) {
  const landing = isRate ? actual : calcLanding(actual, daysElapsed, daysInMonth);
  const compareVal = isEndPeriod ? actual : landing;
  const achievement = calcAchievement(compareVal, target);
  const gap = calcGap(compareVal, target);
  const daily = calcDaily(target, daysInMonth);

  // PR c87: getBadgeColor (invert 対応) を共通 helper として使用、ローカル inline 配色から
  //   BadgeColor → bg/color tuple マップに変更。PC table は <MetricBadge> ではなく既存
  //   inline style を維持 (sizing / 列幅への影響回避)、色のみ共通 semantic にマップ。
  const achColor = getBadgeColor(achievement, { invert: invertGap });
  const achBg = ACH_BG_MAP[achColor];
  const achFg = ACH_FG_MAP[achColor];
  const gapPositive = invertGap ? (gap !== null && gap <= 0) : (gap !== null && gap >= 0);

  // PR #75: PC v9 装飾整理 — padding 10px 10px、各セル font 軽量化
  const td: React.CSSProperties = {
    padding: `10px ${SECTION.PADDING_H}px`, fontSize: 12, textAlign: "right",
    color: "#374151", borderBottom: "1px solid #f0faf0",
  };

  return (
    <tr>
      <td style={{
        ...td, textAlign: "left", fontWeight: 400,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{label}</td>
      <td style={{ ...td, fontWeight: 500, color: "#111" }}>{format(actual)}</td>
      <td style={{ ...td, color: "#059669", fontWeight: 500 }}>
        {isEndPeriod || isRate ? "—" : format(landing)}
      </td>
      <td style={td}>
        {achievement !== null ? (
          <span style={{
            display: "inline-block", fontSize: 11, fontWeight: 700,
            borderRadius: 4, padding: "2px 8px",
            background: achBg, color: achFg,
          }}>{formatAchievement(achievement, { invert: invertGap })}</span>
        ) : <span style={{ color: "#d1d5db", fontSize: 11 }}>未設定</span>}
      </td>
      {/* PR #75: 目標差を mockup pattern (gap-inline) に変更
            - 縦並び + 🎯 目標表記 → 横並び (数値 + 不足/余裕 タグ)
            - 余裕/不足 (mobile #74 と用語統一、mockup 準拠)
            - color: gap-num pos→#065f46 / neg→#991b1b (v9 系)、font-weight 500
            - 🎯 目標行は削除 (target 値は別列の達成率から逆算可能、列幅有効活用) */}
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        {gap === null ? <span style={{ color: "#d1d5db", fontSize: 11 }}>{"—"}</span> : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", justifyContent: "flex-end" }}>
            <span style={{
              fontSize: 12, fontWeight: 500, lineHeight: 1.1,
              color: gapPositive ? "#065f46" : "#991b1b",
            }}>
              {gap >= 0 ? "+" : "−"}{format(Math.abs(gap))}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 500, borderRadius: 3, padding: "2px 7px",
              lineHeight: 1.3, flexShrink: 0,
              background: gapPositive ? "#d1fae5" : "#fee2e2",
              color: gapPositive ? "#065f46" : "#991b1b",
            }}>{gapPositive ? "余裕" : "不足"}</span>
          </span>
        )}
      </td>
      {/* PR #75: 1日の目安 color #d97706 → #6b7280、font 軽量化 (mockup 準拠) */}
      <td style={td}>
        {daily > 0 && !isRate ? (
          <span style={{ color: "#6b7280", fontWeight: 400, fontSize: 11 }}>{format(daily)}</span>
        ) : <span style={{ color: "#d1d5db", fontSize: 11 }}>{"—"}</span>}
      </td>
    </tr>
  );
}

// ===== MobileMetricCard (PR #74 新設、mockup mob-meeting-card pattern) =====

type MobileMetricCardProps = MetricRowProps & {
  /** SectionTable から伝播。border-left の色決定に使用 */
  group?: GroupType;
};

function MobileMetricCard({
  label, actual, target, isEndPeriod, daysElapsed, daysInMonth,
  format, isRate = false, invertGap = false, group,
}: MobileMetricCardProps) {
  // calc 関数群は MetricRow と完全同一 (gapPositive 判定含む、集計ロジック不変)
  const landing = isRate ? actual : calcLanding(actual, daysElapsed, daysInMonth);
  const compareVal = isEndPeriod ? actual : landing;
  const gap = calcGap(compareVal, target);
  const daily = calcDaily(target, daysInMonth);
  const gapPositive = invertGap ? (gap !== null && gap <= 0) : (gap !== null && gap >= 0);

  const borderColor = group ? getGroupBorderColor(group) : "#9ca3af";

  return (
    <div style={{
      background: "#fafafa", borderRadius: 8, padding: 12,
      borderLeft: `3px solid ${borderColor}`,
      fontVariantNumeric: "tabular-nums",
    }}>
      {/* row1: label + gap-tag (余裕/不足) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{label}</span>
        {gap !== null && target > 0 && (
          <span style={{
            display: "inline-block", padding: "1px 6px", fontSize: 9, fontWeight: 500,
            borderRadius: 3, lineHeight: 1.3,
            background: gapPositive ? "#d1fae5" : "#fee2e2",
            color: gapPositive ? "#065f46" : "#991b1b",
          }}>{gapPositive ? "余裕" : "不足"}</span>
        )}
      </div>

      {/* row2: actual (大きく) */}
      <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 8, color: "#111" }}>
        {format(actual)}
      </div>

      {/* row3: 3-column grid (着地予測 / 目標差 / 1日の目安) */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
        paddingTop: 8, borderTop: "0.5px solid rgba(0,0,0,0.05)",
      }}>
        <div>
          <span style={{ fontSize: 9, color: "#9ca3af", display: "block" }}>着地予測</span>
          <span style={{ fontSize: 12, color: "#059669", fontWeight: 500 }}>
            {isEndPeriod || isRate ? "—" : format(landing)}
          </span>
        </div>
        <div>
          <span style={{ fontSize: 9, color: "#9ca3af", display: "block" }}>目標差</span>
          {gap !== null ? (
            <span style={{
              fontSize: 12, fontWeight: 500,
              color: gapPositive ? "#065f46" : "#991b1b",
            }}>{gap >= 0 ? "+" : "−"}{format(Math.abs(gap))}</span>
          ) : <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>}
        </div>
        <div>
          <span style={{ fontSize: 9, color: "#9ca3af", display: "block" }}>1日の目安</span>
          {daily > 0 && !isRate ? (
            <span style={{ fontSize: 12, color: "#6b7280" }}>{format(daily)}</span>
          ) : <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>}
        </div>
      </div>
    </div>
  );
}

// ===== SectionTable =====

export function SectionTable({
  title, group, count, defaultOpen, children,
}: {
  title: string;
  children: React.ReactNode;
  /** PR #74: v9 グループ色 (rev/cnt/acq/cost/help)。省略時は従来の灰縁 */
  group?: GroupType;
  /** PR #74: pill 右隣に「N 項目」表示 (mobile アコーディオン用)。省略時は非表示 */
  count?: number;
  /** PR #74: mobile アコーディオン初期開閉。省略時は常に開 (PC 既存挙動互換) */
  defaultOpen?: boolean;
}) {
  // defaultOpen 未指定 = 従来通り常に展開 (PC 既存挙動維持、アコーディオン化なし)
  // 指定時のみ mobile アコーディオン化 (PC は常時展開、mobile は toggle)
  const isAccordion = defaultOpen !== undefined;
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen ?? true);

  return (
    <div style={{
      background: "#fff", borderRadius: 10,
      border: "1px solid #d1fae5", overflow: "hidden",
      ...(group && { borderLeft: `3px solid ${getGroupBorderColor(group)}` }),
    }}>
      {/* ヘッダ: アコーディオンモード時は <button>、それ以外は <div> */}
      {isAccordion ? (
        <button
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          aria-expanded={isOpen}
          style={{
            width: "100%", background: "#ecfdf5", padding: `8px ${SECTION.PADDING_H}px`,
            borderTop: "none", borderRight: "none", borderLeft: "none",
            borderBottom: "1px solid #d1fae5",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            cursor: "pointer", font: "inherit", textAlign: "left",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {group ? (
              <GroupPill type={group}>{title}</GroupPill>
            ) : (
              <span style={{
                fontSize: SECTION.HEADER_FONT_SIZE, fontWeight: SECTION.HEADER_FONT_WEIGHT, color: SECTION.HEADER_COLOR,
                textTransform: "uppercase", letterSpacing: "0.07em",
              }}>{title}</span>
            )}
            {count !== undefined && (
              <span style={{ fontSize: 10, color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
                {count} 項目
              </span>
            )}
          </div>
          {/* chevron は mobile のみ表示 (PC は常時展開なので不要) */}
          <span className="show-mobile" style={{ display: "none", fontSize: 12, color: "#6b7280" }} aria-hidden>
            {isOpen ? "▲" : "▼"}
          </span>
        </button>
      ) : (
        <div style={{
          background: "#ecfdf5", padding: `8px ${SECTION.PADDING_H}px`, borderBottom: "1px solid #d1fae5",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {group ? (
              <GroupPill type={group}>{title}</GroupPill>
            ) : (
              <span style={{
                fontSize: SECTION.HEADER_FONT_SIZE, fontWeight: SECTION.HEADER_FONT_WEIGHT, color: SECTION.HEADER_COLOR,
                textTransform: "uppercase", letterSpacing: "0.07em",
              }}>{title}</span>
            )}
          </div>
        </div>
      )}

      {/* PC: 常時 render (isOpen に関係なく表示、会議中の一覧性優先) */}
      {/* PR #75: 列幅再配分 (actual 17%→14%, gap 24%→26%, daily 15%→16%)、
                  thead bg #ecfdf5→#fafafa、padding 8px→10px、font-weight 700→500、
                  textTransform/letterSpacing 削除 (mockup 準拠) */}
      <div className="hide-mobile" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 520 }}>
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {["指標", "実績", "着地予測", "達成率", "目標差", "1日の目安"].map((h, i) => (
                <th key={h} style={{
                  padding: `10px ${SECTION.PADDING_H}px`, fontSize: 10, fontWeight: 500, color: "#6b7280",
                  borderBottom: "0.5px solid rgba(0,0,0,0.1)",
                  textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>

      {/* Mobile: isOpen のときのみ MobileMetricCard 群を描画 */}
      {isOpen && (
        <div className="show-mobile" style={{ display: "none", flexDirection: "column", padding: 12, gap: 6 }}>
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return child;
            // MetricRow に渡された props を取り出し MobileMetricCard に渡す
            const props = child.props as MetricRowProps;
            return <MobileMetricCard {...props} group={group} />;
          })}
        </div>
      )}
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
