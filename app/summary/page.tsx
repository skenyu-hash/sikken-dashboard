"use client";
import { useEffect, useMemo, useState } from "react";
import { BUSINESSES, AREA_NAMES, type BusinessCategory } from "../lib/businesses";

type CellData = { revenue: number; targetSales: number } | null;

export default function SummaryPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>("water");
  const [data, setData] = useState<Record<string, Record<string, CellData>>>({});
  const [loading, setLoading] = useState(false);

  const businessAreas = useMemo(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    return biz?.areas ?? [];
  }, [activeBusiness]);

  // 2025年1月から現在月までの月リスト
  const months = useMemo(() => {
    const list: { y: number; m: number; key: string; label: string }[] = [];
    for (let y = 2025; y <= currentYear; y++) {
      const startM = 1;
      const endM = y === currentYear ? currentMonth : 12;
      for (let m = startM; m <= endM; m++) {
        list.push({ y, m, key: `${y}-${m}`, label: `${y % 100}/${m}` });
      }
    }
    return list;
  }, [currentYear, currentMonth]);

  useEffect(() => {
    setLoading(true);
    const tasks: Promise<{ areaId: string; key: string; cell: CellData }>[] = [];
    for (const areaId of businessAreas) {
      for (const { y, m, key } of months) {
        tasks.push((async () => {
          const [sumRes, tgtRes] = await Promise.all([
            fetch(`/api/monthly-summary?area=${areaId}&year=${y}&month=${m}&category=${activeBusiness}`)
              .then(r => r.ok ? r.json() : { summary: null }),
            fetch(`/api/targets?area=${areaId}&year=${y}&month=${m}&category=${activeBusiness}`)
              .then(r => r.ok ? r.json() : { targets: null }),
          ]);
          if (!sumRes.summary) return { areaId, key, cell: null };
          return {
            areaId, key,
            cell: {
              revenue: Number(sumRes.summary.total_revenue ?? 0),
              targetSales: Number(tgtRes.targets?.targetSales ?? 0),
            },
          };
        })());
      }
    }
    Promise.all(tasks).then((results) => {
      const map: Record<string, Record<string, CellData>> = {};
      for (const { areaId, key, cell } of results) {
        if (!map[areaId]) map[areaId] = {};
        map[areaId][key] = cell;
      }
      setData(map);
      setLoading(false);
    });
  }, [businessAreas, months, activeBusiness]);

  function fmtMan(v: number): string {
    if (v <= 0) return "—";
    return `${Math.round(v / 10000).toLocaleString()}万`;
  }

  function badgeStyle(rate: number | null): React.CSSProperties {
    if (rate === null) return { background: "#f3f4f6", color: "#9ca3af" };
    if (rate >= 100) return { background: "#d1fae5", color: "#065f46" };
    if (rate >= 80) return { background: "#fef9c3", color: "#854d0e" };
    return { background: "#fee2e2", color: "#991b1b" };
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        {/* 事業タブ */}
        <div style={{ display: "flex", gap: 4, padding: "8px 20px 0", overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          {BUSINESSES.map((b) => (
            <button key={b.id} type="button" onClick={() => setActiveBusiness(b.id)}
              style={{
                padding: "5px 12px", borderRadius: "6px 6px 0 0",
                fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                background: activeBusiness === b.id ? "rgba(255,255,255,0.25)" : "transparent",
                color: activeBusiness === b.id ? "#fff" : "rgba(255,255,255,0.55)",
                whiteSpace: "nowrap",
              }}>
              {b.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 20px 16px" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>全エリア×全月一覧</h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
            {BUSINESSES.find(b => b.id === activeBusiness)?.label} ／ 2025年1月〜{currentYear}年{currentMonth}月の売上・達成率
          </p>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 12 }}>
            データを読み込み中...
          </div>
        )}

        {!loading && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
                <thead>
                  <tr style={{ background: "#ecfdf5" }}>
                    <th style={{
                      padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#065f46",
                      borderBottom: "1px solid #d1fae5", borderRight: "1px solid #d1fae5",
                      textAlign: "left", position: "sticky", left: 0, background: "#ecfdf5",
                      zIndex: 2, minWidth: 80,
                    }}>
                      エリア
                    </th>
                    {months.map((mo) => (
                      <th key={mo.key} style={{
                        padding: "10px 8px", fontSize: 10, fontWeight: 700, color: "#065f46",
                        borderBottom: "1px solid #d1fae5", borderRight: "1px solid #f0faf0",
                        textAlign: "center", whiteSpace: "nowrap", minWidth: 90,
                      }}>
                        {mo.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {businessAreas.map((areaId) => (
                    <tr key={areaId} style={{ borderBottom: "1px solid #f5faf5" }}>
                      <td style={{
                        padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#374151",
                        borderRight: "1px solid #d1fae5",
                        position: "sticky", left: 0, background: "#fff", zIndex: 1,
                      }}>
                        {AREA_NAMES[areaId] ?? areaId}
                      </td>
                      {months.map((mo) => {
                        const cell = data[areaId]?.[mo.key];
                        if (!cell) {
                          return (
                            <td key={mo.key} style={{
                              padding: "10px 8px", fontSize: 11, textAlign: "center",
                              borderRight: "1px solid #f0faf0", color: "#d1d5db",
                            }}>—</td>
                          );
                        }
                        const rate = cell.targetSales > 0
                          ? Math.round(cell.revenue / cell.targetSales * 1000) / 10
                          : null;
                        const bs = badgeStyle(rate);
                        return (
                          <td key={mo.key} style={{
                            padding: "8px 6px", fontSize: 11, textAlign: "center",
                            borderRight: "1px solid #f0faf0",
                          }}>
                            <div style={{ fontWeight: 700, color: "#111", marginBottom: 2 }}>
                              {fmtMan(cell.revenue)}
                            </div>
                            <span style={{
                              display: "inline-block", fontSize: 9, fontWeight: 700,
                              borderRadius: 3, padding: "1px 5px", ...bs,
                            }}>
                              {rate !== null ? `${rate.toFixed(0)}%` : "未設定"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {businessAreas.length === 0 && (
              <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
                この事業には対象エリアがありません
              </div>
            )}
          </div>
        )}

        {/* 凡例 */}
        <div style={{ marginTop: 12, padding: "8px 12px", background: "#fff", borderRadius: 8, border: "1px solid #d1fae5", display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10 }}>
          <span style={{ color: "#6b7280", fontWeight: 700 }}>達成率:</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: "#d1fae5", color: "#065f46", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>100%以上</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: "#fef9c3", color: "#854d0e", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>80〜99%</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: "#fee2e2", color: "#991b1b", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>80%未満</span>
          </span>
        </div>
      </div>
    </div>
  );
}
