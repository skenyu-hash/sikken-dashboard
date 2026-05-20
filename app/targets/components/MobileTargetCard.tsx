"use client";
// PR #76: /targets mobile v9 — mob-target-card pattern。
// PR #76c: 達成率 badge を row1 右側に追加 (actualValue prop + calcAchievement)。
//
// mockup sikken_other_mobile_mockups_1.html line 664-678 の HTML を React 化。
//
// 構造:
//   - border-left: v9 group 色 (rev/cnt/acq/cost/help) 3px
//   - row1: label (左) + 達成率 badge (右、actual / target × 100、Q3=a simple ratio)
//   - row2: 2-col grid
//     * 左: 現在の目標 (readonly、formatted "¥84,000,000")
//     * 右: 新しい目標 (input、raw "84000000")
//
// state 設計 (mockup の意図):
//   - 「現在の目標」と input は同じ value を render
//   - 編集時、useTargetsState 経由で state が即更新 → 両者同時更新
//   - 形式の違い (formatted vs raw input) で「現在の表示」「これから保存される値」を
//     視覚的に区別。useDebounceSave で背景保存中も UI 上は連動
//
// PR #76c 達成率 badge 設計判断:
//   Q2=a: rate 系 derived metric (広告費率 / 工事取得率 / HELP率 / 面談率) も
//     対象に含め、全 17 metric に achievement badge を出す。
//   Q3=a: cost 系 (CPA / 広告費 / 広告費率) も simple ratio (actual/target*100)。
//     /dashboard, /meeting と同じく invert なし。cross-page 統一は別 PR で検討。
//   Q4: targetHelpUnitPrice は monthly_summaries.help_unit_price 列で直接マッピング可。

import type { GroupType } from "../../components/ui";
// PR c87: formatAchievement + invert オプション対応の getBadgeColor を共通 ui module から import。
import { MetricBadge, getBadgeColor, formatAchievement } from "../../components/ui/metric-badge";
import { getGroupBorderColor } from "../../components/dashboard/metric-groups";
import type { Targets } from "../../lib/calculations";
import { formatByUnit, type MetricDef, type MetricUnit } from "./TargetsMatrix";

type Props = {
  metric: MetricDef;
  value: number;
  areaId: string;
  group: GroupType;
  canEdit: boolean;
  setCell: (areaId: string, key: keyof Targets, raw: string) => void;
  /** PR #76c: monthly_summaries から取得した実績値 (target と同じ概念単位、
   *  ただし yen_man の target は ×10000 して比較する)。null = 実績未取得 / 不明。 */
  actualValue: number | null;
};

// PR #76c: 達成率算出。target が 0 以下 / 実績 null は null を返し badge gray に。
//   yen_man の target は DB が万円で保存するため、actual (円) と比較するときは
//   target × 10000 をベースにする。yen_raw / count / percent はそのまま比較。
// PR c87: simple ratio は維持しつつ、metric.direction === "lower_is_better" の場合
//   getBadgeColor の invert オプションで cost-invert に切替。calcAchievement 自体は
//   生の比率を返し、色判定だけが direction を見る (semantic separation)。
function calcAchievement(unit: MetricUnit, target: number, actual: number | null): number | null {
  if (actual == null || target <= 0) return null;
  const targetInActualUnit = (unit === "yen_man" || unit === "yen") ? target * 10000 : target;
  if (targetInActualUnit <= 0) return null;
  return (actual / targetInActualUnit) * 100;
}

export default function MobileTargetCard({ metric, value, areaId, group, canEdit, setCell, actualValue }: Props) {
  const borderColor = getGroupBorderColor(group);
  const achievement = calcAchievement(metric.unit, value, actualValue);
  // PR c87: cost 系 metric (広告費 / 広告費率 / CPA) は invert で評価軸反転
  const invert = metric.direction === "lower_is_better";
  return (
    <div style={{
      background: "#fafafa", borderRadius: 8, padding: "10px 12px",
      marginBottom: 6, borderLeft: `3px solid ${borderColor}`,
    }}>
      {/* row1: label + (達成率 badge slot は #76c で追加) */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
          {metric.label}
        </span>
        {/* PR #76c: 達成率 badge — actualValue 未取得 / target 0 は gray "—"
            PR c87: cost-invert (metric.direction === "lower_is_better") を反映、
                    赤字 (achievement < 0) は formatAchievement で "未達" 表示 */}
        <MetricBadge color={getBadgeColor(achievement, { invert })} minWidth={false}>
          {formatAchievement(achievement, { invert })}
        </MetricBadge>
      </div>

      {/* row2: 2-col grid (現在の目標 readonly + 新しい目標 input) */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "center",
      }}>
        {/* 現在の目標 (formatted readonly) */}
        <div style={{
          background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)",
          borderRadius: 6, padding: "6px 8px",
        }}>
          <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>現在の目標</div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: "#111",
            fontVariantNumeric: "tabular-nums",
          }}>
            {formatByUnit(metric.unit, value)}
          </div>
        </div>

        {/* 新しい目標 (raw input or readonly text) */}
        <div>
          <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>新しい目標</div>
          {canEdit ? (
            <input
              type="number"
              step={metric.unit === "percent" ? "0.1" : "1"}
              value={value || ""}
              placeholder="0"
              onChange={(e) => setCell(areaId, metric.key as keyof Targets, e.target.value)}
              style={{
                width: "100%", padding: "6px 8px", fontSize: 13,
                border: "0.5px solid #a7f3d0", borderRadius: 4,
                textAlign: "right", background: "#f0fdf4", color: "#111",
                fontVariantNumeric: "tabular-nums", outline: "none",
              }}
            />
          ) : (
            <span style={{
              display: "inline-block", padding: "6px 8px", fontSize: 13,
              fontWeight: 500, color: "#111", fontVariantNumeric: "tabular-nums",
            }}>
              {formatByUnit(metric.unit, value)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
