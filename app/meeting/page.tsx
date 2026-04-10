"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, getDaysInMonth,
  emptyTargets, yen, type DailyEntry, type Targets, type DashboardSummary,
} from "../lib/calculations";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

// ============ ユーティリティ ============
function calcLanding(actual: number, elapsed: number, dim: number): number {
  if (elapsed <= 0 || actual <= 0) return 0;
  return Math.round(actual / elapsed * dim);
}
function calcAchievement(landing: number, target: number): number | null {
  if (target <= 0 || landing <= 0) return null;
  return Math.round(landing / target * 1000) / 10;
}
function calcGap(landing: number, target: number): number | null {
  if (target <= 0) return null;
  return landing - target;
}
function calcDaily(target: number, dim: number): number {
  if (target <= 0 || dim <= 0) return 0;
  return Math.round(target / dim);
}

// ============ MetricRow ============
function MetricRow({ label, actual, target, isEndPeriod, daysElapsed, daysInMonth, format, isRate = false, invertGap = false }: {
  label: string; actual: number; target: number; isEndPeriod: boolean;
  daysElapsed: number; daysInMonth: number; format: (v: number) => string;
  isRate?: boolean; invertGap?: boolean;
}) {
  const landing = isRate ? actual : calcLanding(actual, daysElapsed, daysInMonth);
  const compareVal = isEndPeriod ? actual : landing;
  const achievement = calcAchievement(compareVal, target);
  const gap = calcGap(compareVal, target);
  const daily = calcDaily(target, daysInMonth);

  const achBg = achievement === null ? "#f3f4f6" : achievement >= 100 ? "#d1fae5" : achievement >= 80 ? "#fef9c3" : "#fee2e2";
  const achColor = achievement === null ? "#d1d5db" : achievement >= 100 ? "#065f46" : achievement >= 80 ? "#854d0e" : "#991b1b";
  const gapPositive = invertGap ? (gap !== null && gap <= 0) : (gap !== null && gap >= 0);
  const gapColor = gap === null ? "#9ca3af" : gapPositive ? "#059669" : "#dc2626";

  const td: React.CSSProperties = { padding: "9px 12px", fontSize: 12, textAlign: "right", color: "#374151", borderBottom: "1px solid #f0faf0" };

  return (
    <tr>
      <td style={{ ...td, textAlign: "left", fontWeight: 600, fontSize: 13 }}>{label}</td>
      <td style={{ ...td, fontWeight: 700, color: "#111" }}>{format(actual)}</td>
      <td style={{ ...td, color: "#059669", fontWeight: 700 }}>
        {isEndPeriod || isRate ? "\u2014" : format(landing)}
      </td>
      <td style={td}>
        {achievement !== null ? (
          <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "2px 8px", background: achBg, color: achColor }}>
            {achievement.toFixed(1)}%
          </span>
        ) : <span style={{ color: "#d1d5db", fontSize: 11 }}>未設定</span>}
      </td>
      <td style={{ ...td, fontWeight: 700, color: gapColor }}>
        {gap === null ? "\u2014" : `${gap >= 0 ? "+" : ""}${format(Math.abs(gap))}${gap < 0 ? "不足" : "超過"}`}
      </td>
      <td style={{ ...td, color: "#9ca3af" }}>
        {daily > 0 && !isRate ? format(daily) : "\u2014"}
      </td>
    </tr>
  );
}

