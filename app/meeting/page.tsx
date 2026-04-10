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

type Period = "10日" | "20日" | "末日";

type MeetingRow = {
  name: string;
  lineColor: string;
  actual: string;
  forecast: string;
  achievement: number | null;
  diff: string | null;
  diffPositive: boolean;
  guide: string | null;
};

export default function MeetingPage() {
  const [areaId, setAreaId] = useState("kansai");
  const [period, setPeriod] = useState<Period>("10日");
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Targets>(emptyTargets());
  const [monthlySummary, setMonthlySummary] = useState<Record<string, unknown> | null>(null);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  const daysElapsed = period === "10日" ? 10 : period === "20日" ? 20 : getDaysElapsed(now, year, month);
  const remainDays = daysInMonth - daysElapsed;
  const periodLabel = period === "10日" ? "1〜10日" : period === "20日" ? "1〜20日" : `1〜${daysElapsed}日`;
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

  const filteredEntries = useMemo(() => {
    if (period === "末日") return entries;
    const limit = period === "10日" ? 10 : 20;
    return entries.filter((e) => {
      const day = parseInt(e.date.split("-")[2], 10);
      return day <= limit;
    });
  }, [entries, period]);

  const rawSummary = useMemo(
    () => calculateDashboard(filteredEntries, year, month, new Date(year, month - 1, daysElapsed)),
    [filteredEntries, year, month, daysElapsed]
  );

  const summary = useMemo(() => {
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
      help: {
        revenue: Number(ms.help_revenue ?? 0),
        profit: 0,
        count: Number(ms.help_count ?? 0),
        unitPrice: Number(ms.help_count) > 0
          ? Math.round(Number(ms.help_revenue) / Number(ms.help_count))
          : 0,
      },
      totalLaborCost: 0,
      totalMaterialCost: 0,
      daysElapsed: dim,
      daysInMonth: dim,
      grossMargin: Number(ms.profit_rate ?? 0),
    };
  }, [rawSummary, monthlySummary, year, month]);

  // ============ 共通計算 ============
  const forecastVal = (actual: number) =>
    daysElapsed > 0 ? Math.round((actual / daysElapsed) * daysInMonth) : 0;
  const achievePct = (forecast: number, target: number) =>
    target > 0 ? Math.round((forecast / target) * 1000) / 10 : null;
  const diffStr = (forecast: number, target: number, isYen = true): string | null => {
    if (target <= 0) return null;
    const d = forecast - target;
    const prefix = d >= 0 ? "+" : "−";
    const abs = Math.abs(d);
    return `${prefix}${isYen ? yen(abs) : abs.toFixed(1) + "%"}`;
  };
  const guideStr = (target: number, actual: number, isYen = true, unit = ""): string | null => {
    if (target <= 0 || remainDays <= 0) return null;
    const need = (target - actual) / remainDays;
    if (need <= 0) return "このまま達成";
    return isYen ? `あと${yen(Math.round(need))}/日` : `あと${need.toFixed(1)}${unit}/日`;
  };

  // ============ 行データ ============
  const adRate = summary.totalRevenue > 0 ? (summary.totalAdCost / summary.totalRevenue) * 100 : 0;
  const grossRate = summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;
  const targetGrossRate = targets.targetSales > 0 ? (targets.targetProfit / targets.targetSales) * 100 : 0;

  const section1Rows: MeetingRow[] = [
    {
      name: "全体売上", lineColor: "#059669",
      actual: yen(summary.totalRevenue),
      forecast: yen(forecastVal(summary.totalRevenue)),
      achievement: achievePct(forecastVal(summary.totalRevenue), targets.targetSales),
      diff: diffStr(forecastVal(summary.totalRevenue), targets.targetSales),
      diffPositive: forecastVal(summary.totalRevenue) >= targets.targetSales,
      guide: guideStr(targets.targetSales, summary.totalRevenue),
    },
    {
      name: "全体粗利", lineColor: "#059669",
      actual: yen(summary.totalProfit),
      forecast: yen(forecastVal(summary.totalProfit)),
      achievement: achievePct(forecastVal(summary.totalProfit), targets.targetProfit),
      diff: diffStr(forecastVal(summary.totalProfit), targets.targetProfit),
      diffPositive: forecastVal(summary.totalProfit) >= targets.targetProfit,
      guide: guideStr(targets.targetProfit, summary.totalProfit),
    },
    {
      name: "粗利率", lineColor: "#059669",
      actual: `${grossRate.toFixed(1)}%`,
      forecast: `${grossRate.toFixed(1)}%`,
      achievement: targetGrossRate > 0 ? Math.round((grossRate / targetGrossRate) * 1000) / 10 : null,
      diff: targetGrossRate > 0 ? `${grossRate >= targetGrossRate ? "+" : "−"}${Math.abs(grossRate - targetGrossRate).toFixed(1)}%` : null,
      diffPositive: grossRate >= targetGrossRate,
      guide: null,
    },
    {
      name: "獲得件数", lineColor: "#3b82f6",
      actual: `${summary.totalCount}件`,
      forecast: `${forecastVal(summary.totalCount)}件`,
      achievement: achievePct(forecastVal(summary.totalCount), targets.targetCount),
      diff: targets.targetCount > 0 ? `${forecastVal(summary.totalCount) >= targets.targetCount ? "+" : "−"}${Math.abs(forecastVal(summary.totalCount) - targets.targetCount)}件` : null,
      diffPositive: forecastVal(summary.totalCount) >= targets.targetCount,
      guide: targets.targetCount > 0 && remainDays > 0 ? `あと${Math.ceil((targets.targetCount - summary.totalCount) / remainDays)}件/日` : null,
    },
    {
      name: "客単価", lineColor: "#3b82f6",
      actual: yen(summary.companyUnitPrice),
      forecast: yen(summary.companyUnitPrice),
      achievement: targets.targetUnitPrice > 0 ? Math.round((summary.companyUnitPrice / targets.targetUnitPrice) * 1000) / 10 : null,
      diff: targets.targetUnitPrice > 0 ? diffStr(summary.companyUnitPrice, targets.targetUnitPrice) : null,
      diffPositive: summary.companyUnitPrice >= targets.targetUnitPrice,
      guide: null,
    },
    {
      name: "対応件数", lineColor: "#3b82f6",
      actual: `${summary.totalCount}件`,
      forecast: `${forecastVal(summary.totalCount)}件`,
      achievement: achievePct(forecastVal(summary.totalCount), targets.targetCount),
      diff: targets.targetCount > 0 ? `${forecastVal(summary.totalCount) >= targets.targetCount ? "+" : "−"}${Math.abs(forecastVal(summary.totalCount) - targets.targetCount)}件` : null,
      diffPositive: forecastVal(summary.totalCount) >= targets.targetCount,
      guide: null,
    },
  ];

  const section2Rows: MeetingRow[] = [
    {
      name: "HELP売上", lineColor: "#0891b2",
      actual: yen(summary.help.revenue),
      forecast: yen(forecastVal(summary.help.revenue)),
      achievement: achievePct(forecastVal(summary.help.revenue), targets.targetHelpSales),
      diff: diffStr(forecastVal(summary.help.revenue), targets.targetHelpSales),
      diffPositive: forecastVal(summary.help.revenue) >= targets.targetHelpSales,
      guide: guideStr(targets.targetHelpSales, summary.help.revenue),
    },
    {
      name: "HELP件数", lineColor: "#0891b2",
      actual: `${summary.help.count}件`,
      forecast: `${forecastVal(summary.help.count)}件`,
      achievement: achievePct(forecastVal(summary.help.count), targets.targetHelpCount),
      diff: targets.targetHelpCount > 0 ? `${forecastVal(summary.help.count) >= targets.targetHelpCount ? "+" : "−"}${Math.abs(forecastVal(summary.help.count) - targets.targetHelpCount)}件` : null,
      diffPositive: forecastVal(summary.help.count) >= targets.targetHelpCount,
      guide: targets.targetHelpCount > 0 && remainDays > 0 ? `あと${Math.ceil((targets.targetHelpCount - summary.help.count) / remainDays)}件/日` : null,
    },
    {
      name: "HELP客単価", lineColor: "#0891b2",
      actual: yen(summary.help.unitPrice),
      forecast: yen(summary.help.unitPrice),
      achievement: targets.targetHelpUnitPrice > 0 ? Math.round((summary.help.unitPrice / targets.targetHelpUnitPrice) * 1000) / 10 : null,
      diff: diffStr(summary.help.unitPrice, targets.targetHelpUnitPrice),
      diffPositive: summary.help.unitPrice >= targets.targetHelpUnitPrice,
      guide: null,
    },
    {
      name: "HELP率", lineColor: "#0891b2",
      actual: `${summary.helpRate.toFixed(1)}%`,
      forecast: `${summary.helpRate.toFixed(1)}%`,
      achievement: targets.targetHelpRate > 0 ? Math.round((summary.helpRate / targets.targetHelpRate) * 1000) / 10 : null,
      diff: targets.targetHelpRate > 0 ? `${summary.helpRate >= targets.targetHelpRate ? "+" : "−"}${Math.abs(summary.helpRate - targets.targetHelpRate).toFixed(1)}%` : null,
      diffPositive: summary.helpRate >= targets.targetHelpRate,
      guide: null,
    },
  ];

  const callCount = monthlySummary && rawSummary.totalRevenue === 0
    ? Number(monthlySummary.call_count ?? 0)
    : filteredEntries.reduce((s, e) => s + (e.insourceCount ?? 0) + (e.outsourceCount ?? 0), 0);
  const acquisitionCount = monthlySummary && rawSummary.totalRevenue === 0
    ? Number(monthlySummary.acquisition_count ?? 0)
    : summary.totalCount;
  const callUnitPrice = monthlySummary && rawSummary.totalRevenue === 0
    ? Number(monthlySummary.call_unit_price ?? 0)
    : (callCount > 0 ? Math.round(summary.totalAdCost / callCount) : 0);
  const cpa = monthlySummary && rawSummary.totalRevenue === 0
    ? Number(monthlySummary.cpa ?? 0)
    : (acquisitionCount > 0 ? Math.round(summary.totalAdCost / acquisitionCount) : 0);
  const convRate = monthlySummary && rawSummary.totalRevenue === 0
    ? Number(monthlySummary.conv_rate ?? 0)
    : (callCount > 0 ? (acquisitionCount / callCount) * 100 : 0);

  const section3Rows: MeetingRow[] = [
    {
      name: "広告費", lineColor: "#d97706",
      actual: yen(summary.totalAdCost),
      forecast: yen(forecastVal(summary.totalAdCost)),
      achievement: targets.targetAdCost > 0 ? Math.round((forecastVal(summary.totalAdCost) / targets.targetAdCost) * 1000) / 10 : null,
      diff: diffStr(forecastVal(summary.totalAdCost), targets.targetAdCost),
      diffPositive: forecastVal(summary.totalAdCost) <= targets.targetAdCost,
      guide: null,
    },
    {
      name: "広告費率", lineColor: "#d97706",
      actual: `${adRate.toFixed(1)}%`,
      forecast: `${adRate.toFixed(1)}%`,
      achievement: targets.targetAdRate > 0 ? Math.round((adRate / targets.targetAdRate) * 1000) / 10 : null,
      diff: targets.targetAdRate > 0 ? `${adRate <= targets.targetAdRate ? "−" : "+"}${Math.abs(adRate - targets.targetAdRate).toFixed(1)}%` : null,
      diffPositive: adRate <= targets.targetAdRate,
      guide: null,
    },
    {
      name: "入電件数", lineColor: "#3b82f6",
      actual: `${callCount}件`,
      forecast: `${forecastVal(callCount)}件`,
      achievement: achievePct(forecastVal(callCount), targets.targetCallCount),
      diff: targets.targetCallCount > 0 ? `${forecastVal(callCount) >= targets.targetCallCount ? "+" : "−"}${Math.abs(forecastVal(callCount) - targets.targetCallCount)}件` : null,
      diffPositive: forecastVal(callCount) >= targets.targetCallCount,
      guide: targets.targetCallCount > 0 && remainDays > 0 ? `あと${Math.ceil((targets.targetCallCount - callCount) / remainDays)}件/日` : null,
    },
    {
      name: "入電単価", lineColor: "#d97706",
      actual: yen(callUnitPrice),
      forecast: yen(callUnitPrice),
      achievement: targets.targetCallUnitPrice > 0 ? Math.round((callUnitPrice / targets.targetCallUnitPrice) * 1000) / 10 : null,
      diff: diffStr(callUnitPrice, targets.targetCallUnitPrice),
      diffPositive: callUnitPrice <= targets.targetCallUnitPrice,
      guide: null,
    },
    {
      name: "獲得単価(CPA)", lineColor: "#d97706",
      actual: yen(cpa),
      forecast: yen(cpa),
      achievement: targets.targetCpa > 0 ? Math.round((cpa / targets.targetCpa) * 1000) / 10 : null,
      diff: diffStr(cpa, targets.targetCpa),
      diffPositive: cpa <= targets.targetCpa,
      guide: null,
    },
    {
      name: "工事取得率", lineColor: "#059669",
      actual: `${summary.constructionRate.toFixed(1)}%`,
      forecast: `${summary.constructionRate.toFixed(1)}%`,
      achievement: targets.targetConstructionRate > 0 ? Math.round((summary.constructionRate / targets.targetConstructionRate) * 1000) / 10 : null,
      diff: targets.targetConstructionRate > 0 ? `${summary.constructionRate >= targets.targetConstructionRate ? "+" : "−"}${Math.abs(summary.constructionRate - targets.targetConstructionRate).toFixed(1)}%` : null,
      diffPositive: summary.constructionRate >= targets.targetConstructionRate,
      guide: null,
    },
    {
      name: "成約率", lineColor: "#059669",
      actual: `${convRate.toFixed(1)}%`,
      forecast: `${convRate.toFixed(1)}%`,
      achievement: targets.targetConversionRate > 0 ? Math.round((convRate / targets.targetConversionRate) * 1000) / 10 : null,
      diff: targets.targetConversionRate > 0 ? `${convRate >= targets.targetConversionRate ? "+" : "−"}${Math.abs(convRate - targets.targetConversionRate).toFixed(1)}%` : null,
      diffPositive: convRate >= targets.targetConversionRate,
      guide: null,
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100">
      <header style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            style={{
              padding: "6px 12px", borderRadius: "8px", fontSize: "13px",
              background: "rgba(255,255,255,0.12)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.3)",
            }}
          >
            {AREAS.map((a) => (
              <option key={a.id} value={a.id} style={{ color: "#111" }}>{a.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            {(["10日", "20日", "末日"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                style={{
                  padding: "5px 18px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: 700,
                  border: "2px solid",
                  borderColor: period === p ? "#fff" : "rgba(255,255,255,0.45)",
                  background: period === p ? "#fff" : "transparent",
                  color: period === p ? "#059669" : "rgba(255,255,255,0.85)",
                  cursor: "pointer",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="px-6 pb-4">
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#fff" }}>10日会議シート</h1>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)", marginTop: "3px" }}>
            {year}年{month}月 ／ {areaName} ／ {periodLabel}
          </p>
        </div>
      </header>

      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
          <MetricsSection title="売上・粗利・件数" rows={section1Rows} />
          <MetricsSection title="広告・効率指標" rows={section3Rows} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <MetricsSection title="HELP部門" rows={section2Rows} />
          <DepartmentSection summary={summary} daysElapsed={daysElapsed} daysInMonth={daysInMonth} />
        </div>
      </div>
    </div>
  );
}

function MetricsSection({ title, rows }: { title: string; rows: MeetingRow[] }) {
  return (
    <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #d1fae5", overflow: "hidden" }}>
      <div style={{
        background: "#ecfdf5", padding: "7px 12px", borderBottom: "1px solid #d1fae5",
        fontSize: "11px", fontWeight: 700, color: "#065f46",
        textTransform: "uppercase", letterSpacing: "0.07em",
      }}>
        {title}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "22%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "22%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#f8fdf8" }}>
            {["指標", "実績", "着地予測", "見込み", "目標差", "1日の目安"].map((h) => (
              <th key={h} style={{
                padding: "6px 8px", fontSize: "9px", fontWeight: 700,
                color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em",
                borderBottom: "1px solid #f0faf0",
                textAlign: h === "指標" ? "left" : "right",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f5faf5" }}>
              <td style={{
                padding: "7px 8px", fontSize: "12px", fontWeight: 700, color: "#111",
                borderLeft: `3px solid ${row.lineColor}`, paddingLeft: "10px",
              }}>{row.name}</td>
              <td style={{ padding: "7px 8px", fontSize: "11px", fontWeight: 700, color: "#111", textAlign: "right" }}>{row.actual}</td>
              <td style={{ padding: "7px 8px", fontSize: "11px", fontWeight: 700, color: "#059669", textAlign: "right" }}>{row.forecast}</td>
              <td style={{ padding: "7px 8px", textAlign: "right" }}>
                {row.achievement !== null ? (
                  <span style={{
                    display: "inline-block", fontSize: "9px", fontWeight: 700,
                    borderRadius: "3px", padding: "1px 5px",
                    background: row.achievement >= 100 ? "#d1fae5" : row.achievement >= 90 ? "#fef9c3" : row.achievement >= 80 ? "#ffedd5" : "#fee2e2",
                    color: row.achievement >= 100 ? "#064e3b" : row.achievement >= 90 ? "#713f12" : row.achievement >= 80 ? "#7c2d12" : "#7f1d1d",
                  }}>{row.achievement.toFixed(0)}%</span>
                ) : <span style={{ color: "#d1d5db", fontSize: "9px" }}>—</span>}
              </td>
              <td style={{
                padding: "7px 8px", fontSize: "11px", fontWeight: 700, textAlign: "right",
                color: row.diff == null ? "#d1d5db" : row.diffPositive ? "#059669" : "#dc2626",
              }}>{row.diff ?? "—"}</td>
              <td style={{
                padding: "7px 8px", fontSize: "10px", textAlign: "right",
                color: row.achievement === null ? "#d1d5db"
                  : row.achievement >= 100 ? "#059669"
                  : row.achievement >= 80 ? "#d97706"
                  : "#dc2626",
              }}>{row.guide ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DepartmentSection({
  summary, daysElapsed, daysInMonth,
}: { summary: DashboardSummary; daysElapsed: number; daysInMonth: number }) {
  const ratio = daysElapsed > 0 ? daysInMonth / daysElapsed : 0;
  const depts = [
    { name: "自社施工", color: "#059669", d: summary.self },
    { name: "新規営業", color: "#3b82f6", d: summary.newSales },
    { name: "ヘルプ", color: "#0891b2", d: summary.help },
  ];
  const total = {
    revenue: depts.reduce((s, x) => s + x.d.revenue, 0),
    profit: depts.reduce((s, x) => s + x.d.profit, 0),
    count: depts.reduce((s, x) => s + x.d.count, 0),
  };
  return (
    <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #d1fae5", overflow: "hidden" }}>
      <div style={{
        background: "#ecfdf5", padding: "7px 12px", borderBottom: "1px solid #d1fae5",
        fontSize: "11px", fontWeight: 700, color: "#065f46",
        textTransform: "uppercase", letterSpacing: "0.07em",
      }}>
        部門別実績
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "16%" }} />
          <col style={{ width: "13%" }} /><col style={{ width: "13%" }} />
          <col style={{ width: "13%" }} /><col style={{ width: "13%" }} />
          <col style={{ width: "13%" }} /><col style={{ width: "8%" }} /><col style={{ width: "11%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#f8fdf8" }}>
            {["部門", "売上(実績)", "売上(予測)", "粗利(実績)", "粗利(予測)", "客単価", "件数", "粗利率"].map((h) => (
              <th key={h} style={{
                padding: "6px 6px", fontSize: "9px", fontWeight: 700, color: "#9ca3af",
                textTransform: "uppercase", letterSpacing: "0.05em",
                borderBottom: "1px solid #f0faf0",
                textAlign: h === "部門" ? "left" : "right",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {depts.map(({ name, color, d }) => {
            const fRevenue = Math.round(d.revenue * ratio);
            const fProfit = Math.round(d.profit * ratio);
            const margin = d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0";
            return (
              <tr key={name} style={{ borderBottom: "1px solid #f5faf5" }}>
                <td style={{
                  padding: "7px 6px", fontSize: "11px", fontWeight: 700,
                  borderLeft: `3px solid ${color}`, paddingLeft: "8px",
                }}>{name}</td>
                <td style={{ padding: "7px 6px", fontSize: "11px", textAlign: "right" }}>{yen(d.revenue)}</td>
                <td style={{ padding: "7px 6px", fontSize: "11px", textAlign: "right", color: "#059669", fontWeight: 700 }}>{yen(fRevenue)}</td>
                <td style={{ padding: "7px 6px", fontSize: "11px", textAlign: "right" }}>{yen(d.profit)}</td>
                <td style={{ padding: "7px 6px", fontSize: "11px", textAlign: "right", color: "#059669", fontWeight: 700 }}>{yen(fProfit)}</td>
                <td style={{ padding: "7px 6px", fontSize: "11px", textAlign: "right" }}>{yen(d.unitPrice)}</td>
                <td style={{ padding: "7px 6px", fontSize: "11px", textAlign: "right" }}>{d.count}件</td>
                <td style={{ padding: "7px 6px", fontSize: "11px", textAlign: "right" }}>{margin}%</td>
              </tr>
            );
          })}
          <tr style={{ background: "#f0fdf4" }}>
            <td style={{
              padding: "7px 6px", fontSize: "11px", fontWeight: 700, color: "#065f46",
              borderLeft: "3px solid #059669", paddingLeft: "8px",
            }}>合計</td>
            <td style={{ padding: "7px 6px", fontSize: "11px", fontWeight: 700, color: "#065f46", textAlign: "right" }}>{yen(total.revenue)}</td>
            <td style={{ padding: "7px 6px", fontSize: "11px", fontWeight: 700, color: "#059669", textAlign: "right" }}>{yen(Math.round(total.revenue * ratio))}</td>
            <td style={{ padding: "7px 6px", fontSize: "11px", fontWeight: 700, color: "#065f46", textAlign: "right" }}>{yen(total.profit)}</td>
            <td style={{ padding: "7px 6px", fontSize: "11px", fontWeight: 700, color: "#059669", textAlign: "right" }}>{yen(Math.round(total.profit * ratio))}</td>
            <td style={{ padding: "7px 6px", fontSize: "11px", fontWeight: 700, textAlign: "right" }}>{yen(total.count > 0 ? Math.round(total.revenue / total.count) : 0)}</td>
            <td style={{ padding: "7px 6px", fontSize: "11px", fontWeight: 700, textAlign: "right" }}>{total.count}件</td>
            <td style={{ padding: "7px 6px", fontSize: "11px", fontWeight: 700, textAlign: "right" }}>{total.revenue > 0 ? ((total.profit / total.revenue) * 100).toFixed(1) : "0.0"}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
