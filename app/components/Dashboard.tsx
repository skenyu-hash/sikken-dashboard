"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, calculateBreakeven, calculateAchievement,
  forecastWeekday, forecastRecent7, getDaysInMonth,
  // PR c94-B-1: buildMetricRows / type MetricRow 削除 (MetricsTable / MetricsTableMobile 撤去に伴う)
  DailyEntry, FixedCosts, Targets, emptyTargets, manToYen,
  emptyEntry,
  yen,
  filterEntriesByDay, aggregatePrevSameDay, canCompareSameDay, type SameDayAggregate,
} from "../lib/calculations";
import { useRole, useSession } from "./RoleProvider";
import { hasPageAccess, type Role } from "../lib/permissions";
import { logAction } from "../lib/logger";
import { BUSINESSES, AREA_NAMES, type BusinessCategory } from "../lib/businesses";
import { COMPANIES } from "../lib/companies";
import AsOfBadge from "./AsOfBadge";
import LocksmithDashboardSection from "./LocksmithDashboardSection";
import RoadDashboardSection from "./RoadDashboardSection";
import DetectiveDashboardSection from "./DetectiveDashboardSection";
import ElectricDashboardSection from "./ElectricDashboardSection";
import WaterDashboardSection from "./WaterDashboardSection";
import CompanyBreakdownTable from "./dashboard/CompanyBreakdownTable";
import { resolveTotalProfit } from "../lib/profit";
// PR c94-B-1: MetricsTable / MetricsTableMobile 撤去に伴い formatAchievement / GroupType /
//   getGroupBorderColor は本ファイルでの使用が消失 → 削除。
//   MetricBadge / getBadgeColor は KPI ストリップ (line 1071, 1079) で継続使用のため残置。
import { MetricBadge, getBadgeColor } from "./ui";

