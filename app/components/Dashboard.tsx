"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, calculateBreakeven, calculateAchievement,
  forecastWeekday, forecastRecent7, getDaysInMonth,
  buildMetricRows, type MetricRow,
  type DashboardSummary,
  DailyEntry, FixedCosts, Targets, emptyTargets,
  emptyEntry,
  yen,
} from "../lib/calculations";
import { useRole, useSession } from "./RoleProvider";
import { logAction } from "../lib/logger";

// ============ エリア定義 ============
type Area = { id: string; name: string };

const AREAS: Area[] = [
  { id: "kansai", name: "関西" },
  { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" },
  { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" },
  { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" },
  { id: "shizuoka", name: "静岡" },
];

async function fetchEntries(
  areaId: string,
  year: number,
  month: number
): Promise<DailyEntry[]> {
  const res = await fetch(
    `/api/entries?area=${areaId}&year=${year}&month=${month}`,
    { cache: "no-store" }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { entries: DailyEntry[] };
  return json.entries ?? [];
}

async function postEntry(areaId: string, entry: DailyEntry): Promise<boolean> {
  const res = await fetch("/api/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ areaId, entry }),
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

  const [activeTab, setActiveTab] = useState<string>(AREAS[0].id);

  const [viewYear, setViewYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);

  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [groupEntriesByArea, setGroupEntriesByArea] = useState<
    Record<string, DailyEntry[]>
  >({});
  const [form, setForm] = useState<DailyEntry>(() => emptyEntry(todayStr()));
  const [, setLoaded] = useState(false);

  const isCurrentMonth = viewYear === currentYear && viewMonth === currentMonth;
  const isGroup = activeTab === GROUP_TAB;
  const isAreaEditable = !userAreaId || userAreaId === activeTab;
  const canEdit = canEditDashboard && !isGroup && isAreaEditable;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inputOpen, setInputOpen] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState<Record<string, unknown> | null>(null);
  const [prevMonthlySummary, setPrevMonthlySummary] = useState<Record<string, unknown> | null>(null);
  const [prevEntries, setPrevEntries] = useState<DailyEntry[]>([]);

  // ============ データ読込: エリアタブ ============
  useEffect(() => {
    if (isGroup) return;
    let cancelled = false;
    setLoaded(false);
    fetchEntries(activeTab, viewYear, viewMonth).then((rows) => {
      if (cancelled) return;
      setEntries(rows);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, viewYear, viewMonth, isGroup]);

  // 固定費 + 目標の読込
  useEffect(() => {
    if (isGroup) return;
    fetch(`/api/fixed-costs?area=${activeTab}&year=${viewYear}&month=${viewMonth}`)
      .then((r) => (r.ok ? r.json() : { fixedCosts: { laborCost: 0, rent: 0, other: 0 } }))
      .then((j: { fixedCosts: FixedCosts }) => setFixedCosts(j.fixedCosts));
    fetch(`/api/targets?area=${activeTab}&year=${viewYear}&month=${viewMonth}`)
      .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
      .then((j: { targets: Targets }) => setTargets(j.targets));
  }, [activeTab, viewYear, viewMonth, isGroup]);

  // ============ データ読込: グループタブ ============
  useEffect(() => {
    if (!isGroup) return;
    let cancelled = false;
    Promise.all(
      AREAS.map(async (a) => [a.id, await fetchEntries(a.id, viewYear, viewMonth)] as const)
    ).then((pairs) => {
      if (cancelled) return;
      const map: Record<string, DailyEntry[]> = {};
      for (const [id, rows] of pairs) map[id] = rows;
      setGroupEntriesByArea(map);
    });
    return () => {
      cancelled = true;
    };
  }, [isGroup, viewYear, viewMonth]);

  // ============ 過去月サマリー取得 ============
  useEffect(() => {
    if (entries.length === 0 && !isGroup && activeTab) {
      fetch(`/api/monthly-summary?area=${activeTab}&year=${viewYear}&month=${viewMonth}`)
        .then((r) => r.ok ? r.json() : { summary: null })
        .then((j) => setMonthlySummary(j.summary ?? null));
    } else {
      setMonthlySummary(null);
    }
  }, [entries, activeTab, viewYear, viewMonth, isGroup]);

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
    if (!isGroup && activeTab) {
      fetch(`/api/monthly-summary?area=${activeTab}&year=${prevYear}&month=${prevMonth}`)
        .then((r) => r.ok ? r.json() : { summary: null })
        .then((j) => setPrevMonthlySummary(j.summary ?? null));
      fetch(`/api/entries?area=${activeTab}&year=${prevYear}&month=${prevMonth}`)
        .then((r) => r.ok ? r.json() : { entries: [] })
        .then((j) => setPrevEntries(j.entries ?? []));
    }
  }, [activeTab, prevYear, prevMonth, isGroup]);

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
    if (!monthlySummary) return summary;
    const dim = getDaysInMonth(viewYear, viewMonth);
    return {
      ...summary,
      totalRevenue: Number(monthlySummary.total_revenue ?? 0),
      totalProfit: Number(monthlySummary.total_profit ?? 0),
      totalCount: Number(monthlySummary.total_count ?? 0),
      totalAdCost: Number(monthlySummary.ad_cost ?? 0),
      companyUnitPrice: Number(monthlySummary.unit_price ?? 0),
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
  }, [summary, monthlySummary, viewYear, viewMonth]);

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
      displaySummary.daysElapsed, displaySummary.daysInMonth,
      monthlySummary ? {
        callCount: Number(monthlySummary.call_count ?? 0),
        acquisitionCount: Number(monthlySummary.acquisition_count ?? 0),
        cpa: Number(monthlySummary.cpa ?? 0),
        callUnitPrice: Number(monthlySummary.call_unit_price ?? 0),
        convRate: Number(monthlySummary.conv_rate ?? 0),
      } : undefined
    ),
    [displaySummary, aggregateEntries, targets, monthlySummary]
  );
  // 異常アラート: 前日比 -20% 以上
  const profitDropRate = yesterdaySummary.forecastProfit > 0
    ? ((summary.forecastProfit - yesterdaySummary.forecastProfit) / yesterdaySummary.forecastProfit) * 100
    : 0;
  const isAlert = isCurrentMonth && profitDropRate <= -20;

  // 各エリアサマリー(グループ表示用)
  const perAreaSummaries = useMemo(() => {
    if (!isGroup) return [];
    return AREAS.map((a) => ({
      area: a,
      summary: calculateDashboard(
        groupEntriesByArea[a.id] ?? [],
        viewYear,
        viewMonth,
        summaryToday
      ),
    }));
  }, [isGroup, groupEntriesByArea, viewYear, viewMonth, summaryToday]);

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
    const ok = await postEntry(activeTab, form);
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
  const headerLabel = isGroup ? "グループ全体" : activeArea?.name ?? "";

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
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
          {currentYear}年{currentMonth}月{new Date().getDate()}日時点
        </span>
      </div>

      {/* ============ グリーンヘッダー: タブ + ヒーロー + KPIストリップ ============ */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        {/* エリアタブ */}
        <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", overflowX: "auto" }}>
          {AREAS.map((a) => (
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
                {headerLabel}{!isGroup && "エリア"}
              </h1>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                {viewYear}年{viewMonth}月 / {displaySummary.daysElapsed}日時点 ｜ 月末着地予測 {yen(isCurrentMonth ? displaySummary.forecastProfit : displaySummary.totalProfit)} ｜ 達成率{" "}
                <strong style={{ color: "#86efac" }}>
                  {targets.targetProfit > 0 ? (displaySummary.totalProfit / targets.targetProfit * 100).toFixed(1) : "—"}%
                </strong>
                {monthlySummary && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.2)",
                    color: "#fff", borderRadius: 4, padding: "2px 8px", marginLeft: 8,
                  }}>
                    過去データ
                  </span>
                )}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>残り</div>
              <div style={{ fontSize: 38, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                {displaySummary.daysInMonth - displaySummary.daysElapsed}日
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                経過 {displaySummary.daysElapsed} / {displaySummary.daysInMonth}日
              </div>
            </div>
          </div>

          {/* KPIストリップ */}
          {!isGroup && (() => {
            const { daysElapsed, daysInMonth } = displaySummary;
            const land = (v: number) => daysElapsed > 0 ? Math.round(v / daysElapsed * daysInMonth) : 0;
            const landRate = (v: number, t: number) => t > 0 && v > 0 ? Math.round(v / t * 1000) / 10 : null;
            const lRevenue = land(displaySummary.totalRevenue);
            const lProfit = land(displaySummary.totalProfit);
            const lAdCost = land(displaySummary.totalAdCost);
            const lCount = land(displaySummary.totalCount);
            const kpis = [
              {
                label: "売上", val: yen(displaySummary.totalRevenue),
                targetRatio: targets.targetSales > 0 ? Math.round(displaySummary.totalRevenue / targets.targetSales * 1000) / 10 : null,
                landingRate: landRate(lRevenue, targets.targetSales), landingLabel: lRevenue > 0 ? yen(lRevenue) : null,
                landingInvert: false,
                salesRatio: null, momVal: momRevenue, momInvert: false,
                momDiff: momRevenue !== null ? `${displaySummary.totalRevenue - prevSummaryCalc.totalRevenue >= 0 ? "+" : ""}¥${Math.abs(displaySummary.totalRevenue - prevSummaryCalc.totalRevenue).toLocaleString()}` : null,
              },
              {
                label: "粗利", val: yen(displaySummary.totalProfit),
                targetRatio: targets.targetProfit > 0 ? Math.round(displaySummary.totalProfit / targets.targetProfit * 1000) / 10 : null,
                landingRate: landRate(lProfit, targets.targetProfit), landingLabel: lProfit > 0 ? yen(lProfit) : null,
                landingInvert: false,
                salesRatio: displaySummary.totalRevenue > 0 ? `${Math.round(displaySummary.totalProfit / displaySummary.totalRevenue * 1000) / 10}%` : null,
                momVal: momProfit, momInvert: false,
                momDiff: momProfit !== null ? `${displaySummary.totalProfit - prevSummaryCalc.totalProfit >= 0 ? "+" : ""}¥${Math.abs(displaySummary.totalProfit - prevSummaryCalc.totalProfit).toLocaleString()}` : null,
              },
              {
                label: "広告費", val: yen(displaySummary.totalAdCost),
                targetRatio: targets.targetAdCost > 0 ? Math.round(displaySummary.totalAdCost / targets.targetAdCost * 1000) / 10 : null,
                landingRate: landRate(lAdCost, targets.targetAdCost), landingLabel: lAdCost > 0 ? yen(lAdCost) : null,
                landingInvert: true,
                salesRatio: displaySummary.totalRevenue > 0 ? `${Math.round(displaySummary.totalAdCost / displaySummary.totalRevenue * 1000) / 10}%` : null,
                momVal: momAdCost, momInvert: true,
                momDiff: momAdCost !== null ? `${displaySummary.totalAdCost - prevSummaryCalc.totalAdCost >= 0 ? "+" : ""}¥${Math.abs(displaySummary.totalAdCost - prevSummaryCalc.totalAdCost).toLocaleString()}` : null,
              },
              {
                label: "合計件数", val: `${displaySummary.totalCount}件`,
                targetRatio: targets.targetCount > 0 ? Math.round(displaySummary.totalCount / targets.targetCount * 1000) / 10 : null,
                landingRate: landRate(lCount, targets.targetCount), landingLabel: lCount > 0 ? `${lCount}件` : null,
                landingInvert: false,
                salesRatio: null, momVal: momCount, momInvert: false,
                momDiff: momCount !== null ? `${displaySummary.totalCount - prevSummaryCalc.totalCount >= 0 ? "+" : ""}${displaySummary.totalCount - prevSummaryCalc.totalCount}件` : null,
              },
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                {kpis.map((kpi) => (
                  <div key={kpi.label} style={{ padding: "12px 18px", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{kpi.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 5 }}>{kpi.val}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                      {kpi.targetRatio !== null && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                          background: kpi.targetRatio >= 100 ? "#d1fae5" : kpi.targetRatio >= 80 ? "#fef9c3" : "#fee2e2",
                          color: kpi.targetRatio >= 100 ? "#065f46" : kpi.targetRatio >= 80 ? "#854d0e" : "#991b1b",
                        }}>目標比 {kpi.targetRatio}%</span>
                      )}
                      {kpi.landingRate !== null && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                          background: kpi.landingInvert
                            ? (kpi.landingRate <= 100 ? "#d1fae5" : kpi.landingRate <= 120 ? "#fef9c3" : "#fee2e2")
                            : (kpi.landingRate >= 100 ? "#d1fae5" : kpi.landingRate >= 80 ? "#fef9c3" : "#fee2e2"),
                          color: kpi.landingInvert
                            ? (kpi.landingRate <= 100 ? "#065f46" : kpi.landingRate <= 120 ? "#854d0e" : "#991b1b")
                            : (kpi.landingRate >= 100 ? "#065f46" : kpi.landingRate >= 80 ? "#854d0e" : "#991b1b"),
                        }}>着地 {kpi.landingRate}%</span>
                      )}
                      {kpi.landingLabel && (
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>({kpi.landingLabel})</span>
                      )}
                      {kpi.salesRatio && (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 4,
                          background: "rgba(255,255,255,0.25)", color: "#fff", letterSpacing: "0.02em" }}>売上比 {kpi.salesRatio}</span>
                      )}
                    </div>
                    {kpi.momVal === null ? (
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: "rgba(255,255,255,0.4)" }}>前月比 —</div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700,
                          color: (kpi.momInvert ? kpi.momVal <= 0 : kpi.momVal >= 0) ? "#86efac" : "#fca5a5" }}>
                          {kpi.momVal >= 0 ? "\u2191" : "\u2193"} 前月比 {kpi.momVal >= 0 ? "+" : ""}{kpi.momVal}%
                        </span>
                        {kpi.momDiff && (
                          <span style={{ fontSize: 11, fontWeight: 700,
                            color: (kpi.momInvert ? kpi.momVal <= 0 : kpi.momVal >= 0) ? "#86efac" : "#fca5a5" }}>
                            ({kpi.momDiff})
                          </span>
                        )}
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
        const remain = displaySummary.daysInMonth - displaySummary.daysElapsed;
        const cards = [
          { label: "全体売上",
            val: remain > 0 ? yen(Math.round((targets.targetSales - displaySummary.totalRevenue) / remain)) + "/日" : "—",
            sub: `残り ${yen(Math.max(0, targets.targetSales - displaySummary.totalRevenue))}`,
            type: displaySummary.totalRevenue / Math.max(1, displaySummary.daysElapsed) * displaySummary.daysInMonth >= targets.targetSales * 0.9 ? "g" : "y" },
          { label: "全体粗利",
            val: remain > 0 ? yen(Math.round((targets.targetProfit - displaySummary.totalProfit) / remain)) + "/日" : "—",
            sub: `残り ${yen(Math.max(0, targets.targetProfit - displaySummary.totalProfit))}`,
            type: displaySummary.totalProfit / Math.max(1, displaySummary.daysElapsed) * displaySummary.daysInMonth >= targets.targetProfit * 0.9 ? "g" : "y" },
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
            display: "flex", gap: 0, background: "#fff",
            borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden",
          }}>
            <div style={{ flex: 1, minWidth: 0, borderRight: "1px solid #d1fae5" }}>
              <MetricsTable rows={metricRowsResult.left} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MetricsTable rows={metricRowsResult.right} />
            </div>
          </div>
        </section>
      )}

      {/* ============ グループ: トップ/リスクハイライト ============ */}
      {isGroup && perAreaSummaries.length > 0 && (() => {
        const sorted = [...perAreaSummaries].sort(
          (a, b) => b.summary.totalProfit - a.summary.totalProfit
        );
        const top = sorted[0];
        const risk = sorted[sorted.length - 1];
        return (
          <section className="px-4 mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-600 text-white p-3">
              <p className="text-[10px] opacity-90">🏆 利益貢献トップ</p>
              <p className="text-base font-bold mt-1">{top.area.name}</p>
              <p className="text-xs tabular-nums">{yen(top.summary.totalProfit)}</p>
            </div>
            <div className="rounded-xl bg-red-600 text-white p-3">
              <p className="text-[10px] opacity-90">⚠️ 要注意エリア</p>
              <p className="text-base font-bold mt-1">{risk.area.name}</p>
              <p className="text-xs tabular-nums">{yen(risk.summary.totalProfit)}</p>
            </div>
          </section>
        );
      })()}

      {/* ============ グループ: エリア別ブレイクダウン ============ */}
      {isGroup && (
        <section className="px-4 mt-6">
          <h2 className="text-base font-semibold mb-2">エリア別 実績 / 予測</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-100 dark:bg-zinc-800 text-xs">
                <tr>
                  <th className="p-2 text-left">エリア</th>
                  <th className="p-2 text-right">利益(実績)</th>
                  <th className="p-2 text-right">利益(予測)</th>
                  <th className="p-2 text-right">売上</th>
                  <th className="p-2 text-right">件数</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...perAreaSummaries]
                  .sort((x, y) => y.summary.forecastProfit - x.summary.forecastProfit)
                  .map(({ area, summary: s }, idx) => (
                  <tr
                    key={area.id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="p-2">
                      {idx === 0 && <span className="mr-1">🏆</span>}
                      {area.name}
                    </td>
                    <td className="p-2 text-right">{yen(s.totalProfit)}</td>
                    <td className="p-2 text-right text-emerald-700 dark:text-emerald-400">
                      {yen(s.forecastProfit)}
                    </td>
                    <td className="p-2 text-right">{yen(s.totalRevenue)}</td>
                    <td className="p-2 text-right">{s.totalCount}</td>
                  </tr>
                ))}
                <tr className="font-bold bg-amber-50 dark:bg-amber-950/40 border-t border-zinc-200 dark:border-zinc-700">
                  <td className="p-2">グループ合計</td>
                  <td className="p-2 text-right">{yen(displaySummary.totalProfit)}</td>
                  <td className="p-2 text-right text-amber-700 dark:text-amber-400">
                    {yen(displaySummary.forecastProfit)}
                  </td>
                  <td className="p-2 text-right">{yen(displaySummary.totalRevenue)}</td>
                  <td className="p-2 text-right">{displaySummary.totalCount}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 部門別グループ集計 */}
          {(() => {
            const dept = (sel: "self" | "newSales" | "help") => {
              let revenue = 0, profit = 0, count = 0;
              for (const { summary: s } of perAreaSummaries) {
                revenue += s[sel].revenue;
                profit += s[sel].profit;
                count += s[sel].count;
              }
              const unit = count > 0 ? Math.round(revenue / count) : 0;
              return { revenue, profit, count, unit };
            };
            const self = dept("self");
            const ns = dept("newSales");
            const help = dept("help");
            const total = {
              revenue: self.revenue + ns.revenue + help.revenue,
              profit: self.profit + ns.profit + help.profit,
              count: self.count + ns.count + help.count,
            };
            const totalUnit = total.count > 0 ? Math.round(total.revenue / total.count) : 0;
            const Row = ({ name, d }: { name: string; d: ReturnType<typeof dept> }) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="p-2">{name}</td>
                <td className="p-2 text-right">{yen(d.revenue)}</td>
                <td className="p-2 text-right">{yen(d.profit)}</td>
                <td className="p-2 text-right">{d.count}</td>
                <td className="p-2 text-right">{yen(d.unit)}</td>
              </tr>
            );
            return (
              <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <h3 className="text-sm font-semibold p-2 bg-zinc-100 dark:bg-zinc-800">部門別グループ集計</h3>
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-xs">
                    <tr>
                      <th className="p-2 text-left">部門</th>
                      <th className="p-2 text-right">合計売上</th>
                      <th className="p-2 text-right">合計粗利</th>
                      <th className="p-2 text-right">合計件数</th>
                      <th className="p-2 text-right">客単価</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    <Row name="自社施工" d={self} />
                    <Row name="新規営業" d={ns} />
                    <Row name="ヘルプ" d={help} />
                    <tr className="font-bold bg-amber-50 dark:bg-amber-950/40 border-t border-zinc-200 dark:border-zinc-700">
                      <td className="p-2">合計</td>
                      <td className="p-2 text-right">{yen(total.revenue)}</td>
                      <td className="p-2 text-right">{yen(total.profit)}</td>
                      <td className="p-2 text-right">{total.count}</td>
                      <td className="p-2 text-right">{yen(totalUnit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}
        </section>
      )}

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
              {row.status !== "—" && row.statusLevel !== "none"
                ? badge(row.statusLevel, row.status)
                : <span style={{ color: "#d1d5db", fontSize: 11 }}>{row.status}</span>}
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