// ============ セクションテーブル ============
function SectionTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #d1fae5", overflow: "hidden" }}>
      <div style={{ background: "#ecfdf5", padding: "7px 12px", borderBottom: "1px solid #d1fae5",
        fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {title}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "20%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#ecfdf5" }}>
            {["指標", "実績", "着地予測", "見込み", "目標差", "1日の目安"].map((h, i) => (
              <th key={h} style={{
                padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#6b7280",
                textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #d1fae5",
                textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ============ メインページ ============
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
  const isPastData = monthlySummary !== null && entries.length === 0;
  const daysElapsed = isPastData ? daysInMonth : (period === "10" ? 10 : period === "20" ? 20 : daysInMonth);
  const isEndPeriod = isPastData || period === "end";
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
    if (period === "end") return entries;
    const limit = Number(period);
    return entries.filter((e) => {
      const day = parseInt(e.date.split("-")[2], 10);
      return day <= limit;
    });
  }, [entries, period]);

  const periodSummary = useMemo(
    () => calculateDashboard(filteredEntries, year, month, new Date(year, month - 1, daysElapsed)),
    [filteredEntries, year, month, daysElapsed]
  );

  const displaySummary: DashboardSummary = useMemo(() => {
    if (!monthlySummary || entries.length > 0) return periodSummary;
    const ms = monthlySummary;
    const dim = getDaysInMonth(year, month);
    return {
      ...periodSummary,
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
      daysElapsed: dim, daysInMonth: dim, grossMargin: Number(ms.profit_rate ?? 0),
    };
  }, [periodSummary, monthlySummary, entries, year, month]);

  const isPastMonth = monthlySummary !== null && entries.length === 0;
  const callCount = isPastMonth ? Number(monthlySummary!.call_count ?? 0) : filteredEntries.reduce((s, e) => s + (e.insourceCount ?? 0) + (e.outsourceCount ?? 0), 0);
  const acquisitionCount = isPastMonth ? Number(monthlySummary!.acquisition_count ?? 0) : displaySummary.totalCount;
  const convRate = isPastMonth ? Number(monthlySummary!.conv_rate ?? 0) : (callCount > 0 ? (acquisitionCount / callCount) * 100 : 0);
  const grossRate = displaySummary.totalRevenue > 0 ? Math.round(displaySummary.totalProfit / displaySummary.totalRevenue * 1000) / 10 : 0;
  const targetGrossRate = targets.targetSales > 0 && targets.targetProfit > 0 ? Math.round(targets.targetProfit / targets.targetSales * 1000) / 10 : 0;
  const adRate = displaySummary.totalRevenue > 0 ? Math.round(displaySummary.totalAdCost / displaySummary.totalRevenue * 1000) / 10 : 0;
  const cpaCurrent = acquisitionCount > 0 ? Math.round(displaySummary.totalAdCost / acquisitionCount) : 0;

  const mp = { isEndPeriod: isEndPeriod || isPastMonth, daysElapsed, daysInMonth };
  const fmtYen = (v: number) => yen(v);
  const fmtCount = (v: number) => `${v}件`;
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  // 部門別
  const ratio = daysElapsed > 0 ? daysInMonth / daysElapsed : 0;
  const showLanding = !isEndPeriod && !isPastMonth;
  const depts = [
    { name: "自社施工", color: "#059669", d: displaySummary.self },
    { name: "新規営業", color: "#3b82f6", d: displaySummary.newSales },
    { name: "ヘルプ", color: "#0891b2", d: displaySummary.help },
  ];
  const deptTotal = { revenue: depts.reduce((s, x) => s + x.d.revenue, 0), profit: depts.reduce((s, x) => s + x.d.profit, 0), count: depts.reduce((s, x) => s + x.d.count, 0) };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100">
      <header style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 8, fontSize: 13, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>
            {AREAS.map((a) => <option key={a.id} value={a.id} style={{ color: "#111" }}>{a.name}</option>)}
          </select>
          <div className="flex gap-2">
            {([{ key: "10" as const, label: "10日" }, { key: "20" as const, label: "20日" }, { key: "end" as const, label: "末日" }]).map((p) => (
              <button key={p.key} type="button" onClick={() => setPeriod(p.key)}
                style={{ padding: "5px 18px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: "2px solid", cursor: "pointer",
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
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
            {year}年{month}月 ／ {areaName} ／ 1〜{period === "end" ? daysInMonth : period}日
            {isPastMonth && <span style={{ marginLeft: 10, fontSize: 11, background: "rgba(255,255,255,0.2)", borderRadius: 4, padding: "2px 8px" }}>過去データ</span>}
            {!isEndPeriod && !isPastMonth && (
              <span style={{ marginLeft: 10, fontSize: 11, background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "2px 8px" }}>
                着地予測 = {period}日ペースで月末換算
              </span>
            )}
          </div>
        </div>
      </header>

      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <SectionTable title="売上・粗利・件数">
            <MetricRow label="全体売上" actual={displaySummary.totalRevenue} target={targets.targetSales} {...mp} format={fmtYen} />
            <MetricRow label="全体粗利" actual={displaySummary.totalProfit} target={targets.targetProfit} {...mp} format={fmtYen} />
            <MetricRow label="粗利率" actual={grossRate} target={targetGrossRate} {...mp} format={fmtPct} isRate />
            <MetricRow label="獲得件数" actual={acquisitionCount} target={targets.targetCount} {...mp} format={fmtCount} />
            <MetricRow label="客単価" actual={displaySummary.companyUnitPrice} target={targets.targetUnitPrice} {...mp} format={fmtYen} isRate />
            <MetricRow label="対応件数" actual={displaySummary.totalCount} target={targets.targetCount} {...mp} format={fmtCount} />
          </SectionTable>

          <SectionTable title="広告・効率指標">
            <MetricRow label="広告費" actual={displaySummary.totalAdCost} target={targets.targetAdCost} {...mp} format={fmtYen} invertGap />
            <MetricRow label="広告費率" actual={adRate} target={targets.targetAdRate} {...mp} format={fmtPct} isRate invertGap />
            <MetricRow label="入電件数" actual={callCount} target={targets.targetCallCount} {...mp} format={fmtCount} />
            <MetricRow label="獲得単価(CPA)" actual={cpaCurrent} target={targets.targetCpa} {...mp} format={fmtYen} isRate invertGap />
            <MetricRow label="工事取得率" actual={displaySummary.constructionRate} target={targets.targetConstructionRate} {...mp} format={fmtPct} isRate />
            <MetricRow label="成約率" actual={convRate} target={targets.targetConversionRate} {...mp} format={fmtPct} isRate />
          </SectionTable>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <SectionTable title="HELP部門">
            <MetricRow label="HELP売上" actual={displaySummary.help.revenue} target={targets.targetHelpSales} {...mp} format={fmtYen} />
            <MetricRow label="HELP件数" actual={displaySummary.help.count} target={targets.targetHelpCount} {...mp} format={fmtCount} />
            <MetricRow label="HELP客単価" actual={displaySummary.help.unitPrice} target={targets.targetHelpUnitPrice} {...mp} format={fmtYen} isRate />
            <MetricRow label="HELP率" actual={displaySummary.helpRate ?? 0} target={targets.targetHelpRate} {...mp} format={fmtPct} isRate />
          </SectionTable>

          {/* 部門別実績 */}
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #d1fae5", overflow: "hidden" }}>
            <div style={{ background: "#ecfdf5", padding: "7px 12px", borderBottom: "1px solid #d1fae5",
              fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              部門別実績
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: "#f8fdf8" }}>
                  {["部門", "売上", ...(showLanding ? ["売上(予測)"] : []), "粗利", ...(showLanding ? ["粗利(予測)"] : []), "客単価", "件数", "粗利率"].map((h) => (
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
                      <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>{name}</td>
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
                  <td style={{ padding: "7px 6px", fontSize: 11, fontWeight: 700, color: "#065f46", borderLeft: "3px solid #059669", paddingLeft: 8 }}>合計</td>
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
