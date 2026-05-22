"use client";
// PR #55: /meeting 会議シートページ
//
// 主な機能:
//   - 業態タブ (水道/電気/鍵/ロード/探偵) で月次会議シート切替
//   - 10日/20日/末日 サイクル切替で着地予測表示
//   - エリア選択・月送り (◀ ▶) で柔軟な期間指定
//   - URL パラメータ連動 (PR #55): ?category=&area=&cycle=&year=&month= で
//     ディープリンク可能。経営会議で「このリンク見てください」即共有。
//
// 業態別レイアウト routing (PR #55 で導入):
//   水道       : 既存インラインレイアウト (PR #56 で WaterMeetingSection 化予定)
//   電気       : ElectricMeetingSection (水道 + 分電盤件数 + 部門別実績)
//   鍵         : LocksmithMeetingSection (4 セクション、独自獲得 5 内訳)
//   ロード     : RoadMeetingSection (3 セクション、HELP/工事なし)
//   探偵       : DetectiveMeetingSection (4 セクション、面談ファネル)
//
// useSearchParams は Suspense 必須 (Next.js 16) のため、ロジック本体は
// MeetingPageInner に分離して MeetingPage で Suspense ラップ。

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  calculateDashboard, getDaysInMonth,
  emptyTargets, manToYen, type DailyEntry, type Targets, type DashboardSummary,
} from "../lib/calculations";
import { BUSINESSES, type BusinessCategory } from "../lib/businesses";
import AsOfBadge from "../components/AsOfBadge";
import { resolveTotalProfit } from "../lib/profit";
import {
  MetricRow, SectionTable, fmtYen, fmtCount, fmtPct,
} from "./components/MetricRow";
import LocksmithMeetingSection from "./components/LocksmithMeetingSection";
import RoadMeetingSection from "./components/RoadMeetingSection";
import DetectiveMeetingSection from "./components/DetectiveMeetingSection";
import ElectricMeetingSection from "./components/ElectricMeetingSection";

const ALL_AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

// ============ URL パラメータ パース (PR #55) ============
const VALID_CATEGORIES: readonly BusinessCategory[] = ["water", "electric", "locksmith", "road", "detective"] as const;
const VALID_AREAS = ["kansai", "kanto", "nagoya", "kyushu", "kitakanto", "hokkaido", "chugoku", "shizuoka"] as const;
const VALID_CYCLES = ["10", "20", "end"] as const;
type CycleKey = typeof VALID_CYCLES[number];

