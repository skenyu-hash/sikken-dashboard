"use client";
import { useEffect, useMemo, useState } from "react";
import { calculateDashboard, getDaysInMonth, yen } from "../lib/calculations";
import type { DailyEntry } from "../lib/calculations";
import { BUSINESSES, type BusinessCategory } from "../lib/businesses";

const ALL_AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];
const AREAS = ALL_AREAS;

const METRICS = [
  { key: "revenue", label: "売上", format: (v: number) => yen(v) },
  { key: "profit", label: "粗利", format: (v: number) => yen(v) },
  { key: "count", label: "件数", format: (v: number) => `${v}件` },
  { key: "adCost", label: "広告費", format: (v: number) => yen(v) },
  { key: "profitRate", label: "粗利率", format: (v: number) => `${v.toFixed(1)}%` },
  { key: "adRate", label: "広告費率", format: (v: number) => `${v.toFixed(1)}%` },
];

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function TrendsPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [year, setYear] = useState(currentYear);
  const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>("water");
  const businessAreas = useMemo(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (!biz) return ALL_AREAS;
    return biz.areas.map(id => ALL_AREAS.find(a => a.id === id)).filter(Boolean) as typeof ALL_AREAS;
  }, [activeBusiness]);
  const [areaId, setAreaId] = useState("kansai");
  const [metric, setMetric] = useState("revenue");
  const [monthlyData, setMonthlyData] = useState<Record<number, {
    entries: DailyEntry[];
    summary: Record<string, unknown> | null;
  }>>({});
  const [loading, setLoading] = useState(false);

  // 事業切替時にエリアリセット
  useEffect(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (biz && !biz.areas.includes(areaId)) {
      setAreaId(biz.areas[0]);
    }
  }, [activeBusiness, areaId]);

  useEffect(() => {
    setLoading(true);
    Promise.all(
      MONTHS.map(async (m) => {
        const [eRes, sRes] = await Promise.all([
          fetch(`/api/entries?area=${areaId}&year=${year}&month=${m}&category=${activeBusiness}`),
          fetch(`/api/monthly-summary?area=${areaId}&year=${year}&month=${m}&category=${activeBusiness}`),
        ]);
        const eJson = eRes.ok ? await eRes.json() : { entries: [] };
        const sJson = sRes.ok ? await sRes.json() : { summary: null };
        return [m, { entries: eJson.entries ?? [], summary: sJson.summary }] as const;
      })
    ).then((pairs) => {
      const map: Record<number, { entries: DailyEntry[]; summary: Record<string, unknown> | null }> = {};
      for (const [m, data] of pairs) map[m] = data;
      setMonthlyData(map);
      setLoading(false);
    });
  }, [areaId, year, activeBusiness]);

  const chartData = useMemo(() => {
    return MONTHS.map((m) => {
      const data = monthlyData[m];
      if (!data) return 0;
      const { entries, summary: ms } = data;
      const endDate = new Date(year, m - 1, getDaysInMonth(year, m));
      const s = calculateDashboard(entries, year, m, endDate);
      const revenue = ms ? Number(ms.total_revenue ?? 0) : s.totalRevenue;
      const profit = ms ? Number(ms.total_profit ?? 0) : s.totalProfit;
      const count = ms ? Number(ms.total_count ?? 0) : s.totalCount;
      const adCost = ms ? Number(ms.ad_cost ?? 0) : s.totalAdCost;
      switch (metric) {
        case "revenue": return revenue;
        case "profit": return profit;
        case "count": return count;
        case "adCost": return adCost;
        case "profitRate": return revenue > 0 ? Math.round(profit / revenue * 1000) / 10 : 0;
        case "adRate": return revenue > 0 ? Math.round(adCost / revenue * 1000) / 10 : 0;
        default: return 0;
      }
    });
  }, [monthlyData, metric, year]);

  const maxVal = Math.max(...chartData, 1);
  const metricObj = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  function shortFormat(key: string, val: number): string {
    if (key === "profitRate" || key === "adRate") return `${val.toFixed(1)}%`;
    if (key === "count") return `${val}件`;
    if (val >= 100000000) return `¥${(val / 100000000).toFixed(1)}億`;
    if (val >= 10000) return `¥${Math.round(val / 10000)}万`;
    return `¥${val.toLocaleString()}`;
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>月次推移グラフ</h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
              {BUSINESSES.find(b => b.id === activeBusiness)?.label} ／ 年間12ヶ月の推移を確認
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)",
                color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600 }}>
              {businessAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)",
                color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600 }}>
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {METRICS.map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)}
              style={{ padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                border: "2px solid", cursor: "pointer",
                borderColor: metric === m.key ? "#fff" : "rgba(255,255,255,0.4)",
                background: metric === m.key ? "#fff" : "transparent",
                color: metric === m.key ? "#059669" : "rgba(255,255,255,0.85)" }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      </div>

      <div style={{ padding: 20 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>データを読み込み中...</div>
        )}

        {!loading && (
          <>
            {/* バーチャート */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 16 }}>
                {AREAS.find((a) => a.id === areaId)?.name} — {year}年 {metricObj.label}推移
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 180, marginBottom: 8 }}>
                {chartData.map((val, i) => {
                  const height = maxVal > 0 ? Math.round((val / maxVal) * 135) : 0;
                  const isCurrent = year === currentYear && i + 1 === now.getMonth() + 1;
                  const hasData = val > 0;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                      {hasData && (
                        <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600,
                          whiteSpace: "nowrap", textAlign: "center" }}>
                          {shortFormat(metric, val)}
                        </div>
                      )}
                      <div style={{
                        width: "100%", height, borderRadius: "4px 4px 0 0",
                        background: isCurrent ? "#059669" : hasData ? "#86efac" : "#f3f4f6",
                        minHeight: hasData ? 4 : 0,
                      }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 6, borderTop: "1px solid #f0faf0", paddingTop: 6 }}>
                {MONTHS.map((m) => (
                  <div key={m} style={{ flex: 1, textAlign: "center", fontSize: 10,
                    color: year === currentYear && m === now.getMonth() + 1 ? "#059669" : "#9ca3af",
                    fontWeight: year === currentYear && m === now.getMonth() + 1 ? 700 : 400 }}>
                    {m}月
                  </div>
                ))}
              </div>
            </div>

            {/* 月別サマリーテーブル */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
              <div style={{ background: "#ecfdf5", padding: "8px 16px", borderBottom: "1px solid #d1fae5",
                fontSize: 11, fontWeight: 700, color: "#065f46" }}>
                月別データ一覧
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                  <thead>
                    <tr style={{ background: "#f8fdf8" }}>
                      <th style={{ padding: "7px 10px", fontSize: 9, fontWeight: 700, color: "#6b7280",
                        borderBottom: "1px solid #f0faf0", textAlign: "left", width: "6%" }}>月</th>
                      {["売上", "粗利", "粗利率", "件数", "広告費", "広告費率", "前月比"].map((h) => (
                        <th key={h} style={{ padding: "7px 10px", fontSize: 9, fontWeight: 700,
                          color: "#6b7280", borderBottom: "1px solid #f0faf0", textAlign: "right" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totals = MONTHS.reduce((acc, m) => {
                        const data = monthlyData[m];
                        if (!data) return acc;
                        const { entries: me, summary: ms } = data;
                        const endDate = new Date(year, m - 1, getDaysInMonth(year, m));
                        const s = calculateDashboard(me, year, m, endDate);
                        const revenue = ms ? Number(ms.total_revenue ?? 0) : s.totalRevenue;
                        const profit = ms ? Number(ms.total_profit ?? 0) : s.totalProfit;
                        const count = ms ? Number(ms.total_count ?? 0) : s.totalCount;
                        const adCost = ms ? Number(ms.ad_cost ?? 0) : s.totalAdCost;
                        return {
                          revenue: acc.revenue + revenue, profit: acc.profit + profit,
                          count: acc.count + count, adCost: acc.adCost + adCost,
                        };
                      }, { revenue: 0, profit: 0, count: 0, adCost: 0 });
                      const totalProfitRate = totals.revenue > 0 ? (totals.profit / totals.revenue * 100).toFixed(1) : "\u2014";
                      const totalAdRate = totals.revenue > 0 ? (totals.adCost / totals.revenue * 100).toFixed(1) : "\u2014";
                      return (
                        <tr style={{ background: "#f0fdf4", borderBottom: "2px solid #d1fae5" }}>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 800, color: "#065f46" }}>合計</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 800, color: "#065f46", textAlign: "right" }}>
                            {totals.revenue > 0 ? yen(totals.revenue) : "\u2014"}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 800, color: "#059669", textAlign: "right" }}>
                            {totals.profit > 0 ? yen(totals.profit) : "\u2014"}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 800, textAlign: "right",
                            color: Number(totalProfitRate) >= 25 ? "#059669" : Number(totalProfitRate) >= 15 ? "#d97706" : "#dc2626" }}>
                            {totalProfitRate !== "\u2014" ? `${totalProfitRate}%` : "\u2014"}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 800, color: "#065f46", textAlign: "right" }}>
                            {totals.count > 0 ? `${totals.count}件` : "\u2014"}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 800, color: "#d97706", textAlign: "right" }}>
                            {totals.adCost > 0 ? yen(totals.adCost) : "\u2014"}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 800, textAlign: "right",
                            color: Number(totalAdRate) <= 20 ? "#059669" : Number(totalAdRate) <= 30 ? "#d97706" : "#dc2626" }}>
                            {totalAdRate !== "\u2014" ? `${totalAdRate}%` : "\u2014"}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: "#9ca3af", textAlign: "right" }}>{"\u2014"}</td>
                        </tr>
                      );
                    })()}
                    {MONTHS.map((m, i) => {
                      const data = monthlyData[m];
                      if (!data) return null;
                      const { entries, summary: ms } = data;
                      const endDate = new Date(year, m - 1, getDaysInMonth(year, m));
                      const s = calculateDashboard(entries, year, m, endDate);
                      const revenue = ms ? Number(ms.total_revenue ?? 0) : s.totalRevenue;
                      const profit = ms ? Number(ms.total_profit ?? 0) : s.totalProfit;
                      const count = ms ? Number(ms.total_count ?? 0) : s.totalCount;
                      const adCost = ms ? Number(ms.ad_cost ?? 0) : s.totalAdCost;
                      const profitRate = revenue > 0 ? profit / revenue * 100 : 0;
                      const adRate = revenue > 0 ? adCost / revenue * 100 : 0;
                      const hasData = revenue > 0;

                      const prevData = monthlyData[m - 1];
                      let prevRevenue = 0;
                      if (prevData) {
                        const { entries: pe, summary: pms } = prevData;
                        prevRevenue = pms ? Number(pms.total_revenue ?? 0)
                          : calculateDashboard(pe, year, m - 1, new Date(year, m - 2, getDaysInMonth(year, m - 1))).totalRevenue;
                      }
                      const momVal = i > 0 && prevRevenue > 0 && revenue > 0
                        ? Math.round((revenue - prevRevenue) / prevRevenue * 1000) / 10
                        : null;

                      return (
                        <tr key={m} style={{ borderBottom: "1px solid #f5faf5",
                          background: year === currentYear && m === now.getMonth() + 1 ? "#f0fdf4" : "transparent" }}>
                          <td style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700,
                            color: year === currentYear && m === now.getMonth() + 1 ? "#065f46" : "#374151" }}>
                            {m}月
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 11, textAlign: "right",
                            color: hasData ? "#111" : "#d1d5db", fontWeight: hasData ? 700 : 400 }}>
                            {hasData ? yen(revenue) : "\u2014"}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 11, textAlign: "right",
                            color: hasData ? "#059669" : "#d1d5db", fontWeight: hasData ? 700 : 400 }}>
                            {hasData ? yen(profit) : "\u2014"}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 11, textAlign: "right",
                            color: hasData ? (profitRate >= 25 ? "#059669" : profitRate >= 15 ? "#d97706" : "#dc2626") : "#d1d5db" }}>
                            {hasData ? `${profitRate.toFixed(1)}%` : "\u2014"}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 11, textAlign: "right",
                            color: hasData ? "#374151" : "#d1d5db" }}>
                            {hasData ? `${count}件` : "\u2014"}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 11, textAlign: "right",
                            color: hasData ? "#d97706" : "#d1d5db" }}>
                            {hasData ? yen(adCost) : "\u2014"}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 11, textAlign: "right",
                            color: hasData ? (adRate <= 20 ? "#059669" : adRate <= 30 ? "#d97706" : "#dc2626") : "#d1d5db" }}>
                            {hasData ? `${adRate.toFixed(1)}%` : "\u2014"}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 11, textAlign: "right",
                            fontWeight: 700,
                            color: momVal === null ? "#d1d5db" : momVal >= 0 ? "#059669" : "#dc2626" }}>
                            {momVal === null ? "\u2014" : `${momVal >= 0 ? "+" : ""}${momVal}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
