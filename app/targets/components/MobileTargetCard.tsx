"use client";
// PR #76: /targets mobile v9 — mob-target-card pattern。
//
// mockup sikken_other_mobile_mockups_1.html line 664-678 の HTML を React 化。
//
// 構造:
//   - border-left: v9 group 色 (rev/cnt/acq/cost/help) 3px
//   - row1: label (左) + 達成率 badge slot (右、空、本 PR では未実装)
//     * 達成率 badge は #76c で /api/monthly-summary fetch + getBadgeColor 経由で追加予定
//   - row2: 2-col grid
//     * 左: 現在の目標 (readonly、formatted "¥84,000,000")
//     * 右: 新しい目標 (input、raw "84000000")
//
// state 設計 (mockup の意図):
//   - 「現在の目標」と input は同じ value を render
//   - 編集時、useTargetsState 経由で state が即更新 → 両者同時更新
//   - 形式の違い (formatted vs raw input) で「現在の表示」「これから保存される値」を
//     視覚的に区別。useDebounceSave で背景保存中も UI 上は連動

import type { GroupType } from "../../components/ui";
import { getGroupBorderColor } from "../../components/dashboard/metric-groups";
import type { Targets } from "../../lib/calculations";
import { formatByUnit, type MetricDef } from "./TargetsMatrix";

type Props = {
  metric: MetricDef;
  value: number;
  areaId: string;
  group: GroupType;
  canEdit: boolean;
  setCell: (areaId: string, key: keyof Targets, raw: string) => void;
};

export default function MobileTargetCard({ metric, value, areaId, group, canEdit, setCell }: Props) {
  const borderColor = getGroupBorderColor(group);
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
        {/* 達成率 badge は #76c で追加 (/api/monthly-summary fetch + 達成率算出 + MetricBadge) */}
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