function parseCategory(v: string | null): BusinessCategory {
  return v && VALID_CATEGORIES.includes(v as BusinessCategory) ? (v as BusinessCategory) : "water";
}
function parseArea(v: string | null): string {
  return v && (VALID_AREAS as readonly string[]).includes(v) ? v : "kansai";
}
function parseCycle(v: string | null): CycleKey {
  return v && (VALID_CYCLES as readonly string[]).includes(v) ? (v as CycleKey) : "10";
}
function parseYearMonth(v: string | null, fallback: number, min: number, max: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

// ============ メインページ (Suspense ラップ内側) ============
function MeetingPageInner() {
  const searchParams = useSearchParams();

  // URL パラメータから state を初期化 (lazy initial state)
  const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>(() => parseCategory(searchParams.get("category")));
  const businessAreas = useMemo(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (!biz) return ALL_AREAS;
    return biz.areas.map(id => ALL_AREAS.find(a => a.id === id)).filter(Boolean) as typeof ALL_AREAS;
  }, [activeBusiness]);

  const [areaId, setAreaId] = useState<string>(() => parseArea(searchParams.get("area")));
  const [period, setPeriod] = useState<CycleKey>(() => parseCycle(searchParams.get("cycle")));
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Targets>(emptyTargets());
  const [monthlySummary, setMonthlySummary] = useState<Record<string, unknown> | null>(null);

  // 事業切替時にエリアリセット (URL から既に有効な値が来ている場合は維持)
  useEffect(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (biz && !biz.areas.includes(areaId)) {
      setAreaId(biz.areas[0]);
    }
  }, [activeBusiness, areaId]);

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [year, setYear] = useState<number>(() => parseYearMonth(searchParams.get("year"), currentYear, 2020, 2100));
  const [month, setMonth] = useState<number>(() => parseYearMonth(searchParams.get("month"), currentMonth, 1, 12));
  const daysInMonth = getDaysInMonth(year, month);
  const isCurrentMonth = year === currentYear && month === currentMonth;

  function gotoPrevMonth() {
    const d = new Date(year, month - 2, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }
  function gotoNextMonth() {
    const d = new Date(year, month, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }
  const isPastData = monthlySummary !== null && entries.length === 0 && !isCurrentMonth;
  const actualDayOfMonth = now.getDate();
  const daysElapsed = isPastData
    ? daysInMonth
    : (isCurrentMonth && entries.length === 0)
      ? actualDayOfMonth
      : (period === "10" ? 10 : period === "20" ? 20 : daysInMonth);
  const isEndPeriod = isPastData || period === "end";
  const areaName = ALL_AREAS.find((a) => a.id === areaId)?.name ?? "";

  // PR #55: URL パラメータ同期 (state → URL、replaceState で履歴汚染なし)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("category", activeBusiness);
    params.set("area", areaId);
    params.set("cycle", period);
    params.set("year", String(year));
    params.set("month", String(month));
    const next = `?${params.toString()}`;
    if (next !== window.location.search) {
      window.history.replaceState({}, "", `${window.location.pathname}${next}`);
    }
  }, [activeBusiness, areaId, period, year, month]);

  // データ fetch (5 KPI ストリップ + 業態別セクション共通)
  useEffect(() => {
    fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}&category=${activeBusiness}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((j) => setEntries(j.entries ?? []));
    fetch(`/api/targets?area=${areaId}&year=${year}&month=${month}&category=${activeBusiness}`)
      .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
      .then((j) => setTargets(manToYen({ ...emptyTargets(), ...j.targets })));
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

  // monthly_summaries が存在すれば優先 (entries 集計はフォールバック)
  const displaySummary: DashboardSummary = useMemo(() => {
    if (!monthlySummary) return periodSummary;
    const ms = monthlySummary;
    const dim = getDaysInMonth(year, month);
    // PR c93-5 Bug Fix: 対応ベース工事取得率を算出。
    //   旧: constructionRate を ms.construction_rate 直読 → c93-2 で aggregation が
    //   この legacy column を更新していないため、常に 0/古い値が表示されていた。
    //   新: construction_count / total_count × 100 で計算 (c93-2 対応ベースと整合)。
    const msTotalCount = Number(ms.total_count ?? 0);
    const msConstructionCount = Number(ms.construction_count ?? 0);
    return {
      ...periodSummary,
      totalRevenue: Number(ms.total_revenue ?? 0),
      totalProfit: resolveTotalProfit(ms),
      totalCount: msTotalCount,
      totalAdCost: Number(ms.ad_cost ?? 0),
      companyUnitPrice: Number(ms.unit_price ?? 0),
      constructionRate: msTotalCount > 0
        ? (msConstructionCount / msTotalCount) * 100
        : 0,
      helpRate: 0,
      help: { revenue: Number(ms.help_revenue ?? 0), profit: 0, count: Number(ms.help_count ?? 0),
        unitPrice: Number(ms.help_count) > 0 ? Math.round(Number(ms.help_revenue) / Number(ms.help_count)) : 0 },
      totalLaborCost: 0, totalMaterialCost: 0,
      daysElapsed: dim, daysInMonth: dim, grossMargin: Number(ms.profit_rate ?? 0),
    };
  }, [periodSummary, monthlySummary, year, month]);

  // 水道レイアウト用の派生値 (既存挙動維持)
  const callCount = monthlySummary
    ? Number(monthlySummary.call_count ?? 0)
    : filteredEntries.reduce((s, e) => s + (e.insourceCount ?? 0) + (e.outsourceCount ?? 0), 0);
  const acquisitionCount = monthlySummary
    ? Number(monthlySummary.acquisition_count ?? 0)
    : displaySummary.totalCount;
  const convRate = monthlySummary
    ? Number(monthlySummary.conv_rate ?? 0)
    : (callCount > 0 ? (acquisitionCount / callCount) * 100 : 0);
  const grossRate = displaySummary.totalRevenue > 0 ? Math.round(displaySummary.totalProfit / displaySummary.totalRevenue * 1000) / 10 : 0;
  const targetGrossRate = targets.targetSales > 0 && targets.targetProfit > 0 ? Math.round(targets.targetProfit / targets.targetSales * 1000) / 10 : 0;
  const adRate = displaySummary.totalRevenue > 0 ? Math.round(displaySummary.totalAdCost / displaySummary.totalRevenue * 1000) / 10 : 0;
  const cpaCurrent = acquisitionCount > 0 ? Math.round(displaySummary.totalAdCost / acquisitionCount) : 0;

  // 全業態セクションで使用する期間 props
  const meetingPeriodProps = { isEndPeriod: isEndPeriod || isPastData, daysElapsed, daysInMonth };

  // 部門別 (水道レイアウトで使用)
  const depts = [
    { name: "自社施工", color: "#059669", d: displaySummary.self },
    { name: "新規営業", color: "#3b82f6", d: displaySummary.newSales },
    { name: "ヘルプ",   color: "#0891b2", d: displaySummary.help },
  ];

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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <button type="button" onClick={gotoPrevMonth}
              style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 14 }}>◀</button>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{year}年{month}月</span>
            <button type="button" onClick={gotoNextMonth}
              style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 14 }}>▶</button>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
            {BUSINESSES.find(b => b.id === activeBusiness)?.label ?? ""} — {areaName}{period === "end" ? "月次" : `${period}日`}会議シート
          </h1>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>{year}年{month}月 ／ {areaName} ／ 1〜{period === "end" ? daysInMonth : period}日</span>
            {isPastData && <span style={{ fontSize: 11, background: "rgba(255,255,255,0.2)", borderRadius: 4, padding: "2px 8px" }}>過去データ</span>}
            {!isEndPeriod && !isPastData && (
              <span style={{ fontSize: 11, background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "2px 8px" }}>
                着地予測 = {period}日ペースで月末換算
              </span>
            )}
            {monthlySummary?.as_of_day != null && (
              <AsOfBadge
                asOfDays={[Number(monthlySummary.as_of_day)]}
                month={month}
                style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.95)", opacity: 1 }}
              />
            )}
          </div>
        </div>
      </header>

      <div className="page-padding-mobile" style={{ padding: "16px 20px" }}>
        {/* ===== 業態別レイアウト routing (PR #55) ===== */}

        {/* 水道: 既存インラインレイアウト (PR #56 で WaterMeetingSection 化予定) */}
        {activeBusiness === "water" && (
          <>
            <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14, gridAutoRows: "min-content" }}>
              <SectionTable title="売上・粗利・件数" group="rev" count={6} defaultOpen>
                <MetricRow label="全体売上" actual={displaySummary.totalRevenue} target={targets.targetSales} {...meetingPeriodProps} format={fmtYen} />
                <MetricRow label="全体粗利" actual={displaySummary.totalProfit} target={targets.targetProfit} {...meetingPeriodProps} format={fmtYen} />
                <MetricRow label="粗利率" actual={grossRate} target={targetGrossRate} {...meetingPeriodProps} format={fmtPct} isRate />
                <MetricRow label="獲得件数" actual={acquisitionCount} target={targets.targetCount} {...meetingPeriodProps} format={fmtCount} />
                <MetricRow label="客単価" actual={displaySummary.companyUnitPrice} target={targets.targetUnitPrice} {...meetingPeriodProps} format={fmtYen} isRate />
                <MetricRow label="対応件数" actual={displaySummary.totalCount} target={targets.targetCount} {...meetingPeriodProps} format={fmtCount} />
              </SectionTable>

              <SectionTable title="広告・効率指標" group="acq" count={6} defaultOpen={false}>
                <MetricRow label="広告費" actual={displaySummary.totalAdCost} target={targets.targetAdCost} {...meetingPeriodProps} format={fmtYen} invertGap />
                <MetricRow label="広告費率" actual={adRate} target={targets.targetAdRate} {...meetingPeriodProps} format={fmtPct} isRate invertGap />
                <MetricRow label="入電件数" actual={callCount} target={targets.targetCallCount} {...meetingPeriodProps} format={fmtCount} />
                <MetricRow label="獲得単価(CPA)" actual={cpaCurrent} target={targets.targetCpa} {...meetingPeriodProps} format={fmtYen} isRate invertGap />
                <MetricRow label="工事取得率" actual={displaySummary.constructionRate} target={targets.targetConstructionRate} {...meetingPeriodProps} format={fmtPct} isRate />
                <MetricRow label="成約率" actual={convRate} target={targets.targetConversionRate} {...meetingPeriodProps} format={fmtPct} isRate />
              </SectionTable>
            </div>

            <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <SectionTable title="HELP部門" group="help" count={4} defaultOpen={false}>
                <MetricRow label="HELP売上" actual={displaySummary.help.revenue} target={targets.targetHelpSales} {...meetingPeriodProps} format={fmtYen} />
                <MetricRow label="HELP件数" actual={displaySummary.help.count} target={targets.targetHelpCount} {...meetingPeriodProps} format={fmtCount} />
                <MetricRow label="HELP客単価" actual={displaySummary.help.unitPrice} target={targets.targetHelpUnitPrice} {...meetingPeriodProps} format={fmtYen} isRate />
                <MetricRow label="HELP率" actual={displaySummary.helpRate ?? 0} target={targets.targetHelpRate} {...meetingPeriodProps} format={fmtPct} isRate />
              </SectionTable>

              {/* 部門別実績 (水道のみ、電気は ElectricMeetingSection 内に内蔵) */}
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
                            {d.revenue > 0 ? fmtYen(d.revenue) : <span style={{ color: "#d1d5db" }}>¥0</span>}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", color: "#059669", fontWeight: 600 }}>
                            {d.profit > 0 ? fmtYen(d.profit) : <span style={{ color: "#d1d5db" }}>¥0</span>}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", color: "#374151" }}>
                            {d.unitPrice > 0 ? fmtYen(d.unitPrice) : "—"}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", color: "#374151" }}>{d.count}件</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right",
                            color: margin >= 25 ? "#059669" : margin >= 15 ? "#d97706" : "#dc2626" }}>
                            {d.revenue > 0 ? `${margin.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "#f0fdf4" }}>
                      <td style={{ padding: "10px 10px", fontSize: 13, fontWeight: 800, borderLeft: "3px solid #059669", color: "#065f46" }}>合計</td>
                      <td style={{ padding: "10px 10px", fontSize: 13, fontWeight: 800, textAlign: "right", color: "#065f46" }}>{fmtYen(displaySummary.totalRevenue)}</td>
                      <td style={{ padding: "10px 10px", fontSize: 13, fontWeight: 800, textAlign: "right", color: "#059669" }}>{fmtYen(displaySummary.totalProfit)}</td>
                      <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, textAlign: "right", color: "#374151" }}>{fmtYen(displaySummary.companyUnitPrice)}</td>
                      <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, textAlign: "right", color: "#374151" }}>{displaySummary.totalCount}件</td>
                      <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, textAlign: "right",
                        color: displaySummary.totalRevenue > 0
                          ? (displaySummary.totalProfit / displaySummary.totalRevenue * 100 >= 25 ? "#059669" : "#d97706") : "#d1d5db" }}>
                        {displaySummary.totalRevenue > 0 ? `${(displaySummary.totalProfit / displaySummary.totalRevenue * 100).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* 電気: ElectricMeetingSection (水道 + 分電盤件数 + 部門別実績) */}
        {activeBusiness === "electric" && (
          <ElectricMeetingSection
            monthlySummary={monthlySummary} targets={targets} displaySummary={displaySummary}
            {...meetingPeriodProps}
          />
        )}

        {/* 鍵: LocksmithMeetingSection */}
        {activeBusiness === "locksmith" && (
          <LocksmithMeetingSection
            monthlySummary={monthlySummary} targets={targets}
            {...meetingPeriodProps}
          />
        )}

        {/* ロード: RoadMeetingSection */}
        {activeBusiness === "road" && (
          <RoadMeetingSection
            monthlySummary={monthlySummary} targets={targets}
            {...meetingPeriodProps}
          />
        )}

        {/* 探偵: DetectiveMeetingSection (面談ファネル含む) */}
        {activeBusiness === "detective" && (
          <DetectiveMeetingSection
            monthlySummary={monthlySummary} targets={targets}
            {...meetingPeriodProps}
          />
        )}
      </div>
    </div>
  );
}

// ============ Suspense ラップ (useSearchParams は Suspense 必須) ============
export default function MeetingPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
        会議シートを読み込み中...
      </div>
    }>
      <MeetingPageInner />
    </Suspense>
  );
}