// PR c94-B-1: WATER_METRIC_TO_GROUP は MetricsTable / MetricsTableMobile 専用だったため
//   両関数撤去に伴い削除。新 WaterDashboardSection は Card group prop で直接管理。

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
  const isInputOnly = role === "clerk";
  const canEditDashboard = role !== null && hasPageAccess({ role: role as Role }, "dashboard", "edit");
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
    // 会社別ビューでは古い目標値（達成率464%等の誤表示の原因）を確実にクリア
    if (viewMode === "company") {
      setTargets(emptyTargets());
      return;
    }
    if (isGroup) return;
    fetch(`/api/fixed-costs?area=${activeTab}&year=${viewYear}&month=${viewMonth}`)
      .then((r) => (r.ok ? r.json() : { fixedCosts: { laborCost: 0, rent: 0, other: 0 } }))
      .then((j: { fixedCosts: FixedCosts }) => setFixedCosts(j.fixedCosts));
    fetch(`/api/targets?area=${activeTab}&year=${viewYear}&month=${viewMonth}&category=${activeBusiness}`)
      .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
      .then((j: { targets: Targets }) => setTargets(manToYen(j.targets)));
  }, [activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);

  const [groupMonthlySummaries, setGroupMonthlySummaries] = useState<Record<string, Record<string, unknown> | null>>({});
  const [crossBusinessData, setCrossBusinessData] = useState<Record<string, { revenue: number; profit: number; adCost: number; count: number }>>({});

  // ============ データ読込: グループ事業別クロス ============
  useEffect(() => {
    if (!isGroup) return;
    Promise.all(
      BUSINESSES.map(async (biz) => {
        const res = await fetch(`/api/monthly-summary-bulk?areas=${biz.areas.join(",")}&year=${viewYear}&category=${biz.id}`);
        const json = res.ok ? await res.json() : { summaries: [] };
        const rows = (json.summaries ?? []) as Array<Record<string, unknown>>;
        const monthRows = rows.filter(r => Number(r.month) === viewMonth);
        type BizAgg = { revenue: number; profit: number; adCost: number; count: number };
        const agg = monthRows.reduce<BizAgg>((acc, r) => ({
          revenue: acc.revenue + Number(r.total_revenue ?? 0),
          profit: acc.profit + resolveTotalProfit(r),
          adCost: acc.adCost + Number(r.ad_cost ?? 0),
          count: acc.count + Number(r.total_count ?? 0),
        }), { revenue: 0, profit: 0, adCost: 0, count: 0 });
        return [biz.id, agg] as const;
      })
    ).then(pairs => {
      const map: typeof crossBusinessData = {};
      for (const [id, agg] of pairs) map[id] = agg;
      setCrossBusinessData(map);
    });
  }, [isGroup, viewYear, viewMonth]);

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
        result.totalProfit += resolveTotalProfit(s);
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

  // ============ 月次サマリー取得（常時、エントリ有無問わず正規データソースとして優先）============
  // 旧仕様: entries.length === 0 のときだけ fetch していたため、daily entries が
  //        1件でもあると monthly_summaries が無視され、画面と DB が乖離していた。
  // 新仕様: monthly_summaries が存在すれば常に displaySummary 側で優先され、
  //        無ければ daily entries の集計（summary）にフォールバック。
  // 関連: KNOWN_ISSUES sec3「月次/日次の集計経路の不整合」を本変更で解消。
  useEffect(() => {
    if (!isGroup && activeTab && viewMode === "business") {
      fetch(`/api/monthly-summary?area=${activeTab}&year=${viewYear}&month=${viewMonth}&category=${activeBusiness}`)
        .then((r) => r.ok ? r.json() : { summary: null })
        .then((j) => setMonthlySummary(j.summary ?? null));
    } else {
      setMonthlySummary(null);
    }
  }, [activeTab, viewYear, viewMonth, isGroup, activeBusiness, viewMode]);

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
        // companyData は会社別ビュー専用の集計型で職人費等を持たない (将来拡張候補)
        totalLaborCost: 0, totalMaterialCost: 0, totalSalesOutsourcingCost: 0,
        outsourcedConstructionCount: 0, internalConstructionCount: 0,
        constructionCount: 0, // PR c93-2: companyData 経路は monthly_summaries 直集計でなく未流入、0 初期化
        internalConstructionProfit: 0, // PR c93-3: 同上 companyData 経路では未流入
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
        const totalProfit = summaries.reduce((s, ms) => s + resolveTotalProfit(ms), 0);
        const totalCount = summaries.reduce((s, ms) => s + Number(ms.total_count ?? 0), 0);
        const totalAdCost = summaries.reduce((s, ms) => s + Number(ms.ad_cost ?? 0), 0);
        const helpRevenue = summaries.reduce((s, ms) => s + Number(ms.help_revenue ?? 0), 0);
        const helpCount = summaries.reduce((s, ms) => s + Number(ms.help_count ?? 0), 0);
        // PR #38 で追加した新 3 列も全エリア合算
        const totalLaborCost = summaries.reduce((s, ms) => s + Number(ms.total_labor_cost ?? 0), 0);
        const totalMaterialCost = summaries.reduce((s, ms) => s + Number(ms.material_cost ?? 0), 0);
        const totalSalesOutsourcingCost = summaries.reduce((s, ms) => s + Number(ms.sales_outsourcing_cost ?? 0), 0);
        // PR #46: 工事件数 2 列を全エリア合算
        const outsourcedConstructionCount = summaries.reduce((s, ms) => s + Number(ms.outsourced_construction_count ?? 0), 0);
        const internalConstructionCount = summaries.reduce((s, ms) => s + Number(ms.internal_construction_count ?? 0), 0);
        // PR c93-2: 対応ベース工事件数を全エリア合算
        const constructionCount = summaries.reduce((s, ms) => s + Number(ms.construction_count ?? 0), 0);
        // PR c93-3: 自社工事利益を全エリア合算 (MetricsTable 独立 row 表示用)
        const internalConstructionProfit = summaries.reduce((s, ms) => s + Number(ms.internal_construction_profit ?? 0), 0);
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
          totalLaborCost, totalMaterialCost, totalSalesOutsourcingCost,
          outsourcedConstructionCount, internalConstructionCount,
          constructionCount, // PR c93-2: 全エリア合算した対応ベース工事件数
          internalConstructionProfit, // PR c93-3: 全エリア合算した自社工事利益
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
      totalProfit: resolveTotalProfit(monthlySummary),
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
      // PR #42: PR #38 で追加した DB 列を流す (旧 hardcode 0 を解消)
      totalLaborCost: Number(monthlySummary.total_labor_cost ?? 0),
      totalMaterialCost: Number(monthlySummary.material_cost ?? 0),
      totalSalesOutsourcingCost: Number(monthlySummary.sales_outsourcing_cost ?? 0),
      // PR #46: 工事件数 2 列を流入 (buildMetricRows で合計に再構成)
      outsourcedConstructionCount: Number(monthlySummary.outsourced_construction_count ?? 0),
      internalConstructionCount: Number(monthlySummary.internal_construction_count ?? 0),
      constructionCount: Number(monthlySummary.construction_count ?? 0), // PR c93-2: 対応ベース工事件数
      internalConstructionProfit: Number(monthlySummary.internal_construction_profit ?? 0), // PR c93-3: 自社工事利益
      daysElapsed: dim,
      daysInMonth: dim,
      grossMargin: Number(monthlySummary.profit_rate ?? 0),
    };
  }, [summary, monthlySummary, viewYear, viewMonth, isGroup, groupEntriesByArea, groupMonthlySummaries, viewMode, companyData]);

  // ============ 前月同日比 ============
  // prevEntries を「今月と同じ経過日数」でフィルタして集計する。
  // summaryToday.getDate() = 当月表示中なら今日の日付、過去月表示中なら月末日。
  // ハードガード: 前月が 2026-04 以前は日次データを参照しない。
  //   filterEntriesByDay の偶然頼みでは月末(maxDay≥30)に April-30 行を誤取得するため
  //   canCompareSameDay で構造的に封殺する。
  const prevSameDayCalc = useMemo((): SameDayAggregate | null => {
    if (prevEntries.length === 0) return null;
    if (!canCompareSameDay(prevYear, prevMonth)) return null;
    const maxDay = summaryToday.getDate();
    const filtered = filterEntriesByDay(prevEntries, maxDay);
    return aggregatePrevSameDay(filtered, activeBusiness, prevYear, prevMonth);
  }, [prevEntries, summaryToday, activeBusiness, prevYear, prevMonth]);

  // 緑部分ヒーロー KPI の前月比も同日比ベースに統一
  const prevSummaryCalc = useMemo(() => {
    if (prevSameDayCalc) {
      const rev = prevSameDayCalc.total_revenue;
      const cnt = prevSameDayCalc.total_count;
      return {
        totalRevenue: rev,
        totalProfit: prevSameDayCalc.total_profit,
        totalAdCost: prevSameDayCalc.ad_cost,
        totalCount: cnt,
        companyUnitPrice: cnt > 0 ? Math.round(rev / cnt) : 0,
      };
    }
    return { totalRevenue: 0, totalProfit: 0, totalAdCost: 0, totalCount: 0, companyUnitPrice: 0 };
  }, [prevSameDayCalc]);

  const mom = (current: number, prev: number): number | null => {
    if (prev <= 0) return null;
    return Math.round((current - prev) / prev * 1000) / 10;
  };
  const momRevenue = mom(displaySummary.totalRevenue, prevSummaryCalc.totalRevenue);
  const momProfit = mom(displaySummary.totalProfit, prevSummaryCalc.totalProfit);
  const momAdCost = mom(displaySummary.totalAdCost, prevSummaryCalc.totalAdCost);
  const momCount = mom(displaySummary.totalCount, prevSummaryCalc.totalCount);
  const momUnitPrice = mom(displaySummary.companyUnitPrice, prevSummaryCalc.companyUnitPrice);

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
  // PR c94-B-1: metricRowsResult useMemo 削除 (MetricsTable / MetricsTableMobile 撤去に伴う)
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
            totalRevenue: Number(ms.total_revenue ?? 0), totalProfit: resolveTotalProfit(ms),
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
          {canEditDashboard && (
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
              {canEditDashboard && (
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
                <button type="button" onClick={gotoNextMonth}
                  style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 14 }}>▶</button>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
                {viewMode === "company" ? headerLabel : <>{headerLabel}{!isGroup && "エリア"}</>}
                {viewMode === "business" && activeBusiness !== "water" && (
                  <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 8, opacity: 0.7 }}>({activeBusinessLabel})</span>
                )}
                {(() => {
                  const days: number[] = [];
                  if (isGroup) {
                    for (const ms of Object.values(groupMonthlySummaries)) {
                      const aod = Number((ms as Record<string, unknown> | null)?.as_of_day);
                      if (Number.isInteger(aod)) days.push(aod);
                    }
                  } else if (monthlySummary) {
                    const aod = Number(monthlySummary.as_of_day);
                    if (Number.isInteger(aod)) days.push(aod);
                  }
                  return days.length > 0 ? (
                    <AsOfBadge
                      asOfDays={days}
                      month={viewMonth}
                      style={{ marginLeft: 12, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.95)", opacity: 1, fontSize: 11, verticalAlign: "middle" }}
                    />
                  ) : null;
                })()}
              </h1>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                {viewYear}年{viewMonth}月 / {isCurrentMonth ? now.getDate() : displaySummary.daysInMonth}日時点 ｜ 月末着地予測 {(() => {
                  const forecastRevenue = isCurrentMonth && now.getDate() > 0
                    ? Math.round(displaySummary.totalRevenue / now.getDate() * displaySummary.daysInMonth)
                    : displaySummary.totalRevenue;
                  return forecastRevenue > 0 ? yen(forecastRevenue) : "¥0";
                })()}
                {/* 達成率・バッジは事業別ビューのみ。会社別では目標が存在しないため非表示 */}
                {viewMode === "business" && (
                  <>
                    {" "}｜ 達成率{" "}
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
                  </>
                )}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              {/* CSV出力は事業別ビューのみ。会社別では activeTab が事業別エリアのため誤データになる */}
              {viewMode === "business" && <button
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
                    const header = "エリア,年月,売上,粗利,粗利率,件数,客単価,広告費,広告費率,CPA,入電件数,成約率,HELP売上,HELP件数,車両数,研修生（営業マン）";
                    const rows = results
                      .filter(r => r.s)
                      .map(({ y, m, s }) => {
                        const rev = Number(s.total_revenue ?? 0);
                        const profit = resolveTotalProfit(s);
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
                        const traineeCount = Number(s.trainee_count ?? 0);
                        return `${areaName},${y}年${m}月,${rev},${profit},${profitRate}%,${count},${unitPrice},${adCost},${adRate}%,${cpa},${callCount},${convRate}%,${helpRev},${helpCount},${vehicleCount},${traineeCount}`;
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
              </button>}
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

          {/* KPIストリップ (PR #50: 5 KPI 共通刷新)
              並び順: 売上 → 粗利 → 対応件数 → 客単価 → 広告費 (反さん仕様 memory #15)
              ラベル変更: 合計件数 → 対応件数 (用語統一)
              新規追加 : 客単価 (= total_revenue ÷ total_count、目標 = targetUnitPrice)
              客単価の着地: 比例関係上 landing = actual で式が成り立つため、
                landRate ≡ targetRatio となるが、UI 一貫性のため両バッジ表示。 */}
          {/* KPIストリップは事業別ビューのみ。会社別では目標がないため非表示 */}
          {viewMode === "business" && !isGroup && (() => {
            const dim = displaySummary.daysInMonth;
            const elapsed = isCurrentMonth ? now.getDate() : dim;
            const landing = (v: number) => isCurrentMonth && elapsed > 0 ? Math.round(v / elapsed * dim) : v;
            const lRate = (landVal: number, target: number) => target > 0 && landVal > 0 ? Math.round(landVal / target * 1000) / 10 : null;
            const lRevenue = landing(displaySummary.totalRevenue);
            const lProfit = landing(displaySummary.totalProfit);
            const lAdCost = landing(displaySummary.totalAdCost);
            const lCount = landing(displaySummary.totalCount);
            // 客単価の landing は比例関係上 actual と等しい (lRevenue/lCount = currentRevenue/currentCount)
            const unitPriceActual = displaySummary.companyUnitPrice;
            // PR #59 c2: 目標絶対値併記用ヘルパー (円系/件数系で単位を切替)
            const fmtCount = (v: number) => `${v.toLocaleString()}件`;
            const kpis = [
              { label: "売上", val: yen(displaySummary.totalRevenue), isHero: true,
                targetRatio: targets.targetSales > 0 ? Math.round(displaySummary.totalRevenue / targets.targetSales * 1000) / 10 : null,
                targetLabel: targets.targetSales > 0 ? yen(targets.targetSales) : null,
                landRate: lRate(lRevenue, targets.targetSales), landLabel: lRevenue > 0 ? yen(lRevenue) : null, landInvert: false,
                momVal: momRevenue, momInvert: false,
                momDiff: momRevenue !== null ? `${displaySummary.totalRevenue - prevSummaryCalc.totalRevenue >= 0 ? "+" : ""}¥${Math.abs(displaySummary.totalRevenue - prevSummaryCalc.totalRevenue).toLocaleString()}` : null,
              },
              { label: "粗利", val: yen(displaySummary.totalProfit), isHero: false,
                targetRatio: targets.targetProfit > 0 ? Math.round(displaySummary.totalProfit / targets.targetProfit * 1000) / 10 : null,
                targetLabel: targets.targetProfit > 0 ? yen(targets.targetProfit) : null,
                landRate: lRate(lProfit, targets.targetProfit), landLabel: lProfit > 0 ? yen(lProfit) : null, landInvert: false,
                momVal: momProfit, momInvert: false,
                momDiff: momProfit !== null ? `${displaySummary.totalProfit - prevSummaryCalc.totalProfit >= 0 ? "+" : ""}¥${Math.abs(displaySummary.totalProfit - prevSummaryCalc.totalProfit).toLocaleString()}` : null,
                // PR c95-A-1 (B-1): 売上に対する比率をサブ表示 (粗利率 = 粗利 ÷ 売上)
                extraRate: displaySummary.grossMargin > 0 ? { label: "粗利率", value: displaySummary.grossMargin } : null,
              },
              { label: "対応件数", val: `${displaySummary.totalCount}件`, isHero: false,
                targetRatio: targets.targetCount > 0 ? Math.round(displaySummary.totalCount / targets.targetCount * 1000) / 10 : null,
                targetLabel: targets.targetCount > 0 ? fmtCount(targets.targetCount) : null,
                landRate: lRate(lCount, targets.targetCount), landLabel: lCount > 0 ? `${lCount}件` : null, landInvert: false,
                momVal: momCount, momInvert: false,
                momDiff: momCount !== null ? `${displaySummary.totalCount - prevSummaryCalc.totalCount >= 0 ? "+" : ""}${displaySummary.totalCount - prevSummaryCalc.totalCount}件` : null,
              },
              { label: "客単価", val: yen(unitPriceActual), isHero: false,
                targetRatio: targets.targetUnitPrice > 0 ? Math.round(unitPriceActual / targets.targetUnitPrice * 1000) / 10 : null,
                targetLabel: targets.targetUnitPrice > 0 ? yen(targets.targetUnitPrice) : null,
                // 客単価は比例ゆえ landing = actual (詳細は上のコメント参照)
                landRate: lRate(unitPriceActual, targets.targetUnitPrice), landLabel: unitPriceActual > 0 ? yen(unitPriceActual) : null, landInvert: false,
                momVal: momUnitPrice, momInvert: false,
                momDiff: momUnitPrice !== null ? `${unitPriceActual - prevSummaryCalc.companyUnitPrice >= 0 ? "+" : ""}¥${Math.abs(unitPriceActual - prevSummaryCalc.companyUnitPrice).toLocaleString()}` : null,
              },
              { label: "広告費", val: yen(displaySummary.totalAdCost), isHero: false,
                targetRatio: targets.targetAdCost > 0 ? Math.round(displaySummary.totalAdCost / targets.targetAdCost * 1000) / 10 : null,
                targetLabel: targets.targetAdCost > 0 ? yen(targets.targetAdCost) : null,
                landRate: lRate(lAdCost, targets.targetAdCost), landLabel: lAdCost > 0 ? yen(lAdCost) : null, landInvert: true,
                momVal: momAdCost, momInvert: true,
                momDiff: momAdCost !== null ? `${displaySummary.totalAdCost - prevSummaryCalc.totalAdCost >= 0 ? "+" : ""}¥${Math.abs(displaySummary.totalAdCost - prevSummaryCalc.totalAdCost).toLocaleString()}` : null,
                // PR c95-A-1 (B-1): 売上に対する比率をサブ表示 (広告費率 = 広告費 ÷ 売上)
                extraRate: displaySummary.totalRevenue > 0
                  ? { label: "広告費率", value: Math.round(displaySummary.totalAdCost / displaySummary.totalRevenue * 1000) / 10 }
                  : null,
              },
            ];
            // PR #59 c2 / PR c87: invert 考慮の badge 色判定は共通 getBadgeColor に統合済。
            //   kpiBadgeColor local 関数は削除、呼び出し側で getBadgeColor(pct, { invert }) を直接使用。
            // PR #59 c2: 絶対値表示 (薄緑色) 共通スタイル
            const numStyle: React.CSSProperties = {
              fontSize: 11, color: "#a7f3d0",
              fontVariantNumeric: "tabular-nums",
            };
            return (
              <div className="kpi-grid-5" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                {kpis.map((kpi) => (
                  <div key={kpi.label} style={{
                    padding: "14px 18px",
                    // PR #59 c2 Hero: 売上は amber 1.5px 枠 + 右上「最優先」タグ、border-right 抑制
                    borderRight: kpi.isHero ? "none" : "1px solid rgba(255,255,255,0.12)",
                    border: kpi.isHero ? "1.5px solid #fbbf24" : undefined,
                    borderRadius: kpi.isHero ? 6 : undefined,
                    position: kpi.isHero ? "relative" : undefined,
                  }}>
                    {kpi.isHero && (
                      <span style={{
                        position: "absolute", top: -8, right: 10,
                        background: "#fbbf24", color: "#422006",
                        fontSize: 10, fontWeight: 500,
                        padding: "2px 8px", borderRadius: 4,
                      }}>最優先</span>
                    )}
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{kpi.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{kpi.val}</div>
                    {/* PR #59 c2: 目標 / 着地 を 2 行に分離、各行で [バッジ] [絶対値] を併記 */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
                      {kpi.targetRatio !== null && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {/* PR c88: 目標比 badge にも cost-invert を適用。c87 では誤って
                              hard-coded `false` (旧 kpiBadgeColor(_, false)) のロジックを
                              そのまま invert 引数なしで残してしまったため、広告費 KPI hero で
                              目標比 1.4% → red (本来 green) の semantic 逆転が発生していた。
                              着地 (line 下) と同じ kpi.landInvert を使用して整合性確保。 */}
                          <MetricBadge color={getBadgeColor(kpi.targetRatio, { invert: kpi.landInvert })} minWidth={false}>
                            目標比 {kpi.targetRatio}%
                          </MetricBadge>
                          {kpi.targetLabel && <span style={numStyle}>{kpi.targetLabel}</span>}
                        </div>
                      )}
                      {kpi.landRate !== null ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <MetricBadge color={getBadgeColor(kpi.landRate, { invert: kpi.landInvert })} minWidth={false}>
                            着地 {kpi.landRate}%
                          </MetricBadge>
                          {kpi.landLabel && <span style={numStyle}>{kpi.landLabel}</span>}
                        </div>
                      ) : kpi.landLabel ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                            background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)" }}>着地 {kpi.landLabel}</span>
                        </div>
                      ) : null}
                      {/* PR c95-A-1 (B-1): 売上比率サブ表示 (粗利率 / 広告費率) */}
                      {kpi.extraRate && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                            background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" }}>
                            {kpi.extraRate.label} {kpi.extraRate.value}%
                          </span>
                        </div>
                      )}
                    </div>
                    {kpi.momVal === null ? (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>前月同日比 —</div>
                    ) : (
                      <div style={{ fontSize: 11, fontWeight: 700,
                        color: (kpi.momInvert ? kpi.momVal <= 0 : kpi.momVal >= 0) ? "#86efac" : "#fca5a5" }}>
                        前月同日比 {kpi.momVal >= 0 ? "+" : ""}{kpi.momVal}%
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

      {/* PR-2a (2026-06-07): 会社別ビュー時、ヒーローKPIカード直下に事業×エリア内訳テーブルを「追加」表示。
          ヒーロー側のロジック・数値・表示は一切不変 (絶対制約)。
          内訳行ソース: __all__ → 全社平坦化 / 通常会社 → company.areas / unassigned → 16 ペア。
          「事業別で編集 →」ボタン押下で viewMode=business + activeBusiness/activeTab を切替。 */}
      {viewMode === "company" && (
        <CompanyBreakdownTable
          activeCompany={activeCompany}
          viewYear={viewYear}
          viewMonth={viewMonth}
          onChangeBusinessRequest={(category, areaId) => {
            setViewMode("business");
            setActiveBusiness(category);
            setActiveTab(areaId);
          }}
        />
      )}

      {/* ============ ボディ ============ */}
      <div className="page-padding-mobile" style={{ padding: "16px 20px", background: "#f2f5f2" }}>

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
        // 当月の残り日数は「今日以降」を表す（残額の「明日以降の必要額」を見る運用）。
        // 月末（差が0）でも Math.max(1, ...) で最低1日を保証して追い込み目安を表示。
        // 過去月は remain=0 を維持して「—」表示にフォールバックさせる。
        const remain = isCurrentMonth
          ? Math.max(1, displaySummary.daysInMonth - now.getDate())
          : 0;
        // PR c93-2: 工事取得率を対応ベース (displaySummary.constructionCount) で算出。
        //   旧 (PR #47): outsourcedConstructionCount + internalConstructionCount の合算
        //   = 発注ベースの二重カウントで工事取得率が 100% を超える構造的バグがあった。
        //   新       : monthly_summaries.construction_count (= 対応 1 件 = 工事 1 件) を直接使用。
        //   aggregation 側で COALESCE chain により 5月既存 entries (旧フィールドのみ) は
        //   migration 経由で同列に初期化されるため、過去データも自然に整合する。
        //   displaySummary.constructionRate は DB legacy column 直読、totalCount=0 時のみ fallback。
        const constructionRateCalc =
          displaySummary.totalCount > 0
            ? (displaySummary.constructionCount / displaySummary.totalCount) * 100
            : displaySummary.constructionRate;
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
            val: `${constructionRateCalc.toFixed(1)}%`,
            sub: `目標 ${targets.targetConstructionRate > 0 ? targets.targetConstructionRate.toFixed(1) : "—"}%`,
            type: targets.targetConstructionRate > 0 && constructionRateCalc < targets.targetConstructionRate * 0.9 ? "r" : "y" },
        ];
        return (
          <div style={{ marginBottom: 18 }}>
            <SectionLabel>目標達成に向けた 1日あたりの目安</SectionLabel>
            <div className="kpi-grid-6" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
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

      {/* ============ 業態別ダッシュボード / 指標一覧 ============ */}
      {/* PR #51: 鍵業態は LocksmithDashboardSection に置換。
          PR #52: ロード業態は RoadDashboardSection に置換。
          PR #53: 探偵業態は DetectiveDashboardSection に置換 (面談ファネル含む)。
          PR #54: 電気業態は ElectricDashboardSection に置換 (分電盤件数含む)。
          PR c94-B-1: 水道業態を WaterDashboardSection に置換 (5 セクション、業態統一)。
            旧 MetricsTable / MetricsTableMobile / buildMetricRows / WATER_METRIC_TO_GROUP
            は完全撤去 (~390 line dead code)。 */}
      {/* 業態別セクションは事業別ビューのみ。会社別では monthlySummary=null のため全項目「—」になるバグを防ぐ */}
      {viewMode === "business" && !isGroup && activeBusiness === "locksmith" && (
        <LocksmithDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
      )}
      {viewMode === "business" && !isGroup && activeBusiness === "road" && (
        <RoadDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
      )}
      {viewMode === "business" && !isGroup && activeBusiness === "detective" && (
        <DetectiveDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
      )}
      {viewMode === "business" && !isGroup && activeBusiness === "electric" && (
        <ElectricDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
      )}
      {viewMode === "business" && !isGroup && activeBusiness === "water" && (
        <WaterDashboardSection monthlySummary={monthlySummary} targets={targets} prevCalc={prevSameDayCalc} />
      )}

      {/* ============ グループ: 事業別クロス比較 ============ */}
      {isGroup && Object.keys(crossBusinessData).length > 0 && (() => {
        const gt = Object.values(crossBusinessData).reduce((a, b) => ({
          revenue: a.revenue + b.revenue, profit: a.profit + b.profit,
          adCost: a.adCost + b.adCost, count: a.count + b.count,
        }), { revenue: 0, profit: 0, adCost: 0, count: 0 });
        type RowDef = { label: string; fn: (d: { revenue: number; profit: number; adCost: number; count: number }) => string; colorFn?: (d: { revenue: number; profit: number; adCost: number; count: number }) => string };
        const rows: RowDef[] = [
          { label: "売上", fn: d => d.revenue > 0 ? yen(d.revenue) : "\u2014" },
          { label: "粗利", fn: d => d.profit > 0 ? yen(d.profit) : "\u2014", colorFn: () => "#059669" },
          { label: "粗利率", fn: d => d.revenue > 0 ? `${(d.profit / d.revenue * 100).toFixed(1)}%` : "\u2014",
            colorFn: d => { const r = d.revenue > 0 ? d.profit / d.revenue * 100 : 0; return r >= 30 ? "#059669" : r >= 20 ? "#d97706" : "#dc2626"; } },
          { label: "広告費", fn: d => d.adCost > 0 ? yen(d.adCost) : "\u2014", colorFn: () => "#d97706" },
          { label: "広告費率", fn: d => d.revenue > 0 ? `${(d.adCost / d.revenue * 100).toFixed(1)}%` : "\u2014",
            colorFn: d => { const r = d.revenue > 0 ? d.adCost / d.revenue * 100 : 0; return r <= 25 ? "#059669" : r <= 35 ? "#d97706" : "#dc2626"; } },
          { label: "件数", fn: d => d.count > 0 ? `${d.count}件` : "\u2014" },
          { label: "客単価", fn: d => d.count > 0 ? yen(Math.round(d.revenue / d.count)) : "\u2014" },
        ];
        return (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden", marginBottom: 16 }}>
            <div style={{ background: "#ecfdf5", padding: "10px 16px", borderBottom: "1px solid #d1fae5", fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              事業別クロス比較 — {viewYear}年{viewMonth}月
            </div>
            <div className="table-scroll-mobile" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr style={{ background: "#f8fdf8" }}>
                    <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#6b7280", textAlign: "left", borderBottom: "1px solid #f0faf0", position: "sticky", left: 0, background: "#f8fdf8", zIndex: 1, minWidth: 90 }}>指標</th>
                    {BUSINESSES.map(b => (
                      <th key={b.id} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#065f46", textAlign: "right", borderBottom: "1px solid #f0faf0", minWidth: 100 }}>{b.label}</th>
                    ))}
                    <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#059669", textAlign: "right", borderBottom: "1px solid #f0faf0", background: "#f0fdf4", minWidth: 100 }}>グループ計</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.label} style={{ borderBottom: "1px solid #f0faf0" }}>
                      <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 700, color: "#374151", position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{row.label}</td>
                      {BUSINESSES.map(b => {
                        const d = crossBusinessData[b.id] ?? { revenue: 0, profit: 0, adCost: 0, count: 0 };
                        return (
                          <td key={b.id} style={{ padding: "9px 10px", fontSize: 12, fontWeight: 600, textAlign: "right",
                            color: d.revenue > 0 ? (row.colorFn ? row.colorFn(d) : "#111") : "#d1d5db" }}>
                            {row.fn(d)}
                          </td>
                        );
                      })}
                      <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 800, textAlign: "right", background: "#f0fdf4",
                        color: gt.revenue > 0 ? (row.colorFn ? row.colorFn(gt) : "#065f46") : "#d1d5db" }}>
                        {row.fn(gt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* PR c95-B-4b: クロス比較表は 5 業態横並びのためバッジを行ごとに付けず、
                表キャプション 1 行で水道列の控除済表示を補足 (Q6 推奨)。
                viewYear*100+viewMonth >= 202605 のときのみ表示 (過去月閲覧時は非表示)。 */}
            {viewYear * 100 + viewMonth >= 202605 && (
              <div style={{ fontSize: 10, color: "#9ca3af", padding: "6px 16px", borderTop: "1px solid #f0faf0", background: "#fafafa" }}>
                ※ 水道は 2026年5月以降コンサル費 7.7% 控除後の粗利を表示
              </div>
            )}
            <div className="kpi-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: 16, borderTop: "1px solid #f0faf0" }}>
              {[
                { label: "グループ売上", value: yen(gt.revenue) },
                { label: "グループ粗利", value: yen(gt.profit), color: "#059669" },
                { label: "平均粗利率", value: gt.revenue > 0 ? `${(gt.profit / gt.revenue * 100).toFixed(1)}%` : "\u2014",
                  color: gt.revenue > 0 && gt.profit / gt.revenue >= 0.25 ? "#059669" : "#d97706" },
                { label: "グループ広告費", value: yen(gt.adCost), color: "#d97706" },
              ].map(kpi => (
                <div key={kpi.label} style={{ textAlign: "center", padding: "8px 4px" }}>
                  <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>{kpi.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: (kpi as { color?: string }).color ?? "#111" }}>{kpi.value}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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

      {/* PR c93-3: 部門別マトリクス (DeptTable) は完全削除。
          理由: 旧 DailyEntry の self/new/add 系列フィールドを集計していたが、c90 日次差分
          モデル以降 entries.data に書き込まれず 3 部門売上が実質 0 表示の死に駒だった。
          MetricsTable (全 22 項目「指標一覧」) に 3 新 KPI (自社工事件数 / 自社工事利益 /
          工事取得率) を追加することで、部門別観点も統合表示。
          dead code (DailyEntry の self/new/add フィールド / DashboardSummary の self/newSales/help /
          calculations.ts:198-225 集計 loop) は /meeting / mobile-kpi / data-io 等で参照され
          続けているため、本 PR では touch せず別 PR (c94 候補) でクリーンアップ予定。 */}

      {/* 編集不可エリアの表示 */}
      {!canEdit && !isGroup && (
        <div style={{
          margin: "12px 0", padding: "10px 16px", background: "#fef9c3",
          borderRadius: 8, border: "1px solid #fde68a", fontSize: 12, color: "#854d0e", fontWeight: 600,
        }}>
          このエリアは閲覧のみ可能です（編集権限がありません）
        </div>
      )}

      {/* PR #39.2: 旧入力フォーム (折りたたみ式) を完全削除。
          日次入力はナビ「データ入力」→ /entry に完全移行。
          isInputOnly (clerk 専用) ビューと /api/entries 経路は温存。 */}
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


