"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, getDaysInMonth, getDaysElapsed,
  emptyTargets, yen, type DailyEntry, type Targets, type DashboardSummary,
} from "../lib/calculations";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

function calcLanding(actual: number, elapsed: number, dim: number): number {
  if (elapsed <= 0) return 0;
  return Math.round(actual / elapsed * dim);
}

export default function MeetingPage() {
  const [areaId, setAreaId] = useState("kansai");
  const [period, setPeriod] = useState<"10" | "20" | "end">("10");
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Targets>(emptyTargets());
  const [monthlySummary, setMonthlySummary] = useState<Record<string, unknown> | null>(null);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  const daysElapsed = period === "10" ? 10 : period === "20" ? 20 : daysInMonth;
  const areaName = AREAS.find((a) => a.id === areaId)?.name ?? "";

  useEffect(() => {
    fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((j) => setEntries(j.entries ?? []));
    fetch(`/api/targets?area=${areaId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
      .then((j) => setTargets({ ...emptyTargets(), ...j.targets }));
    fetch(`/api/monthly-summary?area=${areaId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { summary: null }))
      .then((j) => setMonthlySummary(j.summary ?? null));
  }, [areaId, year, month]);

  const isPastMonth = monthlySummary !== null && entries.length === 0;

  const filteredEntries = useMemo(() => {
    if (period === "end") return entries;
    const limit = Number(period);
    return entries.filter((e) => {
      const day = parseInt(e.date.split("-")[2], 10);
      return day <= limit;
    });
  }, [entries, period]);

  const rawSummary = useMemo(
    () => calculateDashboard(filteredEntries, year, month, new Date(year, month - 1, daysElapsed)),
    [filteredEntries, year, month, daysElapsed]
  );

  const summary: DashboardSummary = useMemo(() => {
    if (!monthlySummary || rawSummary.totalRevenue > 0) return rawSummary;
    const ms = monthlySummary;
    const dim = getDaysInMonth(year, month);
    return {
      ...rawSummary,
      totalRevenue: Number(ms.total_revenue ?? 0),
      totalProfit: Number(ms.total_profit ?? 0),
      totalCount: Number(ms.total_count ?? 0),
      totalAdCost: Number(ms.ad_cost ?? 0),
      companyUnitPrice: Number(ms.unit_price ?? 0),
      constructionRate: Number(ms.construction_rate ?? 0),
      helpRate: 0,
      help: { revenue: Number(ms.help_revenue ?? 0), profit: 0, count: Number(ms.help_count ?? 0),
        unitPrice: Number(ms.help_count) > 0 ? Math.round(Number(ms.help_revenue) / Number(ms.help_count)) : 0 },
      totalLaborCost: 0, totalMaterialCost: 0,
      daysElapsed: dim, daysInMonth: dim,
      grossMargin: Number(ms.profit_rate ?? 0),
    };
  }, [rawSummary, monthlySummary, year, month]);

  // overrides for past months
  const callCount = isPastMonth
    ? Number(monthlySummary!.call_count ?? 0)
    : filteredEntries.reduce((s, e) => s + (e.insourceCount ?? 0) + (e.outsourceCount ?? 0), 0);
  const acquisitionCount = isPastMonth ? Number(monthlySummary!.acquisition_count ?? 0) : summary.totalCount;
  const callUnitPrice = isPastMonth ? Number(monthlySummary!.call_unit_price ?? 0) : (callCount > 0 ? Math.round(summary.totalAdCost / callCount) : 0);
  const cpa = isPastMonth ? Number(monthlySummary!.cpa ?? 0) : (acquisitionCount > 0 ? Math.round(summary.totalAdCost / acquisitionCount) : 0);
  const convRate = isPastMonth ? Number(monthlySummary!.conv_rate ?? 0) : (callCount > 0 ? (acquisitionCount / callCount) * 100 : 0);
  const adRate = summary.totalRevenue > 0 ? (summary.totalAdCost / summary.totalRevenue) * 100 : 0;
  const grossRate = summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;
  const targetGrossRate = targets.targetSales > 0 ? (targets.targetProfit / targets.targetSales) * 100 : 0;

  const showLanding = !isPastMonth && period !== "end";

  // format helpers
  const fmtYen = (v: number) => yen(v);
  const fmtCount = (v: number) => `${v}件`;
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  type Row = {
    label: string; color: string; actual: number; target: number;
    fmt: (v: number) => string; isRate?: boolean;
  };

  const section1: Row[] = [
    { label: "全体売上", color: "#059669", actual: summary.totalRevenue, target: targets.targetSales, fmt: fmtYen },
    { label: "全体粗利", color: "#059669", actual: summary.totalProfit, target: targets.targetProfit, fmt: fmtYen },
    { label: "粗利率", color: "#059669", actual: grossRate, target: targetGrossRate, fmt: fmtPct, isRate: true },
    { label: "獲得件数", color: "#3b82f6", actual: summary.totalCount, target: targets.targetCount, fmt: fmtCount },
    { label: "客単価", color: "#3b82f6", actual: summary.companyUnitPrice, target: targets.targetUnitPrice, fmt: fmtYen, isRate: true },
  ];
  const section2: Row[] = [
    { label: "HELP売上", color: "#0891b2", actual: summary.help.revenue, target: targets.targetHelpSales, fmt: fmtYen },
    { label: "HELP件数", color: "#0891b2", actual: summary.help.count, target: targets.targetHelpCount, fmt: fmtCount },
    { label: "HELP客単価", color: "#0891b2", actual: summary.help.unitPrice, target: targets.targetHelpUnitPrice, fmt: fmtYen, isRate: true },
    { label: "HELP率", color: "#0891b2", actual: summary.helpRate ?? 0, target: targets.targetHelpRate, fmt: fmtPct, isRate: true },
  ];
  const section3: Row[] = [
    { label: "広告費", color: "#d97706", actual: summary.totalAdCost, target: targets.targetAdCost, fmt: fmtYen },
    { label: "広告費率", color: "#d97706", actual: adRate, target: targets.targetAdRate, fmt: fmtPct, isRate: true },
    { label: "入電件数", color: "#3b82f6", actual: callCount, target: targets.targetCallCount, fmt: fmtCount },
    { label: "入電単価", color: "#d97706", actual: callUnitPrice, target: targets.targetCallUnitPrice, fmt: fmtYen, isRate: true },
    { label: "獲得単価(CPA)", color: "#d97706", actual: cpa, target: targets.targetCpa, fmt: fmtYen, isRate: true },
    { label: "工事取得率", color: "#059669", actual: summary.constructionRate, target: targets.targetConstructionRate, fmt: fmtPct, isRate: true },
    { label: "成約率", color: "#059669", actual: convRate, target: targets.targetConversionRate, fmt: fmtPct, isRate: true },
  ];

  function renderSection(title: string, rows: Row[]) {
    return (
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #d1fae5", overflow: "hidden" }}>
        <div style={{ background: "#ecfdf5", padding: "7px 12px", borderBottom: "1px solid #d1fae5",
          fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {title}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "16%" }} />
            {showLanding && <col style={{ width: "16%" }} />}
            <col style={{ width: "12%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: showLanding ? "18%" : "34%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#f8fdf8" }}>
              {["指標", "実績", ...(showLanding ? ["着地予測"] : []), "達成率", "目標差", "目標/日"].map((h) => (
                <th key={h} style={{ padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#9ca3af",
                  textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #f0faf0",
                  textAlign: h === "指標" ? "left" : "right" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const landing = row.isRate ? row.actual : calcLanding(row.actual, daysElapsed, daysInMonth);
              const gap = row.target > 0 ? landing - row.target : null;
              const pct = row.target > 0 ? Math.round(landing / row.target * 100) : null;
              const daily = !row.isRate && daysInMonth > 0 ? Math.round(row.target / daysInMonth) : null;
              const gapColor = gap === null ? "#9ca3af" : gap >= 0 ? "#059669" : "#dc2626";
              return (
                <tr key={row.label} style={{ borderBottom: "1px solid #f5faf5" }}>
                  <td style={{ padding: "9px 8px", fontSize: 13, fontWeight: 600, color: "#374151",
                    borderLeft: `3px solid ${row.color}`, paddingLeft: 10 }}>{row.label}</td>
                  <td style={{ padding: "9px 8px", fontSize: 13, fontWeight: 700, color: "#111", textAlign: "right" }}>
                    {row.fmt(row.actual)}
                  </td>
                  {showLanding && (
                    <td style={{ padding: "9px 8px", fontSize: 13, fontWeight: 700, color: "#059669", textAlign: "right" }}>
                      {row.isRate ? "\u2014" : row.fmt(landing)}
                    </td>
                  )}
                  <td style={{ padding: "9px 8px", textAlign: "right" }}>
                    {pct !== null ? (
                      <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "2px 7px",
                        background: pct >= 100 ? "#d1fae5" : pct >= 80 ? "#fef9c3" : "#fee2e2",
                        color: pct >= 100 ? "#065f46" : pct >= 80 ? "#854d0e" : "#991b1b" }}>
                        {pct}%
                      </span>
                    ) : <span style={{ color: "#d1d5db", fontSize: 11 }}>未設定</span>}
                  </td>
                  <td style={{ padding: "9px 8px", fontSize: 12, fontWeight: 700, color: gapColor, textAlign: "right" }}>
                    {gap === null ? "\u2014" : `${gap >= 0 ? "+" : ""}${row.fmt(gap)}`}
                  </td>
                  <td style={{ padding: "9px 8px", fontSize: 12, color: "#9ca3af", textAlign: "right" }}>
                    {daily && row.target > 0 ? `${row.fmt(daily)}/日` : "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // department section
  const ratio = daysElapsed > 0 ? daysInMonth / daysElapsed : 0;
  const depts = [
    { name: "自社施工", color: "#059669", d: summary.self },
    { name: "新規営業", color: "#3b82f6", d: summary.newSales },
    { name: "ヘルプ", color: "#0891b2", d: summary.help },
  ];
  const deptTotal = {
    revenue: depts.reduce((s, x) => s + x.d.revenue, 0),
    profit: depts.reduce((s, x) => s + x.d.profit, 0),
    count: depts.reduce((s, x) => s + x.d.count, 0),
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100">
      <header style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 8, fontSize: 13, background: "rgba(255,255,255,0.12)",
              color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>
            {AREAS.map((a) => <option key={a.id} value={a.id} style={{ color: "#111" }}>{a.name}</option>)}
          </select>
          <div className="flex gap-2">
            {([
              { key: "10" as const, label: "10日" },
              { key: "20" as const, label: "20日" },
              { key: "end" as const, label: "末日" },
            ]).map((p) => (
              <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
                style={{ padding: "5px 18px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                  border: "2px solid", cursor: "pointer",
                  borderColor: period === p.key ? "#fff" : "rgba(255,255,255,0.45)",
                  background: period === p.key ? "#fff" : "transparent",
                  color: period === p.key ? "#059669" : "rgba(255,255,255,0.85)" }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-6 pb-4">
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>10日会議シート</h1>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
            {year}年{month}月 ／ {areaName} ／ 1〜{period === "end" ? daysInMonth : period}日
            {isPastMonth && <span style={{ marginLeft: 8, fontSize: 11, background: "rgba(255,255,255,0.2)", borderRadius: 4, padding: "2px 8px" }}>過去データ</span>}
            {showLanding && <span style={{ marginLeft: 8, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>（着地予測：{period}日ペースで計算）</span>}
          </div>
        </div>
      </header>

      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          {renderSection("売上・粗利・件数", section1)}
          {renderSection("広告・効率指標", section3)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {renderSection("HELP部門", section2)}

          {/* 部門別実績 */}
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #d1fae5", overflow: "hidden" }}>
            <div style={{ background: "#ecfdf5", padding: "7px 12px", borderBottom: "1px solid #d1fae5",
              fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              部門別実績
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "14%" }} /><col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} /><col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "8%" }} /><col style={{ width: "8%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#f8fdf8" }}>
                  {["部門", "売上", showLanding ? "売上(予測)" : "", "粗利", showLanding ? "粗利(予測)" : "", "客単価", "件数", "粗利率"]
                    .filter(Boolean)
                    .map((h) => (
                    <th key={h} style={{ padding: "6px 6px", fontSize: 9, fontWeight: 700, color: "#9ca3af",
                      textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f0faf0",
                      textAlign: h === "部門" ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {depts.map(({ name, color, d }) => {
                  const margin = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={name} style={{ borderBottom: "1px solid #f5faf5" }}>
                      <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700,
                        borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>{name}</td>
                      <td style={{ padding: "7px 6px", fontSize: 11, textAlign: "right" }}>{yen(d.revenue)}</td>
                      {showLanding && <td style={{ padding: "7px 6px", fontSize: 11, textAlign: "right", color: "#059669", fontWeight: 700 }}>{yen(Math.round(d.revenue * ratio))}</td>}
                      <td style={{ padding: "7px 6px", fontSize: 11, textAlign: "right" }}>{yen(d.profit)}</td>
                      {showLanding && <td style={{ padding: "7px 6px", fontSize: 11, textAlign: "right", color: "#059669", fontWeight: 700 }}>{yen(Math.round(d.profit * ratio))}</td>}
                      <td style={{ padding: "7px 6px", fontSize: 11, textAlign: "right" }}>{yen(d.unitPrice)}</td>
                      <td style={{ padding: "7px 6px", fontSize: 11, textAlign: "right" }}>{d.count}件</td>
                      <td style={{ padding: "7px 6px", fontSize: 11, textAlign: "right" }}>{margin}%</td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#f0fdf4" }}>
                  <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, color: "#065f46",
                    borderLeft: "3px solid #059669", paddingLeft: 8 }}>合計</td>
                  <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "right" }}>{yen(deptTotal.revenue)}</td>
                  {showLanding && <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, color: "#059669", textAlign: "right" }}>{yen(Math.round(deptTotal.revenue * ratio))}</td>}
                  <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "right" }}>{yen(deptTotal.profit)}</td>
                  {showLanding && <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, color: "#059669", textAlign: "right" }}>{yen(Math.round(deptTotal.profit * ratio))}</td>}
                  <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, textAlign: "right" }}>{yen(deptTotal.count > 0 ? Math.round(deptTotal.revenue / deptTotal.count) : 0)}</td>
                  <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, textAlign: "right" }}>{deptTotal.count}件</td>
                  <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, textAlign: "right" }}>{deptTotal.revenue > 0 ? ((deptTotal.profit / deptTotal.revenue) * 100).toFixed(1) : "0.0"}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
