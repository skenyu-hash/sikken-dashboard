"use client";
// エリア別ビュー: 縦軸=エリア(N行) + 合計行(参考、readonly)、
//                横軸=指標(売上/粗利/広告費/合計件数/HELP売上/HELP件数)。
// 各セルはインライン編集可能、debounce 500ms で /api/targets POST。

import { useEffect, useMemo, useState } from "react";
import { emptyTargets, type Targets } from "../../lib/calculations";
import { useDebouncedCallback, useSaveStatus, type SaveStatus } from "../lib/useDebounceSave";

type Area = { id: string; name: string };

// 編集対象の指標6項目。target_ プレフィックス付きで Targets 型のキーに対応。
// unit: yen=円整数（¥カンマ区切り表示）/ count=件数（数値のみ）
type MetricKey =
  | "targetSales"
  | "targetProfit"
  | "targetAdCost"
  | "targetCount"
  | "targetHelpSales"
  | "targetHelpCount";

type MetricDef = {
  key: MetricKey;
  label: string;
  unit: "yen" | "count";
};

const METRICS: MetricDef[] = [
  { key: "targetSales",     label: "売上目標",       unit: "yen" },
  { key: "targetProfit",    label: "粗利目標",       unit: "yen" },
  { key: "targetAdCost",    label: "広告費目標",     unit: "yen" },
  { key: "targetCount",     label: "合計件数目標",   unit: "count" },
  { key: "targetHelpSales", label: "HELP売上目標",  unit: "yen" },
  { key: "targetHelpCount", label: "HELP件数目標",  unit: "count" },
];

function formatYen(v: number): string {
  if (!v || v <= 0) return "—";
  return `¥${v.toLocaleString()}`;
}
function formatCount(v: number): string {
  if (!v || v <= 0) return "—";
  return v.toLocaleString();
}
function formatByUnit(unit: "yen" | "count", v: number): string {
  return unit === "yen" ? formatYen(v) : formatCount(v);
}

type AreaTargets = Record<string, Targets>;

type Props = {
  areas: Area[];
  category: string;
  year: number;
  month: number;
  canEdit: boolean;
  onSaveStatusChange?: (status: SaveStatus, flash: boolean) => void;
};

export default function TargetsMatrix({ areas, category, year, month, canEdit, onSaveStatusChange }: Props) {
  const [areaTargets, setAreaTargets] = useState<AreaTargets>({});
  const [loading, setLoading] = useState(true);
  const [flashCells, setFlashCells] = useState<Set<string>>(new Set());
  const { status, flash, markSaving, markSaved, markError } = useSaveStatus();

  useEffect(() => {
    onSaveStatusChange?.(status, flash);
  }, [status, flash, onSaveStatusChange]);

  // 全エリアの targets を並列取得
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      areas.map(async (a) => {
        const res = await fetch(
          `/api/targets?area=${a.id}&year=${year}&month=${month}&category=${category}`
        );
        const j = res.ok ? await res.json() : { targets: emptyTargets() };
        return [a.id, { ...emptyTargets(), ...(j.targets ?? {}) }] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const map: AreaTargets = {};
      for (const [id, t] of entries) map[id] = t;
      setAreaTargets(map);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [areas, category, year, month]);

  // debounced save: areaId + 全 targets を POST
  const debouncedSave = useDebouncedCallback(async (areaId: string, t: Targets) => {
    markSaving();
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ areaId, year, month, targets: t, category }),
      });
      if (!res.ok) {
        markError();
        return;
      }
      markSaved();
      const cellKey = `${areaId}::__row__`;
      setFlashCells((prev) => {
        const next = new Set(prev);
        next.add(cellKey);
        return next;
      });
      setTimeout(() => {
        setFlashCells((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });
      }, 800);
    } catch {
      markError();
    }
  }, 500);

  function setCell(areaId: string, key: MetricKey, raw: string) {
    const num = raw === "" ? 0 : parseFloat(raw) || 0;
    setAreaTargets((prev) => {
      const next = { ...prev, [areaId]: { ...(prev[areaId] ?? emptyTargets()), [key]: num } };
      debouncedSave(areaId, next[areaId]);
      return next;
    });
  }

  // 合計行（参考、readonly）
  const totals = useMemo(() => {
    const t: Record<MetricKey, number> = {
      targetSales: 0, targetProfit: 0, targetAdCost: 0,
      targetCount: 0, targetHelpSales: 0, targetHelpCount: 0,
    };
    for (const a of areas) {
      const at = areaTargets[a.id];
      if (!at) continue;
      for (const m of METRICS) t[m.key] += Number(at[m.key] ?? 0);
    }
    return t;
  }, [areaTargets, areas]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
        目標データを読み込み中...
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #d1fae5",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr style={{ background: "#ecfdf5" }}>
              <th
                style={{
                  padding: "8px 12px", fontSize: 11, fontWeight: 700,
                  color: "#065f46", textAlign: "left", borderBottom: "1px solid #d1fae5",
                  whiteSpace: "nowrap",
                }}
              >
                エリア
              </th>
              {METRICS.map((m) => (
                <th
                  key={m.key}
                  style={{
                    padding: "8px 12px", fontSize: 11, fontWeight: 700,
                    color: "#065f46", textAlign: "right", borderBottom: "1px solid #d1fae5",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => {
              const at = areaTargets[a.id] ?? emptyTargets();
              const isFlashing = flashCells.has(`${a.id}::__row__`);
              return (
                <tr
                  key={a.id}
                  style={{
                    background: isFlashing ? "#d1fae5" : "transparent",
                    transition: "background 0.4s ease",
                  }}
                >
                  <td
                    style={{
                      padding: "8px 12px", fontSize: 13, fontWeight: 700, color: "#111",
                      borderBottom: "1px solid #f5faf5", whiteSpace: "nowrap",
                    }}
                  >
                    {a.name}
                  </td>
                  {METRICS.map((m) => {
                    const v = Number(at[m.key] ?? 0);
                    return (
                      <td
                        key={m.key}
                        style={{
                          padding: "6px 8px", borderBottom: "1px solid #f5faf5",
                          textAlign: "right",
                        }}
                      >
                        {canEdit ? (
                          <input
                            type="number"
                            value={v || ""}
                            placeholder="0"
                            onChange={(e) => setCell(a.id, m.key, e.target.value)}
                            style={{
                              width: "100%", maxWidth: 130, height: 30,
                              border: "1px solid #d1fae5", borderRadius: 6,
                              padding: "0 8px", fontSize: 12, fontWeight: 600,
                              textAlign: "right", color: "#111", background: "#fff",
                              outline: "none",
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
                            {formatByUnit(m.unit, v)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* 合計行（参考、readonly） */}
            <tr style={{ background: "#fafffe" }}>
              <td
                style={{
                  padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#065f46",
                  borderTop: "2px solid #d1fae5", whiteSpace: "nowrap",
                }}
              >
                合計（参考）
              </td>
              {METRICS.map((m) => (
                <td
                  key={m.key}
                  style={{
                    padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#065f46",
                    borderTop: "2px solid #d1fae5", textAlign: "right", whiteSpace: "nowrap",
                  }}
                >
                  {formatByUnit(m.unit, totals[m.key])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { METRICS as TARGETS_METRICS, formatYen, formatCount, formatByUnit };
export type { MetricKey, MetricDef, AreaTargets };
