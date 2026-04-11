"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, getDaysInMonth,
  emptyTargets, yen, type DailyEntry, type Targets, type DashboardSummary,
} from "../lib/calculations";
import { BUSINESSES, type BusinessCategory } from "../lib/businesses";

const ALL_AREAS = [
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

  const td: React.CSSProperties = { padding: "9px 10px", fontSize: 12, textAlign: "right", color: "#374151", borderBottom: "1px solid #f0faf0" };

  return (
    <tr>
      <td style={{ ...td, textAlign: "left", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</td>
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
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        {gap === null ? <span style={{ color: "#d1d5db", fontSize: 11 }}>{"\u2014"}</span> : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: gapPositive ? "#059669" : "#dc2626" }}>
              {gap >= 0 ? "+" : "\u2212"}{format(Math.abs(gap))}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, borderRadius: 3, padding: "1px 5px", flexShrink: 0,
              background: gapPositive ? "#d1fae5" : "#fee2e2",
              color: gapPositive ? "#065f46" : "#991b1b" }}>
              {gapPositive ? "超過" : "不足"}
            </span>
          </span>
        )}
      </td>
      <td style={td}>
        {daily > 0 && !isRate ? (
          <span style={{ color: "#d97706", fontWeight: 700, fontSize: 12 }}>{format(daily)}</span>
        ) : <span style={{ color: "#d1d5db", fontSize: 11 }}>{"\u2014"}</span>}
      </td>
    </tr>
  );
}

