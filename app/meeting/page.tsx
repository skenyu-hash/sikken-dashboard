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
// PR c94-B-1: MetricRow / SectionTable / fmtYen / fmtCount / fmtPct は水道インライン
//   削除に伴い本ファイルでの使用が消失 → import 削除。WaterMeetingSection 内で同型 import。
import LocksmithMeetingSection from "./components/LocksmithMeetingSection";
import RoadMeetingSection from "./components/RoadMeetingSection";
import DetectiveMeetingSection from "./components/DetectiveMeetingSection";
import ElectricMeetingSection from "./components/ElectricMeetingSection";
import WaterMeetingSection from "./components/WaterMeetingSection";

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

  // PR c94-B-1: 水道レイアウト用派生値 (callCount / acquisitionCount / grossRate /
  //   targetGrossRate / adRate / cpaCurrent / convRate) は水道インライン削除に伴い
  //   全て不要 → 削除。WaterMeetingSection 内で numOf / safeDiv で再計算。

  // 全業態セクションで使用する期間 props
  const meetingPeriodProps = { isEndPeriod: isEndPeriod || isPastData, daysElapsed, daysInMonth };

  // PR c94-B-1: depts 配列 (水道インライン部門別実績テーブル用) 削除。
  //   c94-A の {false &&} ガード撤去と同期、WaterMeetingSection に移行。

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

        {/* PR c94-B-1: 水道 WaterMeetingSection 化 (旧インライン + c94-A {false &&}
            ガード部門別実績テーブル完全撤去、Electric と同型 5 セクション統一) */}
        {activeBusiness === "water" && (
          <WaterMeetingSection
            monthlySummary={monthlySummary} targets={targets}
            {...meetingPeriodProps}
          />
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
