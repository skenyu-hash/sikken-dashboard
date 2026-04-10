"use client";
import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, getDaysElapsed, yen, type DailyEntry,
} from "../lib/calculations";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type MetricKey = "revenue" | "profit" | "profitRate" | "count" | "unitPrice" | "constructionRate" | "adRate" | "helpRate" | "convRate";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "profitRate", label: "粗利率" },
  { key: "constructionRate", label: "工事取得率" },
  { key: "helpRate", label: "HELP率" },
  { key: "convRate", label: "成約率" },
  { key: "adRate", label: "広告費率" },
  { key: "unitPrice", label: "客単価" },
  { key: "revenue", label: "売上" },
];

export default function RankingPage() {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysElapsed = getDaysElapsed(now, year, month);

  const [metric, setMetric] = useState<MetricKey>("profitRate");
  const [allEntries, setAllEntries] = useState<Record<string, DailyEntry[]>>({});

  useEffect(() => {
    Promise.all(
      AREAS.map(async (a) => {
        const res = await fetch(`/api/entries?area=${a.id}&year=${year}&month=${month}`);
        const json = res.ok ? await res.json() : { entries: [] };
        return [a.id, json.entries ?? []] as const;
      })
    ).then((pairs) => {
      const map: Record<string, DailyEntry[]> = {};
      for (const [id, entries] of pairs) map[id] = entries;
      setAllEntries(map);
    });
  }, [year, month]);

  const areaSummaries = useMemo(() => {
    return AREAS.map((a) => {
      const entries = allEntries[a.id] ?? [];
      const summary = calculateDashboard(entries, year, month, now);
      const adRate = summary.totalRevenue > 0
        ? (summary.totalAdCost / summary.totalRevenue) * 100 : 0;
      const profitRate = summary.totalRevenue > 0
        ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;
      const callCount = entries.reduce((s, e) => s + (e.insourceCount ?? 0) + (e.outsourceCount ?? 0), 0);
      const helpRate = summary.totalCount > 0 ? (summary.help.count / summary.totalCount) * 100 : 0;
      const convRate = callCount > 0 ? (summary.totalCount / callCount) * 100 : 0;
      return {
        area: a,
        summary,
        adRate,
        profitRate,
        values: {
          revenue: summary.totalRevenue,
          profit: summary.totalProfit,
          profitRate,
          count: summary.totalCount,
          unitPrice: summary.companyUnitPrice,
          constructionRate: summary.constructionRate,
          adRate,
          helpRate,
          convRate,
        } as Record<MetricKey, number>,
      };
    });
  }, [allEntries, year, month, now]);

  const ranked = useMemo(() => {
    return [...areaSummaries].sort((a, b) => {
      if (metric === "adRate") return a.values[metric] - b.values[metric];
      return b.values[metric] - a.values[metric];
    });
  }, [areaSummaries, metric]);

  const maxVal = ranked[0]?.values[metric] ?? 1;

  function formatVal(key: MetricKey, val: number): string {
    if (key === "revenue" || key === "profit" || key === "unitPrice") return yen(val);
    if (key === "count") return `${val}件`;
    return `${val.toFixed(1)}%`;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      {/* ============ ヘッダー ============ */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)", padding: "16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#fff" }}>エリアランキング</h1>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", marginTop: "3px" }}>
              {year}年{month}月 ／ 経過{daysElapsed}日時点
            </p>
          </div>
        </div>
        <div style={{ padding: "6px 0 10px", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
          割合指標（粗利率・工事率等）はエリア規模に依存しない実力値です
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              style={{
                padding: "5px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: 700,
                border: "2px solid",
                borderColor: metric === m.key ? "#fff" : "rgba(255,255,255,0.35)",
                background: metric === m.key ? "#fff" : "transparent",
                color: metric === m.key ? "#059669" : "rgba(255,255,255,0.85)",
                cursor: "pointer",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ============ ボディ ============ */}
      <div style={{ padding: "16px 20px" }}>
        {/* TOP3 カード */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "16px" }}>
          {ranked.slice(0, 3).map((item, i) => {
            const medals = ["🥇", "🥈", "🥉"];
            const borderColors = ["#fbbf24", "#94a3b8", "#d97706"];
            const barColors = ["#fbbf24", "#94a3b8", "#d97706"];
            const barWidth = maxVal > 0 ? (item.values[metric] / maxVal) * 100 : 0;
            const valueColor = i === 0 ? "#d97706" : i === 1 ? "#475569" : "#d97706";
            return (
              <div
                key={item.area.id}
                style={{
                  background: "#fff", borderRadius: "12px",
                  border: `2px solid ${borderColors[i]}`, overflow: "hidden",
                }}
              >
                <div style={{ padding: "12px 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "20px" }}>{medals[i]}</div>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#111", marginTop: "2px" }}>{item.area.name}</div>
                  </div>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: borderColors[i] }}>{i + 1}位</div>
                </div>
                <div
                  style={{
                    fontSize: "22px", fontWeight: 800, color: valueColor,
                    padding: "2px 14px 6px",
                  }}
                >
                  {formatVal(metric, item.values[metric])}
                </div>
                <div style={{ padding: "0 14px 6px" }}>
                  <div style={{ height: "4px", background: "#f3f4f6", borderRadius: "2px" }}>
                    <div style={{ height: "4px", borderRadius: "2px", background: barColors[i], width: `${barWidth}%` }} />
                  </div>
                </div>
                <div
                  style={{
                    padding: "6px 14px 10px", display: "flex", justifyContent: "space-between",
                    alignItems: "center", borderTop: "1px solid #f0faf0",
                  }}
                >
                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                    粗利率 {item.profitRate.toFixed(1)}%
                  </span>
                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                    件数 {item.summary.totalCount}件
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 4〜8位テーブル */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #d1fae5", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#ecfdf5" }}>
                {["順位", "エリア", "実績", "相対比率", "件数", "客単価", "粗利率", "広告費率"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 10px", fontSize: "9px", fontWeight: 700, color: "#6b7280",
                      textTransform: "uppercase", letterSpacing: "0.07em",
                      borderBottom: "1px solid #d1fae5",
                      textAlign: h === "順位" ? "center" : h === "エリア" ? "left" : "right",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.slice(3).map((item, i) => {
                const rank = i + 4;
                const barWidth = maxVal > 0 ? (item.values[metric] / maxVal) * 100 : 0;
                const isLow = rank >= 7;
                return (
                  <tr key={item.area.id} style={{ borderBottom: "1px solid #f0faf0" }}>
                    <td style={{ padding: "10px 10px", textAlign: "center" }}>
                      <div
                        style={{
                          width: "24px", height: "24px", borderRadius: "50%", margin: "0 auto",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "11px", fontWeight: 800,
                          background: isLow ? "#fef2f2" : "#ecfdf5",
                          color: isLow ? "#dc2626" : "#059669",
                        }}
                      >
                        {rank}
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "12px", fontWeight: 700, color: "#111" }}>{item.area.name}</td>
                    <td style={{ padding: "10px 10px", fontSize: "12px", fontWeight: 700, color: "#111", textAlign: "right" }}>
                      {formatVal(metric, item.values[metric])}
                    </td>
                    <td style={{ padding: "10px 10px" }}>
                      <div style={{ height: "6px", background: "#f3f4f6", borderRadius: "3px" }}>
                        <div
                          style={{
                            height: "6px", borderRadius: "3px", width: `${barWidth}%`,
                            background: isLow ? "#dc2626" : "#059669",
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "11px", color: "#374151", textAlign: "right" }}>
                      {item.summary.totalCount}件
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "11px", color: "#374151", textAlign: "right" }}>
                      {yen(item.summary.companyUnitPrice)}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: "10px", fontWeight: 700, borderRadius: "3px", padding: "1px 6px",
                          background: item.profitRate >= 25 ? "#d1fae5" : item.profitRate >= 15 ? "#fef9c3" : "#fee2e2",
                          color: item.profitRate >= 25 ? "#064e3b" : item.profitRate >= 15 ? "#713f12" : "#7f1d1d",
                        }}
                      >
                        {item.profitRate.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: "10px", fontWeight: 700, borderRadius: "3px", padding: "1px 6px",
                          background: item.adRate <= 20 ? "#d1fae5" : item.adRate <= 30 ? "#fef9c3" : "#fee2e2",
                          color: item.adRate <= 20 ? "#064e3b" : item.adRate <= 30 ? "#713f12" : "#7f1d1d",
                        }}
                      >
                        {item.adRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