// ============ セクションテーブル ============
function SectionTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #d1fae5", overflow: "hidden" }}>
      <div style={{ background: "#ecfdf5", padding: "8px 14px", borderBottom: "1px solid #d1fae5",
        fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        {title}
      </div>
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 520 }}>
        <colgroup>
          <col style={{ width: "18%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "24%" }} />
          <col style={{ width: "15%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#ecfdf5" }}>
            {["指標", "実績", "着地予測", "見込み", "目標差", "1日の目安"].map((h, i) => (
              <th key={h} style={{
                padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#6b7280",
                textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #d1fae5",
                textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      </div>
    </div>
  );
}

// ============ メインページ ============
export default function MeetingPage() {
  const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>("water");
  const businessAreas = useMemo(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (!biz) return ALL_AREAS;
    return biz.areas.map(id => ALL_AREAS.find(a => a.id === id)).filter(Boolean) as typeof ALL_AREAS;
  }, [activeBusiness]);

  const [areaId, setAreaId] = useState("kansai");
  const [period, setPeriod] = useState<"10" | "20" | "end">("10");
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Targets>(emptyTargets());
  const [monthlySummary, setMonthlySummary] = useState<Record<string, unknown> | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // 事業切替時にエリアリセット
  useEffect(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (biz && !biz.areas.includes(areaId)) {
      setAreaId(biz.areas[0]);
    }
  }, [activeBusiness, areaId]);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  const isPastData = monthlySummary !== null && entries.length === 0;
  const daysElapsed = isPastData ? daysInMonth : (period === "10" ? 10 : period === "20" ? 20 : daysInMonth);
  const isEndPeriod = isPastData || period === "end";
  const areaName = ALL_AREAS.find((a) => a.id === areaId)?.name ?? "";

  useEffect(() => {
    fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}&category=${activeBusiness}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((j) => setEntries(j.entries ?? []));
    fetch(`/api/targets?area=${areaId}&year=${year}&month=${month}&category=${activeBusiness}`)
      .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
      .then((j) => setTargets({ ...emptyTargets(), ...j.targets }));
    fetch(`/api/monthly-summary?area=${areaId}&year=${year}&month=${month}&category=${activeBusiness}`)
      .then((r) => (r.ok ? r.json() : { summary: null }))
      .then((j) => setMonthlySummary(j.summary ?? null));
  }, [areaId, year, month, activeBusiness]);

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
        {/* 事業タブ */}
        <div style={{ display: "flex", gap: 4, padding: "8px 24px 0", overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
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
        <div className="flex items-center justify-between px-6 pt-3 pb-2">
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 8, fontSize: 13, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>
            {businessAreas.map((a) => <option key={a.id} value={a.id} style={{ color: "#111" }}>{a.name}</option>)}
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
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
            {BUSINESSES.find(b => b.id === activeBusiness)?.label ?? ""} — {areaName}{period === "end" ? "月次" : `${period}日`}会議シート
          </h1>
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
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14, gridAutoRows: "min-content" }}>
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

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
          <SectionTable title="HELP部門">
            <MetricRow label="HELP売上" actual={displaySummary.help.revenue} target={targets.targetHelpSales} {...mp} format={fmtYen} />
            <MetricRow label="HELP件数" actual={displaySummary.help.count} target={targets.targetHelpCount} {...mp} format={fmtCount} />
            <MetricRow label="HELP客単価" actual={displaySummary.help.unitPrice} target={targets.targetHelpUnitPrice} {...mp} format={fmtYen} isRate />
            <MetricRow label="HELP率" actual={displaySummary.helpRate ?? 0} target={targets.targetHelpRate} {...mp} format={fmtPct} isRate />
          </SectionTable>

          {/* 部門別実績 */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
            <div style={{ background: "#ecfdf5", padding: "10px 14px", borderBottom: "1px solid #d1fae5" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>部門別実績</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "18%" }} /><col style={{ width: "20%" }} /><col style={{ width: "16%" }} />
                <col style={{ width: "20%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#f8fdf8" }}>
                  {["部門", "売上", "粗利", "客単価", "件数", "粗利率"].map((h, i) => (
                    <th key={h} style={{ padding: "7px 10px", fontSize: 9, fontWeight: 700, color: "#6b7280",
                      textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #d1fae5",
                      textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {depts.map(({ name, color, d }) => {
                  const margin = d.revenue > 0 ? (d.profit / d.revenue * 100) : 0;
                  return (
                    <tr key={name} style={{ borderBottom: "1px solid #f0faf0" }}>
                      <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, borderLeft: `3px solid ${color}`, color: "#111" }}>{name}</td>
                      <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", color: "#111", fontWeight: 600 }}>
                        {d.revenue > 0 ? yen(d.revenue) : <span style={{ color: "#d1d5db" }}>&yen;0</span>}
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", color: "#059669", fontWeight: 600 }}>
                        {d.profit > 0 ? yen(d.profit) : <span style={{ color: "#d1d5db" }}>&yen;0</span>}
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", color: "#374151" }}>
                        {d.unitPrice > 0 ? yen(d.unitPrice) : "\u2014"}
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", color: "#374151" }}>{d.count}件</td>
                      <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right",
                        color: margin >= 25 ? "#059669" : margin >= 15 ? "#d97706" : "#dc2626" }}>
                        {d.revenue > 0 ? `${margin.toFixed(1)}%` : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#f0fdf4" }}>
                  <td style={{ padding: "10px 10px", fontSize: 13, fontWeight: 800, borderLeft: "3px solid #059669", color: "#065f46" }}>合計</td>
                  <td style={{ padding: "10px 10px", fontSize: 13, fontWeight: 800, textAlign: "right", color: "#065f46" }}>{yen(displaySummary.totalRevenue)}</td>
                  <td style={{ padding: "10px 10px", fontSize: 13, fontWeight: 800, textAlign: "right", color: "#059669" }}>{yen(displaySummary.totalProfit)}</td>
                  <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, textAlign: "right", color: "#374151" }}>{yen(displaySummary.companyUnitPrice)}</td>
                  <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, textAlign: "right", color: "#374151" }}>{displaySummary.totalCount}件</td>
                  <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, textAlign: "right",
                    color: displaySummary.totalRevenue > 0
                      ? (displaySummary.totalProfit / displaySummary.totalRevenue * 100 >= 25 ? "#059669" : "#d97706") : "#d1d5db" }}>
                    {displaySummary.totalRevenue > 0 ? `${(displaySummary.totalProfit / displaySummary.totalRevenue * 100).toFixed(1)}%` : "\u2014"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
