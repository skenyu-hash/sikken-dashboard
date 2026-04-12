"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, calculateBreakeven, calculateAchievement,
  forecastWeekday, forecastRecent7, getDaysInMonth,
  buildMetricRows, type MetricRow,
  type DashboardSummary,
  DailyEntry, FixedCosts, Targets, emptyTargets, manToYen,
  emptyEntry,
  yen,
} from "../lib/calculations";
import { useRole, useSession } from "./RoleProvider";
import { logAction } from "../lib/logger";
import { BUSINESSES, AREA_NAMES, type BusinessCategory } from "../lib/businesses";
import { COMPANIES } from "../lib/companies";

// ============ エリア定義 ============
type Area = { id: string; name: string };

const ALL_AREAS: Area[] = [
  { id: "kansai", name: "関西" },
  { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" },
  { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" },
  { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" },
  { id: "shizuoka", name: "静岡" },
];
// 後方互換: 既存コードで AREAS を参照している箇所向け
const AREAS = ALL_AREAS;

async function fetchEntries(
  areaId: string,
  year: number,
  month: number,
  category: string = "water"
): Promise<DailyEntry[]> {
  const res = await fetch(
    `/api/entries?area=${areaId}&year=${year}&month=${month}&category=${category}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { entries: DailyEntry[] };
  return json.entries ?? [];
}

async function postEntry(areaId: string, entry: DailyEntry, category: string = "water"): Promise<boolean> {
  const res = await fetch("/api/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ areaId, entry, category }),
  });
  return res.ok;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ============ フォーム定義 ============
type FieldDef = { key: keyof DailyEntry; label: string; unit?: string };

// 役員/管理職向け詳細フォーム
const FORM_SECTIONS_FULL: { title: string; fields: FieldDef[] }[] = [
  {
    title: "全体 / 営業品質",
    fields: [
      { key: "totalCount", label: "全体件数", unit: "件" },
      { key: "constructionCount", label: "工事件数(10万以上)", unit: "件" },
      { key: "insourceCount", label: "内製対応件数", unit: "件" },
      { key: "outsourceCount", label: "外注対応件数", unit: "件" },
      { key: "reviewCount", label: "口コミ件数", unit: "件" },
    ],
  },
  {
    title: "自社施工部門",
    fields: [
      { key: "selfRevenue", label: "売上高", unit: "円" },
      { key: "selfProfit", label: "施工利益", unit: "円" },
      { key: "selfCount", label: "件数", unit: "件" },
    ],
  },
  {
    title: "新規営業部門",
    fields: [
      { key: "newRevenue", label: "売上", unit: "円" },
      { key: "newMaterial", label: "材料費", unit: "円" },
      { key: "newLabor", label: "職人費", unit: "円" },
      { key: "newCount", label: "新規件数", unit: "件" },
    ],
  },
  {
    title: "追加 / ヘルプ部門",
    fields: [
      { key: "addRevenue", label: "追加売上", unit: "円" },
      { key: "addMaterial", label: "追加材料費", unit: "円" },
      { key: "addLabor", label: "追加職人費", unit: "円" },
      { key: "addCount", label: "ヘルプ件数", unit: "件" },
      { key: "helpRevenue", label: "HELP売上", unit: "円" },
      { key: "helpCount", label: "HELP件数", unit: "件" },
    ],
  },
  {
    title: "コスト",
    fields: [
      { key: "adCost", label: "広告費", unit: "円" },
      { key: "laborCost", label: "職人費(全体)", unit: "円" },
      { key: "materialCost", label: "材料費(全体)", unit: "円" },
      { key: "outsourceCost", label: "営業外注費", unit: "円" },
    ],
  },
];

// 事務員向け簡易フォーム(10項目以内)
const FORM_SECTIONS_SIMPLE: { title: string; fields: FieldDef[] }[] = [
  {
    title: "本日の入力(10項目)",
    fields: [
      { key: "totalCount", label: "全体件数", unit: "件" },
      { key: "constructionCount", label: "工事件数", unit: "件" },
      { key: "insourceCount", label: "内製件数", unit: "件" },
      { key: "outsourceCount", label: "外注件数", unit: "件" },
      { key: "helpCount", label: "HELP件数", unit: "件" },
      { key: "reviewCount", label: "口コミ件数", unit: "件" },
      { key: "newRevenue", label: "新規売上", unit: "円" },
      { key: "helpRevenue", label: "HELP売上", unit: "円" },
      { key: "adCost", label: "広告費", unit: "円" },
      { key: "materialCost", label: "材料費", unit: "円" },
    ],
  },
];

const GROUP_TAB = "__group__";

// ============ メイン ============
export default function Dashboard() {
  const role = useRole();
  const session = useSession();
  const isInputOnly = role === "input";
  const canEditDashboard = role === "admin" || role === "manager" || role === "input";
  const userAreaId = session?.areaId ?? null;
  const formSections = isInputOnly ? FORM_SECTIONS_SIMPLE : FORM_SECTIONS_FULL;

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [fixedCosts, setFixedCosts] = useState<FixedCosts>({ laborCost: 0, rent: 0, other: 0 });
  const [targets, setTargets] = useState<Targets>(emptyTargets());

  const [viewMode, setViewMode] = useState<"business" | "company">("business");
  const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>("water");
  const [activeCompany, setActiveCompany] = useState<string>("__all__");

  // 事業別: 現在の事業に属するエリアだけ表示
  const businessAreas = useMemo(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (!biz) return ALL_AREAS;
    return biz.areas.map(id => ALL_AREAS.find(a => a.id === id)).filter(Boolean) as Area[];
  }, [activeBusiness]);

  const [activeTab, setActiveTab] = useState<string>(AREAS[0].id);

  const [viewYear, setViewYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);

  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [groupEntriesByArea, setGroupEntriesByArea] = useState<
    Record<string, DailyEntry[]>
  >({});
  const [companyData, setCompanyData] = useState<{
    totalRevenue: number; totalProfit: number; totalCount: number; totalAdCost: number;
    helpRevenue: number; helpCount: number; vehicleCount: number;
  } | null>(null);
  const [form, setForm] = useState<DailyEntry>(() => emptyEntry(todayStr()));
  const [, setLoaded] = useState(false);

  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
  const isGroup = activeTab === GROUP_TAB;
  const isAreaEditable = !userAreaId || userAreaId === activeTab;
  const canEdit = canEditDashboard && !isGroup && isAreaEditable && viewMode === "business";

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState<Record<string, unknown> | null>(null);
  const [prevMonthlySummary, setPrevMonthlySummary] = useState<Record<string, unknown> | null>(null);
  const [prevEntries, setPrevEntries] = useState<DailyEntry[]>([]);
  const [yoyMonthlySummary, setYoyMonthlySummary] = useState<Record<string, unknown> | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // ============ 事業切替時にタブリセット ============
  useEffect(() => {
    if (viewMode === "business") {
      const biz = BUSINESSES.find(b => b.id === activeBusiness);
      if (biz && !biz.areas.includes(activeTab) && activeTab !== GROUP_TAB) {
        setActiveTab(biz.areas[0]);
      }
    }
  }, [activeBusiness, viewMode, activeTab]);

  // ============ データ読込: エリアタブ ============
  useEffect(() => {
    if (isGroup || viewMode === "company") return;
    let cancelled = false;
    setLoaded(false);
    fetchEntries(activeTab, viewYear, viewMonth, activeBusiness).then((rows) => {
      if (cancelled) return;
      setEntries(rows);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);

  // 固定費 + 目標の読込
  useEffect(() => {
    if (isGroup || viewMode === "company") return;
    fetch(`/api/fixed-costs?area=${activeTab}&year=${viewYear}&month=${viewMonth}`)
      .then((r) => (r.ok ? r.json() : { fixedCosts: { laborCost: 0, rent: 0, other: 0 } }))
      .then((j: { fixedCosts: FixedCosts }) => setFixedCosts(j.fixedCosts));
    fetch(`/api/targets?area=${activeTab}&year=${viewYear}&month=${viewMonth}&category=${activeBusiness}`)
      .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
      .then((j: { targets: Targets }) => setTargets(manToYen(j.targets)));
  }, [activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);

  const [groupMonthlySummaries, setGroupMonthlySummaries] = useState<Record<string, Record<string, unknown> | null>>({});

  // ============ データ読込: グループタブ ============
  useEffect(() => {
    if (!isGroup || viewMode === "company") return;
    let cancelled = false;
    const areas = businessAreas;
    Promise.all(
      areas.map(async (a) => {
        const [eRes, sRes] = await Promise.all([
          fetch(`/api/entries?area=${a.id}&year=${viewYear}&month=${viewMonth}&category=${activeBusiness}`).then(r => r.ok ? r.json() : { entries: [] }),
          fetch(`/api/monthly-summary?area=${a.id}&year=${viewYear}&month=${viewMonth}&category=${activeBusiness}`).then(r => r.ok ? r.json() : { summary: null }),
        ]);
        return [a.id, eRes.entries ?? [], sRes.summary] as const;
      })
    ).then((pairs) => {
      if (cancelled) return;
      const eMap: Record<string, DailyEntry[]> = {};
      const sMap: Record<string, Record<string, unknown> | null> = {};
      for (const [id, entries, ms] of pairs) { eMap[id] = entries; sMap[id] = ms; }
      setGroupEntriesByArea(eMap);
      setGroupMonthlySummaries(sMap);
    });
    return () => { cancelled = true; };
  }, [isGroup, viewYear, viewMonth, activeBusiness, viewMode, businessAreas]);

  // ============ データ読込: 会社別ビュー ============
  useEffect(() => {
    if (viewMode !== "company") { setCompanyData(null); return; }
    let cancelled = false;
    const company = COMPANIES.find(c => c.id === activeCompany);
    const pairs = company ? company.areas : COMPANIES.flatMap(c => c.areas);
    Promise.all(
      pairs.map(async ({ category, areaId }) => {
        const res = await fetch(`/api/monthly-summary?area=${areaId}&year=${viewYear}&month=${viewMonth}&category=${category}`)
          .then(r => r.ok ? r.json() : { summary: null });
        return res.summary;
      })
    ).then((summaries) => {
      if (cancelled) return;
      const result = { totalRevenue: 0, totalProfit: 0, totalCount: 0, totalAdCost: 0, helpRevenue: 0, helpCount: 0, vehicleCount: 0 };
      for (const s of summaries) {
        if (!s) continue;
        result.totalRevenue += Number(s.total_revenue ?? 0);
        result.totalProfit += Number(s.total_profit ?? 0);
        result.totalCount += Number(s.total_count ?? 0);
        result.totalAdCost += Number(s.ad_cost ?? 0);
        result.helpRevenue += Number(s.help_revenue ?? 0);
        result.helpCount += Number(s.help_count ?? 0);
        result.vehicleCount += Number(s.vehicle_count ?? 0);
      }
      setCompanyData(result);
    });
    // Also load group entries for company view aggregation
    const uniqueAreas = [...new Set(pairs.map(p => p.areaId))];
    const uniqueCats = [...new Set(pairs.map(p => p.category))];
    Promise.all(
      pairs.map(async ({ category, areaId }) => {
        const res = await fetch(`/api/entries?area=${areaId}&year=${viewYear}&month=${viewMonth}&category=${category}`)
          .then(r => r.ok ? r.json() : { entries: [] });
        return res.entries as DailyEntry[];
      })
    ).then((entryArrays) => {
      if (cancelled) return;
      setEntries(entryArrays.flat());
    });
    return () => { cancelled = true; };
  }, [viewMode, activeCompany, viewYear, viewMonth]);

  // ============ 過去月サマリー取得 ============
  useEffect(() => {
    if (entries.length === 0 && !isGroup && activeTab && viewMode === "business") {
      fetch(`/api/monthly-summary?area=${activeTab}&year=${viewYear}&month=${viewMonth}&category=${activeBusiness}`)
        .then((r) => r.ok ? r.json() : { summary: null })
        .then((j) => setMonthlySummary(j.summary ?? null));
    } else {
      setMonthlySummary(null);
    }
  }, [entries, activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);

  // ============ 閲覧ログ ============
  useEffect(() => {
    if (activeTab) {
      logAction("view", { targetArea: activeTab, targetPage: "/", detail: `${viewYear}年${viewMonth}月を閲覧` });
    }
  }, [activeTab, viewYear, viewMonth]);

  // ============ 前月データ取得 ============
  const prevMonth = viewMonth === 1 ? 12 : viewMonth - 1;
  const prevYear = viewMonth === 1 ? viewYear - 1 : viewYear;

  useEffect(() => {
    if (!isGroup && activeTab && viewMode === "business") {
      fetch(`/api/monthly-summary?area=${activeTab}&year=${prevYear}&month=${prevMonth}&category=${activeBusiness}`)
        .then((r) => r.ok ? r.json() : { summary: null })
        .then((j) => setPrevMonthlySummary(j.summary ?? null));
      fetch(`/api/entries?area=${activeTab}&year=${prevYear}&month=${prevMonth}&category=${activeBusiness}`)
        .then((r) => r.ok ? r.json() : { entries: [] })
        .then((j) => setPrevEntries(j.entries ?? []));
    }
  }, [activeTab, prevYear, prevMonth, isGroup, activeBusiness, viewMode]);

  // ============ 前年同月データ取得 ============
  useEffect(() => {
    if (!isGroup && activeTab && viewMode === "business") {
      fetch(`/api/monthly-summary?area=${activeTab}&year=${viewYear - 1}&month=${viewMonth}&category=${activeBusiness}`)
        .then((r) => r.ok ? r.json() : { summary: null })
        .then((j) => setYoyMonthlySummary(j.summary ?? null));
    } else {
      setYoyMonthlySummary(null);
    }
  }, [activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);

  // ============ 集計 ============
  const summaryToday = useMemo(
    () => (isCurrentMonth ? now : new Date(viewYear, viewMonth, 0)),
    [isCurrentMonth, now, viewYear, viewMonth]
  );

  // 集計対象の入力配列(グループの場合は全社合算)
  const aggregateEntries = useMemo(() => {
    if (!isGroup) return entries;
    return Object.values(groupEntriesByArea).flat();
  }, [isGroup, entries, groupEntriesByArea]);

  const summary = useMemo(
    () => calculateDashboard(aggregateEntries, viewYear, viewMonth, summaryToday),
    [aggregateEntries, viewYear, viewMonth, summaryToday]
  );

  const displaySummary = useMemo(() => {
    // 会社別ビュー: companyDataから集計
    if (viewMode === "company" && companyData) {
      const dim = getDaysInMonth(viewYear, viewMonth);
      return {
        ...summary,
        totalRevenue: companyData.totalRevenue,
        totalProfit: companyData.totalProfit,
        totalCount: companyData.totalCount,
        totalAdCost: companyData.totalAdCost,
        companyUnitPrice: companyData.totalCount > 0 ? Math.round(companyData.totalRevenue / companyData.totalCount) : 0,
        vehicleCount: companyData.vehicleCount,
        constructionRate: 0,
        help: {
          revenue: companyData.helpRevenue, profit: 0, count: companyData.helpCount,
          unitPrice: companyData.helpCount > 0 ? Math.round(companyData.helpRevenue / companyData.helpCount) : 0,
        },
        totalLaborCost: 0, totalMaterialCost: 0,
        daysElapsed: dim, daysInMonth: dim,
        grossMargin: companyData.totalRevenue > 0 ? Math.round(companyData.totalProfit / companyData.totalRevenue * 1000) / 10 : 0,
      };
    }
    // グループ全体: 全エリアのmonthlySummariesから集計（エントリがない過去月対応）
    if (isGroup) {
      const allEntries = Object.values(groupEntriesByArea).flat();
      const hasEntries = allEntries.length > 0;
      const summaries = Object.values(groupMonthlySummaries).filter(Boolean) as Record<string, unknown>[];
      if (!hasEntries && summaries.length > 0) {
        const dim = getDaysInMonth(viewYear, viewMonth);
        const totalRevenue = summaries.reduce((s, ms) => s + Number(ms.total_revenue ?? 0), 0);
        const totalProfit = summaries.reduce((s, ms) => s + Number(ms.total_profit ?? 0), 0);
        const totalCount = summaries.reduce((s, ms) => s + Number(ms.total_count ?? 0), 0);
        const totalAdCost = summaries.reduce((s, ms) => s + Number(ms.ad_cost ?? 0), 0);
        const helpRevenue = summaries.reduce((s, ms) => s + Number(ms.help_revenue ?? 0), 0);
        const helpCount = summaries.reduce((s, ms) => s + Number(ms.help_count ?? 0), 0);
        return {
          ...summary,
          totalRevenue, totalProfit, totalCount, totalAdCost,
          companyUnitPrice: totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0,
          vehicleCount: summaries.reduce((s, ms) => s + Number(ms.vehicle_count ?? 0), 0),
          constructionRate: 0,
          help: {
            revenue: helpRevenue, profit: 0, count: helpCount,
            unitPrice: helpCount > 0 ? Math.round(helpRevenue / helpCount) : 0,
          },
          totalLaborCost: 0, totalMaterialCost: 0,
          daysElapsed: dim, daysInMonth: dim,
          grossMargin: totalRevenue > 0 ? Math.round(totalProfit / totalRevenue * 1000) / 10 : 0,
        };
      }
      return summary;
    }
    if (!monthlySummary) return summary;
    const dim = getDaysInMonth(viewYear, viewMonth);
    return {
      ...summary,
      totalRevenue: Number(monthlySummary.total_revenue ?? 0),
      totalProfit: Number(monthlySummary.total_profit ?? 0),
      totalCount: Number(monthlySummary.total_count ?? 0),
      totalAdCost: Number(monthlySummary.ad_cost ?? 0),
      companyUnitPrice: Number(monthlySummary.unit_price ?? 0),
      vehicleCount: Number(monthlySummary.vehicle_count ?? 0),
      constructionRate: Number(monthlySummary.construction_rate ?? 0),
      help: {
        revenue: Number(monthlySummary.help_revenue ?? 0),
        profit: 0,
        count: Number(monthlySummary.help_count ?? 0),
        unitPrice: Number(monthlySummary.help_count) > 0
          ? Math.round(Number(monthlySummary.help_revenue) / Number(monthlySummary.help_count))
          : 0,
      },
      totalLaborCost: 0,
      totalMaterialCost: 0,
      daysElapsed: dim,
      daysInMonth: dim,
      grossMargin: Number(monthlySummary.profit_rate ?? 0),
    };
  }, [summary, monthlySummary, viewYear, viewMonth, isGroup, groupEntriesByArea, groupMonthlySummaries, viewMode, companyData]);

  // ============ 前月比 ============
  const prevSummaryCalc = useMemo(() => {
    if (prevMonthlySummary) {
      return {
        totalRevenue: Number(prevMonthlySummary.total_revenue ?? 0),
        totalProfit: Number(prevMonthlySummary.total_profit ?? 0),
        totalAdCost: Number(prevMonthlySummary.ad_cost ?? 0),
        totalCount: Number(prevMonthlySummary.total_count ?? 0),
      };
    }
    const s = calculateDashboard(prevEntries, prevYear, prevMonth,
      new Date(prevYear, prevMonth - 1, getDaysInMonth(prevYear, prevMonth)));
    return { totalRevenue: s.totalRevenue, totalProfit: s.totalProfit, totalAdCost: s.totalAdCost, totalCount: s.totalCount };
  }, [prevMonthlySummary, prevEntries, prevYear, prevMonth]);

  const mom = (current: number, prev: number): number | null => {
    if (prev <= 0) return null;
    return Math.round((current - prev) / prev * 1000) / 10;
  };
  const momRevenue = mom(displaySummary.totalRevenue, prevSummaryCalc.totalRevenue);
  const momProfit = mom(displaySummary.totalProfit, prevSummaryCalc.totalProfit);
  const momAdCost = mom(displaySummary.totalAdCost, prevSummaryCalc.totalAdCost);
  const momCount = mom(displaySummary.totalCount, prevSummaryCalc.totalCount);

  // 前日比(当月かつ会社タブ or グループでも有効)
  const yesterdaySummary = useMemo(() => {
    if (!isCurrentMonth) return summary;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const filtered = aggregateEntries.filter((e) => e.date < todayStr());
    return calculateDashboard(filtered, viewYear, viewMonth, y);
  }, [aggregateEntries, viewYear, viewMonth, isCurrentMonth, summary]);

  const diff = summary.forecastProfit - yesterdaySummary.forecastProfit;
  const breakeven = useMemo(() => calculateBreakeven(fixedCosts, summary), [fixedCosts, summary]);
  const achievement = useMemo(() => calculateAchievement(targets, summary), [targets, summary]);
  const weekdayForecast = useMemo(
    () => forecastWeekday(aggregateEntries, viewYear, viewMonth, summaryToday),
    [aggregateEntries, viewYear, viewMonth, summaryToday]
  );
  const recent7Forecast = useMemo(
    () => forecastRecent7(aggregateEntries, viewYear, viewMonth, summaryToday),
    [aggregateEntries, viewYear, viewMonth, summaryToday]
  );
  const metricRowsResult = useMemo(
    () => buildMetricRows(
      displaySummary, aggregateEntries, targets,
      isCurrentMonth ? now.getDate() : displaySummary.daysInMonth, displaySummary.daysInMonth,
      monthlySummary ? {
        callCount: Number(monthlySummary.call_count ?? 0),
        acquisitionCount: Number(monthlySummary.acquisition_count ?? 0),
        cpa: Number(monthlySummary.cpa ?? 0),
        callUnitPrice: Number(monthlySummary.call_unit_price ?? 0),
        convRate: Number(monthlySummary.conv_rate ?? 0),
        vehicleCount: Number(monthlySummary.vehicle_count ?? 0),
      } : undefined
    ),
    [displaySummary, aggregateEntries, targets, monthlySummary, isCurrentMonth]
  );
  // 異常アラート: 前日比 -20% 以上
  const profitDropRate = yesterdaySummary.forecastProfit > 0
    ? ((summary.forecastProfit - yesterdaySummary.forecastProfit) / yesterdaySummary.forecastProfit) * 100
    : 0;
  const isAlert = isCurrentMonth && profitDropRate <= -20;

  // 各エリアサマリー(グループ表示用)
  const perAreaSummaries = useMemo(() => {
    if (!isGroup) return [];
    return businessAreas.map((a) => {
      const entries = groupEntriesByArea[a.id] ?? [];
      const ms = groupMonthlySummaries[a.id];
      const raw = calculateDashboard(entries, viewYear, viewMonth, summaryToday);
      if (ms && entries.length === 0) {
        const dim = getDaysInMonth(viewYear, viewMonth);
        return {
          area: a,
          summary: { ...raw,
            totalRevenue: Number(ms.total_revenue ?? 0), totalProfit: Number(ms.total_profit ?? 0),
            totalCount: Number(ms.total_count ?? 0), totalAdCost: Number(ms.ad_cost ?? 0),
            companyUnitPrice: Number(ms.unit_price ?? 0), vehicleCount: Number(ms.vehicle_count ?? 0),
            help: { revenue: Number(ms.help_revenue ?? 0), profit: 0, count: Number(ms.help_count ?? 0),
              unitPrice: Number(ms.help_count) > 0 ? Math.round(Number(ms.help_revenue) / Number(ms.help_count)) : 0 },
            daysElapsed: dim, daysInMonth: dim, grossMargin: Number(ms.profit_rate ?? 0),
          },
        };
      }
      return { area: a, summary: raw };
    });
  }, [isGroup, groupEntriesByArea, groupMonthlySummaries, viewYear, viewMonth, summaryToday]);

  // ============ 月切替 ============
  function gotoPrevMonth() {
    const d = new Date(viewYear, viewMonth - 2, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  }
  function gotoNextMonth() {
    if (isCurrentMonth) return;
    const d = new Date(viewYear, viewMonth, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  }

  // ============ フォーム ============
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    const ok = await postEntry(activeTab, form, activeBusiness);
    setSaving(false);
    if (!ok) {
      setSaveError("保存に失敗しました。通信状況をご確認ください。");
      return;
    }
    logAction("edit", { targetArea: activeTab, targetPage: "/", detail: `${form.date} 日次データを保存` });
    setEntries((prev) => {
      const idx = prev.findIndex((p) => p.date === form.date);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = form;
        return next;
      }
      return [...prev, form].sort((a, b) => a.date.localeCompare(b.date));
    });
    setForm(emptyEntry(form.date));
  }
  function setField(key: keyof DailyEntry, value: string) {
    setForm((f) => ({
      ...f,
      [key]: key === "date" ? value : Number(value || 0),
    }));
  }
  function loadDate(date: string) {
    const found = entries.find((e) => e.date === date);
    setForm(found ?? emptyEntry(date));
  }

  // タブ切替時にフォーム初期化
  useEffect(() => {
    setForm(emptyEntry(todayStr()));
  }, [activeTab]);

  const activeArea = AREAS.find((a) => a.id === activeTab);
  const activeBusinessLabel = BUSINESSES.find(b => b.id === activeBusiness)?.label ?? "";
  const headerLabel = viewMode === "company"
    ? (activeCompany === "__all__" ? "全社合計" : COMPANIES.find(c => c.id === activeCompany)?.name ?? "")
    : isGroup ? "グループ全体" : activeArea?.name ?? "";

  // 事務員: 入力専用シンプル画面
  if (isInputOnly) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
        <header className="px-5 py-5 bg-emerald-700 text-white">
          <h1 className="text-xl font-bold">日次入力</h1>
          <p className="text-xs opacity-80 mt-1">事務員モード</p>
        </header>
        <section className="px-4 mt-4">
          <label className="block text-xs text-zinc-500 mb-1">エリア</label>
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-base"
          >
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </section>
        <section className="px-4 mt-4">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-5"
          >
            <div>
              <label className="block text-sm text-zinc-500 mb-1.5">日付</label>
              <input
                type="date" value={form.date}
                onChange={(e) => { setField("date", e.target.value); loadDate(e.target.value); }}
                className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 text-base"
              />
            </div>
            {formSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold text-zinc-500 mb-2">{section.title}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {section.fields.map((f) => (
                    <label key={f.key} className="block">
                      <span className="block text-xs text-zinc-500 mb-1">
                        {f.label}{f.unit ? `(${f.unit})` : ""}
                      </span>
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*"
                        value={(form[f.key] as number) || ""}
                        onChange={(e) => setField(f.key, e.target.value.replace(/[^0-9]/g, ""))}
                        className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-right text-base tabular-nums"
                        placeholder="0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <button
              type="submit" disabled={saving}
              className="w-full min-h-[52px] rounded-lg bg-emerald-600 active:bg-emerald-800 text-white font-semibold py-4 text-base disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存する"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
      {/* ============ SIKKENトップバー ============ */}
      <div style={{
        background: "#064e3b", display: "flex", justifyContent: "space-between",
        alignItems: "center", padding: "0 24px", height: 48,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.06em" }}>
          SIKKEN GROUP 経営OS
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {role === "admin" && (
            <div style={{ display: "flex", gap: 2, background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: 2 }}>
              <button type="button" onClick={() => setViewMode("business")}
                style={{ padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, border: "none",
                  background: viewMode === "business" ? "#fff" : "transparent",
                  color: viewMode === "business" ? "#059669" : "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                事業別
              </button>
              <button type="button" onClick={() => setViewMode("company")}
                style={{ padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, border: "none",
                  background: viewMode === "company" ? "#fff" : "transparent",
                  color: viewMode === "company" ? "#059669" : "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                会社別
              </button>
            </div>
          )}
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
            {currentYear}年{currentMonth}月{new Date().getDate()}日時点
          </span>
        </div>
      </div>

      {/* ============ グリーンヘッダー: タブ + ヒーロー + KPIストリップ ============ */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        {/* 事業別ビュー: 事業タブ + エリアタブ */}
        {viewMode === "business" && (
          <>
            {/* 事業タブ */}
            <div style={{ display: "flex", gap: 4, padding: "8px 20px 0", overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              {BUSINESSES.map((b) => (
                <button key={b.id} type="button" onClick={() => setActiveBusiness(b.id)}
                  style={{
                    padding: "6px 14px", borderRadius: "8px 8px 0 0",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                    background: activeBusiness === b.id ? "rgba(255,255,255,0.25)" : "transparent",
                    color: activeBusiness === b.id ? "#fff" : "rgba(255,255,255,0.55)",
                    whiteSpace: "nowrap",
                  }}>
                  {b.label}
                </button>
              ))}
            </div>
            {/* エリアタブ */}
            <div style={{ display: "flex", gap: 4, padding: "6px 20px 0", overflowX: "auto" }}>
              {businessAreas.map((a) => (
                <button key={a.id} type="button" onClick={() => setActiveTab(a.id)}
                  style={{
                    padding: "8px 16px", borderRadius: "8px 8px 0 0",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                    background: activeTab === a.id ? "rgba(255,255,255,0.18)" : "transparent",
                    color: activeTab === a.id ? "#fff" : "rgba(255,255,255,0.65)",
                    whiteSpace: "nowrap",
                  }}>
                  {a.name}
                </button>
              ))}
              {role === "admin" && (
                <button type="button" onClick={() => setActiveTab(GROUP_TAB)}
                  style={{
                    padding: "8px 16px", borderRadius: "8px 8px 0 0",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                    background: isGroup ? "rgba(255,255,255,0.18)" : "transparent",
                    color: isGroup ? "#fff" : "rgba(255,255,255,0.65)",
                    whiteSpace: "nowrap",
                  }}>
                  グループ全体
                </button>
              )}
            </div>
          </>
        )}

        {/* 会社別ビュー: 会社タブ */}
        {viewMode === "company" && (
          <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", overflowX: "auto" }}>
            {[{ id: "__all__", name: "全社合計" }, ...COMPANIES.map(c => ({ id: c.id, name: c.name }))].map((c) => (
              <button key={c.id} type="button" onClick={() => setActiveCompany(c.id)}
                style={{
                  padding: "8px 16px", borderRadius: "8px 8px 0 0",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none",
                  background: activeCompany === c.id ? "rgba(255,255,255,0.18)" : "transparent",
                  color: activeCompany === c.id ? "#fff" : "rgba(255,255,255,0.65)",
                  whiteSpace: "nowrap",
                }}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* ヒーロー */}
        <div style={{ padding: "14px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <button type="button" onClick={gotoPrevMonth}
                  style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 14 }}>◀</button>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{viewYear}年{viewMonth}月</span>
                <button type="button" onClick={gotoNextMonth} disabled={isCurrentMonth}
                  style={{
                    background: "rgba(255,255,255,0.15)", border: "none",
                    color: isCurrentMonth ? "rgba(255,255,255,0.3)" : "#fff",
                    borderRadius: 6, padding: "3px 10px",
                    cursor: isCurrentMonth ? "default" : "pointer", fontSize: 14,
                  }}>▶</button>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
                {viewMode === "company" ? headerLabel : <>{headerLabel}{!isGroup && "エリア"}</>}
                {viewMode === "business" && activeBusiness !== "water" && (
                  <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8, opacity: 0.7 }}>({activeBusinessLabel})</span>
                )}
              </h1>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                {viewYear}年{viewMonth}月 / {isCurrentMonth ? now.getDate() : displaySummary.daysInMonth}日時点 ｜ 月末着地予測 {(() => {
                  const forecastRevenue = isCurrentMonth && now.getDate() > 0
                    ? Math.round(displaySummary.totalRevenue / now.getDate() * displaySummary.daysInMonth)
                    : displaySummary.totalRevenue;
                  return forecastRevenue > 0 ? yen(forecastRevenue) : "¥0";
                })()} ｜ 達成率{" "}
                <strong style={{ color: "#86efac" }}>
                  {targets.targetSales > 0 ? (
                    isCurrentMonth && now.getDate() > 0
                      ? Math.round(displaySummary.totalRevenue / now.getDate() * displaySummary.daysInMonth / targets.targetSales * 100)
                      : Math.round(displaySummary.totalRevenue / Math.max(targets.targetSales, 1) * 100)
                  ) + "%" : "未設定"}
                </strong>
                {monthlySummary && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.2)",
                    color: "#fff", borderRadius: 4, padding: "2px 8px", marginLeft: 8,
                  }}>
                    過去データ
                  </span>
                )}
                {yoyMonthlySummary && Number(yoyMonthlySummary.total_revenue ?? 0) > 0 && (() => {
                  const yoyRevenue = Number(yoyMonthlySummary.total_revenue);
                  const yoyRate = Math.round((displaySummary.totalRevenue - yoyRevenue) / yoyRevenue * 1000) / 10;
                  return (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: yoyRate >= 0 ? "rgba(134,239,172,0.3)" : "rgba(252,165,165,0.3)",
                      color: "#fff", borderRadius: 4, padding: "2px 8px", marginLeft: 8,
                    }}>
                      前年同月比: {yoyRate >= 0 ? "+" : ""}{yoyRate.toFixed(1)}%
                    </span>
                  );
                })()}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  const area = activeTab;
                  const areaName = isGroup ? "グループ全体" : (AREAS.find(a => a.id === area)?.name ?? area);
                  const currentM = new Date().getMonth() + 1;
                  const currentY = new Date().getFullYear();
                  const months: { y: number; m: number }[] = [];
                  for (let y = 2025; y <= currentY; y++) {
                    const startM = y === 2025 ? 1 : 1;
                    const endM = y === currentY ? currentM : 12;
                    for (let m = startM; m <= endM; m++) months.push({ y, m });
                  }
                  Promise.all(
                    months.map(({ y, m }) =>
                      fetch(`/api/monthly-summary?area=${area}&year=${y}&month=${m}&category=${activeBusiness}`)
                        .then(r => r.ok ? r.json() : { summary: null })
                        .then(j => ({ y, m, s: j.summary }))
                    )
                  ).then(results => {
                    const header = "エリア,年月,売上,粗利,粗利率,件数,客単価,広告費,広告費率,CPA,入電件数,成約率,HELP売上,HELP件数,車両数";
                    const rows = results
                      .filter(r => r.s)
                      .map(({ y, m, s }) => {
                        const rev = Number(s.total_revenue ?? 0);
                        const profit = Number(s.total_profit ?? 0);
                        const profitRate = rev > 0 ? (profit / rev * 100).toFixed(1) : "0";
                        const count = Number(s.total_count ?? 0);
                        const unitPrice = count > 0 ? Math.round(rev / count) : 0;
                        const adCost = Number(s.ad_cost ?? 0);
                        const adRate = rev > 0 ? (adCost / rev * 100).toFixed(1) : "0";
                        const callCount = Number(s.call_count ?? 0);
                        const cpa = count > 0 ? Math.round(adCost / count) : 0;
                        const convRate = callCount > 0 ? (count / callCount * 100).toFixed(1) : "0";
                        const helpRev = Number(s.help_revenue ?? 0);
                        const helpCount = Number(s.help_count ?? 0);
                        const vehicleCount = Number(s.vehicle_count ?? 0);
                        return `${areaName},${y}年${m}月,${rev},${profit},${profitRate}%,${count},${unitPrice},${adCost},${adRate}%,${cpa},${callCount},${convRate}%,${helpRev},${helpCount},${vehicleCount}`;
                      });
                    const bom = "\uFEFF";
                    const csv = bom + header + "\n" + rows.join("\n");
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${areaName}_月次サマリー.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  });
                }}
                style={{
                  background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
                  color: "#fff", borderRadius: 6, padding: "4px 12px", cursor: "pointer",
                  fontSize: 11, fontWeight: 600,
                }}
              >
                CSV出力
              </button>
              <div style={{ textAlign: "right", lineHeight: 1.2 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>残り</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                  {isCurrentMonth ? getDaysInMonth(viewYear, viewMonth) - now.getDate() : 0}日
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                  経過 {isCurrentMonth ? now.getDate() : getDaysInMonth(viewYear, viewMonth)} / {getDaysInMonth(viewYear, viewMonth)}日
                </div>
              </div>
            </div>
          </div>

          {/* KPIストリップ */}
          {!isGroup && (() => {
            const dim = displaySummary.daysInMonth;
            const elapsed = isCurrentMonth ? now.getDate() : dim;
            const landing = (v: number) => isCurrentMonth && elapsed > 0 ? Math.round(v / elapsed * dim) : v;
            const lRate = (landVal: number, target: number) => target > 0 && landVal > 0 ? Math.round(landVal / target * 1000) / 10 : null;
            const lRevenue = landing(displaySummary.totalRevenue);
            const lProfit = landing(displaySummary.totalProfit);
            const lAdCost = landing(displaySummary.totalAdCost);
            const lCount = landing(displaySummary.totalCount);
            const kpis = [
              { label: "売上", val: yen(displaySummary.totalRevenue),
                targetRatio: targets.targetSales > 0 ? Math.round(displaySummary.totalRevenue / targets.targetSales * 1000) / 10 : null,
                landRate: lRate(lRevenue, targets.targetSales), landLabel: lRevenue > 0 ? yen(lRevenue) : null, landInvert: false,
                momVal: momRevenue, momInvert: false,
                momDiff: momRevenue !== null ? `${displaySummary.totalRevenue - prevSummaryCalc.totalRevenue >= 0 ? "+" : ""}¥${Math.abs(displaySummary.totalRevenue - prevSummaryCalc.totalRevenue).toLocaleString()}` : null,
              },
              { label: "粗利", val: yen(displaySummary.totalProfit),
                targetRatio: targets.targetProfit > 0 ? Math.round(displaySummary.totalProfit / targets.targetProfit * 1000) / 10 : null,
                landRate: lRate(lProfit, targets.targetProfit), landLabel: lProfit > 0 ? yen(lProfit) : null, landInvert: false,
                momVal: momProfit, momInvert: false,
                momDiff: momProfit !== null ? `${displaySummary.totalProfit - prevSummaryCalc.totalProfit >= 0 ? "+" : ""}¥${Math.abs(displaySummary.totalProfit - prevSummaryCalc.totalProfit).toLocaleString()}` : null,
              },
              { label: "広告費", val: yen(displaySummary.totalAdCost),
                targetRatio: targets.targetAdCost > 0 ? Math.round(displaySummary.totalAdCost / targets.targetAdCost * 1000) / 10 : null,
                landRate: lRate(lAdCost, targets.targetAdCost), landLabel: lAdCost > 0 ? yen(lAdCost) : null, landInvert: true,
                momVal: momAdCost, momInvert: true,
                momDiff: momAdCost !== null ? `${displaySummary.totalAdCost - prevSummaryCalc.totalAdCost >= 0 ? "+" : ""}¥${Math.abs(displaySummary.totalAdCost - prevSummaryCalc.totalAdCost).toLocaleString()}` : null,
              },
              { label: "合計件数", val: `${displaySummary.totalCount}件`,
                targetRatio: targets.targetCount > 0 ? Math.round(displaySummary.totalCount / targets.targetCount * 1000) / 10 : null,
                landRate: lRate(lCount, targets.targetCount), landLabel: lCount > 0 ? `${lCount}件` : null, landInvert: false,
                momVal: momCount, momInvert: false,
                momDiff: momCount !== null ? `${displaySummary.totalCount - prevSummaryCalc.totalCount >= 0 ? "+" : ""}${displaySummary.totalCount - prevSummaryCalc.totalCount}件` : null,
              },
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                {kpis.map((kpi) => (
                  <div key={kpi.label} style={{ padding: "14px 18px", borderRight: "1px solid rgba(255,255,255,0.12)" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{kpi.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{kpi.val}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
                      {kpi.targetRatio !== null && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                          background: kpi.targetRatio >= 100 ? "#d1fae5" : kpi.targetRatio >= 80 ? "#fef9c3" : "#fee2e2",
                          color: kpi.targetRatio >= 100 ? "#065f46" : kpi.targetRatio >= 80 ? "#854d0e" : "#991b1b",
                        }}>目標比 {kpi.targetRatio}%</span>
                      )}
                      {kpi.landRate !== null ? (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                          background: kpi.landInvert
                            ? (kpi.landRate <= 100 ? "#d1fae5" : kpi.landRate <= 120 ? "#fef9c3" : "#fee2e2")
                            : (kpi.landRate >= 100 ? "#d1fae5" : kpi.landRate >= 80 ? "#fef9c3" : "#fee2e2"),
                          color: kpi.landInvert
                            ? (kpi.landRate <= 100 ? "#065f46" : kpi.landRate <= 120 ? "#854d0e" : "#991b1b")
                            : (kpi.landRate >= 100 ? "#065f46" : kpi.landRate >= 80 ? "#854d0e" : "#991b1b"),
                        }}>着地 {kpi.landRate}%</span>
                      ) : kpi.landLabel ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                          background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)" }}>着地 {kpi.landLabel}</span>
                      ) : null}
                    </div>
                    {kpi.momVal === null ? (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>前月比 —</div>
                    ) : (
                      <div style={{ fontSize: 11, fontWeight: 700,
                        color: (kpi.momInvert ? kpi.momVal <= 0 : kpi.momVal >= 0) ? "#86efac" : "#fca5a5" }}>
                        {kpi.momVal >= 0 ? "\u2191" : "\u2193"} 前月比 {kpi.momVal >= 0 ? "+" : ""}{kpi.momVal}%
                        {kpi.momDiff && ` (${kpi.momDiff})`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ============ ボディ ============ */}
      <div style={{ padding: "16px 20px", background: "#f2f5f2" }}>

      {/* 異常アラート */}
      {isAlert && (
        <div style={{
          marginBottom: 14, borderRadius: 10, background: "#dc2626", color: "#fff",
          padding: "10px 14px", fontSize: 12, fontWeight: 700,
        }}>
          🚨 利益予測が前日比 {profitDropRate.toFixed(1)}% 急落しています
          {" "}（前日 {yen(yesterdaySummary.forecastProfit)} → 現在 {yen(displaySummary.forecastProfit)}, 差 {diff >= 0 ? "+" : ""}{yen(diff)}）
          {" "}残追加見積必要 {!isGroup && breakeven.fixedTotal > 0 && breakeven.remainingCount > 0 && `あと ${breakeven.remainingCount} 件`}
          {!isGroup && targets.targetCount > 0 && achievement.remainingCount > 0 && ` / 目標達成まで ${achievement.remainingCount} 件`}
          {weekdayForecast.forecastProfit + recent7Forecast.forecastProfit > 0 && ""}
        </div>
      )}

      {/* 1日あたりの目安 */}
      {!isGroup && targets.targetSales > 0 && (() => {
        const todayElapsed = isCurrentMonth ? now.getDate() : displaySummary.daysInMonth;
        const remain = displaySummary.daysInMonth - todayElapsed;
        const cards = [
          { label: "全体売上",
            val: remain > 0 ? yen(Math.round((targets.targetSales - displaySummary.totalRevenue) / remain)) + "/日" : "—",
            sub: `残り ${yen(Math.max(0, targets.targetSales - displaySummary.totalRevenue))}`,
            type: displaySummary.totalRevenue / Math.max(1, todayElapsed) * displaySummary.daysInMonth >= targets.targetSales * 0.9 ? "g" : "y" },
          { label: "全体粗利",
            val: remain > 0 ? yen(Math.round((targets.targetProfit - displaySummary.totalProfit) / remain)) + "/日" : "\u2014",
            sub: `残り ${yen(Math.max(0, targets.targetProfit - displaySummary.totalProfit))}`,
            type: displaySummary.totalProfit / Math.max(1, todayElapsed) * displaySummary.daysInMonth >= targets.targetProfit * 0.9 ? "g" : "y" },
          { label: "獲得件数",
            val: remain > 0 ? `${Math.ceil((targets.targetCount - displaySummary.totalCount) / remain)}件/日` : "—",
            sub: `残り ${Math.max(0, targets.targetCount - displaySummary.totalCount)}件`,
            type: displaySummary.totalCount >= targets.targetCount ? "g" : "y" },
          { label: "HELP売上",
            val: remain > 0 && targets.targetHelpSales > 0 ? yen(Math.round((targets.targetHelpSales - displaySummary.help.revenue) / remain)) + "/日" : "—",
            sub: targets.targetHelpSales > 0 ? `残り ${yen(Math.max(0, targets.targetHelpSales - displaySummary.help.revenue))}` : "目標未設定",
            type: "y" },
          { label: "HELP件数",
            val: remain > 0 && targets.targetHelpCount > 0 ? `${Math.ceil((targets.targetHelpCount - displaySummary.help.count) / remain)}件/日` : "—",
            sub: targets.targetHelpCount > 0 ? `残り ${Math.max(0, targets.targetHelpCount - displaySummary.help.count)}件` : "目標未設定",
            type: "y" },
          { label: "工事取得率",
            val: `${displaySummary.constructionRate.toFixed(1)}%`,
            sub: `目標 ${targets.targetConstructionRate > 0 ? targets.targetConstructionRate.toFixed(1) : "—"}%`,
            type: targets.targetConstructionRate > 0 && displaySummary.constructionRate < targets.targetConstructionRate * 0.9 ? "r" : "y" },
        ];
        return (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel>目標達成に向けた 1日あたりの目安</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
              {cards.map((c) => (
                <div key={c.label} style={{
                  borderRadius: 10, padding: "12px 10px",
                  background: c.type === "g" ? "#f0fdf4" : c.type === "r" ? "#fff1f2" : "#fffbeb",
                  border: `1.5px solid ${c.type === "g" ? "#bbf7d0" : c.type === "r" ? "#fecdd3" : "#fde68a"}`,
                }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, textAlign: "center", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
                  <div style={{
                    fontSize: 17, fontWeight: 800, textAlign: "center", whiteSpace: "nowrap",
                    color: c.type === "g" ? "#16a34a" : c.type === "r" ? "#dc2626" : "#d97706",
                  }}>{c.val}</div>
                  <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", marginTop: 3 }}>{c.sub}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ============ 全17項目 指標一覧 ============ */}
      {!isGroup && (
        <section style={{ marginBottom: 16 }}>
          <SectionLabel>全17項目 指標一覧</SectionLabel>
          <div style={{
            display: "flex", flexDirection: isMobile ? "column" : "row", gap: 0, background: "#fff",
            borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden",
          }}>
            <div style={{ flex: 1, minWidth: 0, borderRight: isMobile ? "none" : "1px solid #d1fae5", borderBottom: isMobile ? "1px solid #d1fae5" : "none" }}>
              <MetricsTable rows={metricRowsResult.left} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MetricsTable rows={metricRowsResult.right} />
            </div>
          </div>
        </section>
      )}

      {/* ============ グループ: エリア別実績テーブル ============ */}
      {isGroup && perAreaSummaries.length > 0 && (() => {
        const gTotal = perAreaSummaries.reduce((acc, { summary: s }) => ({
          revenue: acc.revenue + s.totalRevenue, profit: acc.profit + s.totalProfit,
          count: acc.count + s.totalCount, adCost: acc.adCost + s.totalAdCost,
        }), { revenue: 0, profit: 0, count: 0, adCost: 0 });
        const sorted = [...perAreaSummaries].sort((a, b) => b.summary.totalProfit - a.summary.totalProfit);
        const topId = sorted[0]?.area.id;
        return (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden", marginBottom: 16 }}>
            <div style={{ background: "#ecfdf5", padding: "10px 16px", borderBottom: "1px solid #d1fae5",
              fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              エリア別実績
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "12%" }} /><col style={{ width: "16%" }} /><col style={{ width: "10%" }} />
                <col style={{ width: "16%" }} /><col style={{ width: "10%" }} /><col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#f8fdf8" }}>
                  {["エリア", "売上", "売上比", "粗利", "粗利率", "広告費", "件数", "状態"].map((h, i) => (
                    <th key={h} style={{ padding: "7px 10px", fontSize: 9, fontWeight: 700, color: "#6b7280",
                      textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #d1fae5",
                      textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ area, summary: s }) => {
                  const hasData = s.totalRevenue > 0;
                  const profitRate = hasData ? s.totalProfit / s.totalRevenue * 100 : 0;
                  const shareRatio = gTotal.revenue > 0 ? (s.totalRevenue / gTotal.revenue * 100).toFixed(1) : "0.0";
                  const isTop = area.id === topId;
                  return (
                    <tr key={area.id} style={{ borderBottom: "1px solid #f0faf0", background: isTop ? "#f0fdf4" : "transparent" }}>
                      <td style={{ padding: "9px 10px", fontSize: 13, fontWeight: 700, color: "#111",
                        borderLeft: isTop ? "3px solid #059669" : "3px solid transparent" }}>
                        {isTop && "🏆 "}{area.name}
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, textAlign: "right", color: hasData ? "#111" : "#d1d5db" }}>
                        {hasData ? yen(s.totalRevenue) : "\u2014"}
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: 11, textAlign: "right", color: "#6b7280" }}>{hasData ? `${shareRatio}%` : "\u2014"}</td>
                      <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, textAlign: "right", color: hasData ? "#059669" : "#d1d5db" }}>
                        {hasData ? yen(s.totalProfit) : "\u2014"}
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: 11, textAlign: "right",
                        color: profitRate >= 25 ? "#059669" : profitRate >= 15 ? "#d97706" : "#dc2626" }}>
                        {hasData ? `${profitRate.toFixed(1)}%` : "\u2014"}
                      </td>
                      <td style={{ padding: "9px 10px", fontSize: 11, textAlign: "right", color: "#d97706" }}>{hasData ? yen(s.totalAdCost) : "\u2014"}</td>
                      <td style={{ padding: "9px 10px", fontSize: 12, textAlign: "right", color: "#374151" }}>{hasData ? `${s.totalCount}件` : "\u2014"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right" }}>
                        {hasData ? (
                          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px",
                            background: profitRate >= 25 ? "#d1fae5" : profitRate >= 15 ? "#fef9c3" : "#fee2e2",
                            color: profitRate >= 25 ? "#065f46" : profitRate >= 15 ? "#854d0e" : "#991b1b" }}>
                            {profitRate >= 25 ? "良好" : profitRate >= 15 ? "注意" : "要改善"}
                          </span>
                        ) : <span style={{ color: "#d1d5db", fontSize: 11 }}>未入力</span>}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#f0fdf4", borderTop: "2px solid #d1fae5" }}>
                  <td style={{ padding: "10px", fontSize: 13, fontWeight: 800, color: "#065f46", borderLeft: "3px solid #059669" }}>グループ合計</td>
                  <td style={{ padding: "10px", fontSize: 13, fontWeight: 800, textAlign: "right", color: "#065f46" }}>{yen(gTotal.revenue)}</td>
                  <td style={{ padding: "10px", fontSize: 11, textAlign: "right", color: "#9ca3af" }}>100%</td>
                  <td style={{ padding: "10px", fontSize: 13, fontWeight: 800, textAlign: "right", color: "#059669" }}>{yen(gTotal.profit)}</td>
                  <td style={{ padding: "10px", fontSize: 12, fontWeight: 700, textAlign: "right",
                    color: gTotal.revenue > 0 && gTotal.profit / gTotal.revenue * 100 >= 25 ? "#059669" : "#d97706" }}>
                    {gTotal.revenue > 0 ? `${(gTotal.profit / gTotal.revenue * 100).toFixed(1)}%` : "\u2014"}
                  </td>
                  <td style={{ padding: "10px", fontSize: 12, fontWeight: 700, textAlign: "right", color: "#d97706" }}>{yen(gTotal.adCost)}</td>
                  <td style={{ padding: "10px", fontSize: 13, fontWeight: 800, textAlign: "right", color: "#065f46" }}>{gTotal.count}件</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>
                    <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px", background: "#d1fae5", color: "#065f46" }}>総合計</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ============ 部門別 実績・月末予測 ============ */}
      <section style={{ marginBottom: 16 }}>
        <SectionLabel>部門別 実績・月末予測</SectionLabel>
        <DeptTable
          summary={displaySummary}
          targets={targets}
          daysElapsed={displaySummary.daysElapsed}
          daysInMonth={displaySummary.daysInMonth}
        />
      </section>

      {/* 編集不可エリアの表示 */}
      {!canEdit && !isGroup && (
        <div style={{
          margin: "12px 0", padding: "10px 16px", background: "#fef9c3",
          borderRadius: 8, border: "1px solid #fde68a", fontSize: 12, color: "#854d0e", fontWeight: 600,
        }}>
          このエリアは閲覧のみ可能です（編集権限がありません）
        </div>
      )}

      {/* ============ 入力フォーム (折りたたみ式) ============ */}
      {canEdit && !isGroup && (
        <section style={{ marginBottom: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
            <div
              onClick={() => setInputOpen((prev) => !prev)}
              style={{
                padding: "12px 18px", display: "flex", justifyContent: "space-between",
                alignItems: "center", cursor: "pointer", background: "#f8fdf8",
                borderBottom: inputOpen ? "1px solid #d1fae5" : "none",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: "#065f46" }}>
                {activeArea?.name} 日次入力
              </span>
              <button type="button"
                style={{
                  fontSize: 11, background: "#059669", color: "#fff", border: "none",
                  borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontWeight: 600,
                }}>
                {inputOpen ? "▲ 閉じる" : "▼ 入力フォームを開く"}
              </button>
            </div>
            {inputOpen && (
              <div style={{ padding: 16 }}>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm text-zinc-500 mb-1.5">日付</label>
                    <input
                      type="date" value={form.date}
                      onChange={(e) => { setField("date", e.target.value); loadDate(e.target.value); }}
                      className="w-full min-h-[44px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 py-3 text-base"
                    />
                  </div>
                  {formSections.map((section) => (
                    <div key={section.title}>
                      <h3 className="text-sm font-semibold text-zinc-500 mb-2">{section.title}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {section.fields.map((f) => (
                          <label key={f.key} className="block">
                            <span className="block text-xs text-zinc-500 mb-1">
                              {f.label}{f.unit ? `(${f.unit})` : ""}
                            </span>
                            <input
                              type="text" inputMode="numeric" pattern="[0-9]*"
                              value={(form[f.key] as number) || ""}
                              onChange={(e) => setField(f.key, e.target.value.replace(/[^0-9]/g, ""))}
                              className="w-full min-h-[44px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-right text-base tabular-nums"
                              placeholder="0"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {saveError && <p className="text-sm text-red-500">{saveError}</p>}
                  <button type="submit" disabled={saving}
                    className="w-full min-h-[48px] rounded-lg bg-emerald-600 active:bg-emerald-800 text-white font-semibold py-3 disabled:opacity-50">
                    {saving ? "保存中..." : "保存する"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: "#6b7280",
      textTransform: "uppercase", letterSpacing: "0.1em",
      marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
    }}>
      {children}
      <div style={{ flex: 1, height: 1, background: "#d1fae5" }} />
    </div>
  );
}

function MetricsTable({ rows }: { rows: MetricRow[] }) {
  const badge = (level: string, text: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
      good: { bg: "#d1fae5", color: "#065f46" },
      warn: { bg: "#fef9c3", color: "#854d0e" },
      bad:  { bg: "#fee2e2", color: "#991b1b" },
      none: { bg: "transparent", color: "#d1d5db" },
    };
    const s = styles[level] ?? styles.none;
    return (
      <span style={{
        display: "inline-block", fontSize: 10, fontWeight: 700,
        borderRadius: 4, padding: "2px 7px",
        background: s.bg, color: s.color,
      }}>{text}</span>
    );
  };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <thead>
        <tr style={{ background: "#ecfdf5" }}>
          {["指標", "実績", "売上比", "目標比", "着地見込"].map((h) => (
            <th key={h} style={{
              padding: "7px 10px", fontSize: 10, fontWeight: 700,
              color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em",
              borderBottom: "1px solid #d1fae5",
              textAlign: h === "指標" ? "left" : "right",
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: "1px solid #f0faf0" }}>
            <td style={{
              padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#111",
              borderLeft: `3px solid ${row.lineColor}`, paddingLeft: 10,
            }}>{row.name}</td>
            <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "#111", textAlign: "right" }}>
              {row.value}
              {row.subValue && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: row.subValueColor ?? "#9ca3af",
                  marginLeft: 3,
                  background: row.subValueColor === "#065f46" ? "#d1fae5"
                    : row.subValueColor === "#854d0e" ? "#fef9c3"
                    : row.subValueColor === "#991b1b" ? "#fee2e2" : "transparent",
                  borderRadius: 3, padding: "1px 4px",
                }}>
                  {row.subValue}
                </span>
              )}
            </td>
            <td style={{ padding: "8px 10px", fontSize: 11, color: "#9ca3af", textAlign: "right" }}>
              {row.salesRatio ?? "—"}
            </td>
            <td style={{ padding: "8px 10px", textAlign: "right" }}>
              {row.targetRatio !== null
                ? badge(row.targetRatio >= 100 ? "good" : row.targetRatio >= 80 ? "warn" : "bad", `${row.targetRatio.toFixed(1)}%`)
                : <span style={{ color: "#d1d5db", fontSize: 10 }}>未設定</span>}
            </td>
            <td style={{ padding: "8px 10px", textAlign: "right" }}>
              {row.landingRate !== null ? (
                <span style={{
                  display: "inline-block", fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "2px 7px",
                  background: row.landingRate >= 100 ? "#d1fae5" : row.landingRate >= 80 ? "#fef9c3" : "#fee2e2",
                  color: row.landingRate >= 100 ? "#065f46" : row.landingRate >= 80 ? "#854d0e" : "#991b1b",
                }}>{row.landingRate}%</span>
              ) : row.landingValue > 0 ? (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  {row.name.includes("件") ? `${row.landingValue}件` : `¥${row.landingValue.toLocaleString()}`}
                </span>
              ) : (
                <span style={{ color: "#d1d5db", fontSize: 11 }}>{"\u2014"}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeptTable({ summary, targets, daysElapsed, daysInMonth }: {
  summary: DashboardSummary;
  targets: Targets;
  daysElapsed: number;
  daysInMonth: number;
}) {
  const ratio = daysElapsed > 0 ? daysInMonth / daysElapsed : 0;

  const badge = (targetRatio: number | null) => {
    if (targetRatio === null) return <span style={{ color: "#d1d5db", fontSize: 9 }}>未設定</span>;
    const level = targetRatio >= 100 ? "good" : targetRatio >= 80 ? "warn" : "bad";
    const styles = {
      good: { bg: "#d1fae5", color: "#065f46" },
      warn: { bg: "#fef9c3", color: "#854d0e" },
      bad:  { bg: "#fee2e2", color: "#991b1b" },
    } as const;
    const s = styles[level];
    return (
      <span style={{
        display: "inline-block", fontSize: 10, fontWeight: 700,
        borderRadius: 4, padding: "2px 7px",
        background: s.bg, color: s.color,
      }}>{targetRatio.toFixed(1)}%</span>
    );
  };

  const depts = [
    {
      name: "自社施工", color: "#059669",
      revenue: summary.self.revenue, profit: summary.self.profit,
      count: summary.self.count, unitPrice: summary.self.unitPrice,
      targetRevenue: targets.targetSelfSales, targetProfit: targets.targetSelfProfit,
    },
    {
      name: "新規営業", color: "#3b82f6",
      revenue: summary.newSales.revenue, profit: summary.newSales.profit,
      count: summary.newSales.count, unitPrice: summary.newSales.unitPrice,
      targetRevenue: targets.targetNewSales, targetProfit: targets.targetNewProfit,
    },
    {
      name: "HELP", color: "#0891b2",
      revenue: summary.help.revenue, profit: summary.help.profit,
      count: summary.help.count, unitPrice: summary.help.unitPrice,
      targetRevenue: targets.targetHelpSales, targetProfit: targets.targetProfit,
    },
  ];

  const total = {
    revenue: depts.reduce((s, d) => s + d.revenue, 0),
    profit: depts.reduce((s, d) => s + d.profit, 0),
    count: depts.reduce((s, d) => s + d.count, 0),
  };

  const thStyle: React.CSSProperties = {
    padding: "8px 10px", fontSize: 10, fontWeight: 700,
    color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em",
    borderBottom: "1px solid #d1fae5", textAlign: "right", background: "#ecfdf5",
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "9px 10px", fontSize: 12, color: "#374151",
    borderBottom: "1px solid #f0faf0", textAlign: "right", whiteSpace: "nowrap",
  };

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "11%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "6%" }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: "left" }}>部門</th>
            <th style={thStyle}>売上(実績)</th>
            <th style={thStyle}>目標比</th>
            <th style={thStyle}>売上(月末予測)</th>
            <th style={thStyle}>粗利(実績)</th>
            <th style={thStyle}>目標比</th>
            <th style={thStyle}>粗利(月末予測)</th>
            <th style={thStyle}>客単価</th>
            <th style={thStyle}>件数</th>
            <th style={thStyle}>粗利率</th>
          </tr>
        </thead>
        <tbody>
          {depts.map((d) => {
            const forecastRevenue = Math.round(d.revenue * ratio);
            const forecastProfit = Math.round(d.profit * ratio);
            const marginRate = d.revenue > 0 ? (d.profit / d.revenue * 100).toFixed(1) : "0.0";
            const revRatio = d.targetRevenue > 0 ? Math.round(d.revenue / d.targetRevenue * 1000) / 10 : null;
            const profitRatio = d.targetProfit > 0 ? Math.round(d.profit / d.targetProfit * 1000) / 10 : null;
            return (
              <tr key={d.name}>
                <td style={{
                  ...tdStyle, textAlign: "left", fontWeight: 700, color: "#111", fontSize: 13,
                  borderLeft: `3px solid ${d.color}`, paddingLeft: 10,
                }}>{d.name}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#111" }}>¥{d.revenue.toLocaleString()}</td>
                <td style={tdStyle}>{badge(revRatio)}</td>
                <td style={{ ...tdStyle, color: "#059669", fontWeight: 700 }}>¥{forecastRevenue.toLocaleString()}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: "#111" }}>¥{d.profit.toLocaleString()}</td>
                <td style={tdStyle}>{badge(profitRatio)}</td>
                <td style={{ ...tdStyle, color: "#059669", fontWeight: 700 }}>¥{forecastProfit.toLocaleString()}</td>
                <td style={tdStyle}>¥{d.unitPrice.toLocaleString()}</td>
                <td style={tdStyle}>{d.count}件</td>
                <td style={tdStyle}>{marginRate}%</td>
              </tr>
            );
          })}
          <tr style={{ background: "#f0fdf4" }}>
            <td style={{
              ...tdStyle, textAlign: "left", fontWeight: 700, color: "#065f46",
              borderLeft: "3px solid #059669", paddingLeft: 10, borderBottom: "none",
            }}>合計</td>
            <td style={{ ...tdStyle, fontWeight: 700, color: "#065f46", borderBottom: "none" }}>
              ¥{total.revenue.toLocaleString()}
            </td>
            <td style={{ ...tdStyle, borderBottom: "none" }}>
              {badge(targets.targetSales > 0 ? Math.round(total.revenue / targets.targetSales * 1000) / 10 : null)}
            </td>
            <td style={{ ...tdStyle, color: "#059669", fontWeight: 700, borderBottom: "none" }}>
              ¥{Math.round(total.revenue * ratio).toLocaleString()}
            </td>
            <td style={{ ...tdStyle, fontWeight: 700, color: "#065f46", borderBottom: "none" }}>
              ¥{total.profit.toLocaleString()}
            </td>
            <td style={{ ...tdStyle, borderBottom: "none" }}>
              {badge(targets.targetProfit > 0 ? Math.round(total.profit / targets.targetProfit * 1000) / 10 : null)}
            </td>
            <td style={{ ...tdStyle, color: "#059669", fontWeight: 700, borderBottom: "none" }}>
              ¥{Math.round(total.profit * ratio).toLocaleString()}
            </td>
            <td style={{ ...tdStyle, fontWeight: 700, color: "#065f46", borderBottom: "none" }}>
              ¥{total.count > 0 ? Math.round(total.revenue / total.count).toLocaleString() : 0}
            </td>
            <td style={{ ...tdStyle, fontWeight: 700, color: "#065f46", borderBottom: "none" }}>
              {total.count}件
            </td>
            <td style={{ ...tdStyle, fontWeight: 700, color: "#065f46", borderBottom: "none" }}>
              {total.revenue > 0 ? (total.profit / total.revenue * 100).toFixed(1) : "0.0"}%
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
