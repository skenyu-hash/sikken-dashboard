"use client";
import { useEffect, useMemo, useState } from "react";
import { calculateDashboard, getDaysInMonth, yen } from "../lib/calculations";
import type { DailyEntry, Targets } from "../lib/calculations";
import { BUSINESSES, AREA_NAMES, type BusinessCategory } from "../lib/businesses";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from "recharts";

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
  const [monthlyTargets, setMonthlyTargets] = useState<Record<number, Targets | null>>({});
  const [loading, setLoading] = useState(false);

  // 全エリア×全月一覧（Summary統合）
  type GridCell = { revenue: number; targetSales: number } | null;
  const [gridYearFilter, setGridYearFilter] = useState<"2025" | "2026" | "all">(String(currentYear) as "2025" | "2026");
  const [gridData, setGridData] = useState<Record<string, Record<string, GridCell>>>({});
  const [gridLoading, setGridLoading] = useState(false);

  const gridMonths = useMemo(() => {
    const list: { y: number; m: number; key: string; label: string }[] = [];
    const fromY = gridYearFilter === "all" ? 2025 : Number(gridYearFilter);
    const toY = gridYearFilter === "all" ? currentYear : Number(gridYearFilter);
    for (let y = fromY; y <= toY; y++) {
      const endM = y === currentYear ? now.getMonth() + 1 : 12;
      for (let m = 1; m <= endM; m++) {
        list.push({ y, m, key: `${y}-${m}`, label: gridYearFilter === "all" ? `${y % 100}/${m}` : `${m}月` });
      }
    }
    return list;
  }, [gridYearFilter, currentYear, now]);

  useEffect(() => {
    setGridLoading(true);
    const tasks: Promise<{ areaId: string; key: string; cell: GridCell }>[] = [];
    for (const a of businessAreas) {
      for (const { y, m, key } of gridMonths) {
        tasks.push((async () => {
          const [sumRes, tgtRes] = await Promise.all([
            fetch(`/api/monthly-summary?area=${a.id}&year=${y}&month=${m}&category=${activeBusiness}`)
              .then(r => r.ok ? r.json() : { summary: null }),
            fetch(`/api/targets?area=${a.id}&year=${y}&month=${m}&category=${activeBusiness}`)
              .then(r => r.ok ? r.json() : { targets: null }),
          ]);
          if (!sumRes.summary) return { areaId: a.id, key, cell: null };
          return {
            areaId: a.id, key,
            cell: {
              revenue: Number(sumRes.summary.total_revenue ?? 0),
              targetSales: Number(tgtRes.targets?.targetSales ?? 0),
            },
          };
        })());
      }
    }
    Promise.all(tasks).then((results) => {
      const map: Record<string, Record<string, GridCell>> = {};
      for (const { areaId, key, cell } of results) {
        if (!map[areaId]) map[areaId] = {};
        map[areaId][key] = cell;
      }
      setGridData(map);
      setGridLoading(false);
    });
  }, [businessAreas, gridMonths, activeBusiness]);

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
        const [eRes, sRes, tRes] = await Promise.all([
          fetch(`/api/entries?area=${areaId}&year=${year}&month=${m}&category=${activeBusiness}`),
          fetch(`/api/monthly-summary?area=${areaId}&year=${year}&month=${m}&category=${activeBusiness}`),
          fetch(`/api/targets?area=${areaId}&year=${year}&month=${m}&category=${activeBusiness}`),
        ]);
        const eJson = eRes.ok ? await eRes.json() : { entries: [] };
        const sJson = sRes.ok ? await sRes.json() : { summary: null };
        const tJson = tRes.ok ? await tRes.json() : { targets: null };
        return [m, { entries: eJson.entries ?? [], summary: sJson.summary }, tJson.targets as Targets | null] as const;
      })
    ).then((triples) => {
      const map: Record<number, { entries: DailyEntry[]; summary: Record<string, unknown> | null }> = {};
      const tmap: Record<number, Targets | null> = {};
      for (const [m, data, targets] of triples) { map[m] = data; tmap[m] = targets; }
      setMonthlyData(map);
      setMonthlyTargets(tmap);
      setLoading(false);
    });
  }, [areaId, year, activeBusiness]);

  // 達成率トレンド用データ
  const achievementChartData = useMemo(() => {
    return MONTHS.map((m) => {
      const data = monthlyData[m];
      const targets = monthlyTargets[m];
      if (!data) return { month: `${m}月`, salesRate: null, profitRate: null, countRate: null };
      const { entries, summary: ms } = data;
      const endDate = new Date(year, m - 1, getDaysInMonth(year, m));
      const s = calculateDashboard(entries, year, m, endDate);
      const revenue = ms ? Number(ms.total_revenue ?? 0) : s.totalRevenue;
      const profit = ms ? Number(ms.total_profit ?? 0) : s.totalProfit;
      const count = ms ? Number(ms.total_count ?? 0) : s.totalCount;
      const salesRate = targets && targets.targetSales > 0
        ? Math.round(revenue / targets.targetSales * 1000) / 10 : null;
      const profitRate = targets && targets.targetProfit > 0
        ? Math.round(profit / targets.targetProfit * 1000) / 10 : null;
      const countRate = targets && targets.targetCount > 0
        ? Math.round(count / targets.targetCount * 1000) / 10 : null;
      return { month: `${m}月`, salesRate, profitRate, countRate };
    });
  }, [monthlyData, monthlyTargets, year]);

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

            {/* 達成率トレンドグラフ */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 16 }}>
                {ALL_AREAS.find((a) => a.id === areaId)?.name} — {year}年 目標達成率トレンド
              </div>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={achievementChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} domain={[0, "auto"]} unit="%" />
                    <Tooltip
                      formatter={(v) => v == null ? "—" : `${v}%`}
                      contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #d1fae5" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={100} stroke="#dc2626" strokeDasharray="4 4" label={{ value: "目標 100%", fontSize: 10, fill: "#dc2626", position: "right" }} />
                    <Line type="monotone" dataKey="salesRate" name="売上達成率" stroke="#059669" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                    <Line type="monotone" dataKey="profitRate" name="粗利達成率" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                    <Line type="monotone" dataKey="countRate" name="件数達成率" stroke="#d97706" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, textAlign: "right" }}>
                ※ 目標未設定の月はラインが途切れます
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

            {/* 全エリア×全月一覧 */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden", marginTop: 16 }}>
              <div style={{ background: "#ecfdf5", padding: "10px 16px", borderBottom: "1px solid #d1fae5",
                display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46" }}>全エリア×全月一覧</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {([
                    { key: "2025" as const, label: "2025年" },
                    { key: "2026" as const, label: "2026年" },
                    { key: "all" as const, label: "全期間" },
                  ]).map((y) => (
                    <button key={y.key} type="button" onClick={() => setGridYearFilter(y.key)}
                      style={{
                        padding: "4px 12px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                        border: `1px solid ${gridYearFilter === y.key ? "#059669" : "#d1fae5"}`,
                        background: gridYearFilter === y.key ? "#059669" : "#fff",
                        color: gridYearFilter === y.key ? "#fff" : "#065f46", cursor: "pointer",
                      }}>
                      {y.label}
                    </button>
                  ))}
                </div>
              </div>
              {gridLoading ? (
                <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 11 }}>データを読み込み中...</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
                    <thead>
                      <tr style={{ background: "#ecfdf5" }}>
                        <th style={{
                          padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#065f46",
                          borderBottom: "1px solid #d1fae5", borderRight: "1px solid #d1fae5",
                          textAlign: "left", position: "sticky", left: 0, background: "#ecfdf5",
                          zIndex: 2, minWidth: 80,
                        }}>エリア</th>
                        {gridMonths.map((mo) => (
                          <th key={mo.key} style={{
                            padding: "10px 8px", fontSize: 10, fontWeight: 700, color: "#065f46",
                            borderBottom: "1px solid #d1fae5", borderRight: "1px solid #f0faf0",
                            textAlign: "center", whiteSpace: "nowrap", minWidth: 80,
                          }}>{mo.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {businessAreas.map((a) => (
                        <tr key={a.id} style={{ borderBottom: "1px solid #f5faf5" }}>
                          <td style={{
                            padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#374151",
                            borderRight: "1px solid #d1fae5",
                            position: "sticky", left: 0, background: "#fff", zIndex: 1,
                          }}>{AREA_NAMES[a.id] ?? a.id}</td>
                          {gridMonths.map((mo) => {
                            const cell = gridData[a.id]?.[mo.key];
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
              )}
              {/* 凡例 */}
              <div style={{ padding: "8px 16px", borderTop: "1px solid #d1fae5",
                display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, alignItems: "center" }}>
                <span style={{ color: "#6b7280", fontWeight: 700 }}>達成率:</span>
                <span style={{ background: "#d1fae5", color: "#065f46", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>100%以上</span>
                <span style={{ background: "#fef9c3", color: "#854d0e", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>80〜99%</span>
                <span style={{ background: "#fee2e2", color: "#991b1b", padding: "1px 6px", borderRadius: 3, fontWeight: 700 }}>80%未満</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
