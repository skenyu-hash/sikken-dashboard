"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, calculateBreakeven, calculateAchievement,
  forecastWeekday, forecastRecent7,
  buildMetricRows, type MetricRow,
  DailyEntry, FixedCosts, Targets, emptyTargets,
  emptyEntry,
  yen,
} from "../lib/calculations";
import { useRole, useSession } from "./RoleProvider";

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
  const isManager = role === "manager";
  // 事務員で担当エリアが指定されている場合、そのエリアのみ編集可
  const lockedAreaId = isInputOnly && session?.areaId ? session.areaId : null;
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
  const isAreaEditable = !lockedAreaId || lockedAreaId === activeTab;
  const canEdit = isCurrentMonth && !isGroup && isAreaEditable;

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [inputOpen, setInputOpen] = useState(false);

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
    () => buildMetricRows(summary, aggregateEntries, targets, summary.daysElapsed, summary.daysInMonth),
    [summary, aggregateEntries, targets]
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
                {!isCurrentMonth && (
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", padding: "1px 6px", background: "rgba(255,255,255,0.15)", borderRadius: 4 }}>
                    読み取り専用
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
                {headerLabel}{!isGroup && "エリア"}
              </h1>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                {viewYear}年{viewMonth}月 / {summary.daysElapsed}日時点 ｜ 月末着地予測 {yen(isCurrentMonth ? summary.forecastProfit : summary.totalProfit)} ｜ 達成率{" "}
                <strong style={{ color: "#86efac" }}>
                  {targets.targetProfit > 0 ? (summary.totalProfit / targets.targetProfit * 100).toFixed(1) : "—"}%
                </strong>
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>残り</div>
              <div style={{ fontSize: 38, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
                {summary.daysInMonth - summary.daysElapsed}日
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                経過 {summary.daysElapsed} / {summary.daysInMonth}日
              </div>
            </div>
          </div>

          {/* KPIストリップ */}
          {!isGroup && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
              {[
                { label: "売上", val: yen(summary.totalRevenue),
                  targetRatio: targets.targetSales > 0 ? (summary.totalRevenue / targets.targetSales * 100).toFixed(1) : null,
                  dayRatio: targets.targetSales > 0 && summary.daysElapsed > 0 ? (summary.totalRevenue / summary.daysElapsed * summary.daysInMonth / targets.targetSales * 100).toFixed(1) : null },
                { label: "粗利", val: yen(summary.totalProfit),
                  targetRatio: targets.targetProfit > 0 ? (summary.totalProfit / targets.targetProfit * 100).toFixed(1) : null,
                  dayRatio: targets.targetProfit > 0 && summary.daysElapsed > 0 ? (summary.totalProfit / summary.daysElapsed * summary.daysInMonth / targets.targetProfit * 100).toFixed(1) : null },
                { label: "獲得件数", val: `${summary.totalCount}件`,
                  targetRatio: targets.targetCount > 0 ? (summary.totalCount / targets.targetCount * 100).toFixed(1) : null,
                  dayRatio: targets.targetCount > 0 && summary.daysElapsed > 0 ? (summary.totalCount / summary.daysElapsed * summary.daysInMonth / targets.targetCount * 100).toFixed(1) : null },
                { label: "粗利率",
                  val: `${(summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue * 100) : 0).toFixed(1)}%`,
                  targetRatio: null, dayRatio: null },
              ].map((kpi) => (
                <div key={kpi.label} style={{ padding: "12px 18px", borderRight: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{kpi.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{kpi.val}</div>
                  <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                    {kpi.targetRatio && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(252,165,165,0.2)", color: "#fca5a5" }}>
                        目標比 {kpi.targetRatio}%
                      </span>
                    )}
                    {kpi.dayRatio && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3,
                        background: Number(kpi.dayRatio) >= 100 ? "rgba(134,239,172,0.2)" : "rgba(253,230,138,0.2)",
                        color: Number(kpi.dayRatio) >= 100 ? "#86efac" : "#fde68a",
                      }}>
                        日割 {kpi.dayRatio}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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
          {" "}（前日 {yen(yesterdaySummary.forecastProfit)} → 現在 {yen(summary.forecastProfit)}, 差 {diff >= 0 ? "+" : ""}{yen(diff)}）
          {" "}残追加見積必要 {!isGroup && breakeven.fixedTotal > 0 && breakeven.remainingCount > 0 && `あと ${breakeven.remainingCount} 件`}
          {!isGroup && targets.targetCount > 0 && achievement.remainingCount > 0 && ` / 目標達成まで ${achievement.remainingCount} 件`}
          {weekdayForecast.forecastProfit + recent7Forecast.forecastProfit > 0 && ""}
        </div>
      )}

      {/* 1日あたりの目安 */}
      {!isGroup && isCurrentMonth && targets.targetSales > 0 && (() => {
        const remain = summary.daysInMonth - summary.daysElapsed;
        const cards = [
          { label: "全体売上",
            val: remain > 0 ? yen(Math.round((targets.targetSales - summary.totalRevenue) / remain)) + "/日" : "—",
            sub: `残り ${yen(Math.max(0, targets.targetSales - summary.totalRevenue))}`,
            type: summary.totalRevenue / Math.max(1, summary.daysElapsed) * summary.daysInMonth >= targets.targetSales * 0.9 ? "g" : "y" },
          { label: "全体粗利",
            val: remain > 0 ? yen(Math.round((targets.targetProfit - summary.totalProfit) / remain)) + "/日" : "—",
            sub: `残り ${yen(Math.max(0, targets.targetProfit - summary.totalProfit))}`,
            type: summary.totalProfit / Math.max(1, summary.daysElapsed) * summary.daysInMonth >= targets.targetProfit * 0.9 ? "g" : "y" },
          { label: "獲得件数",
            val: remain > 0 ? `${Math.ceil((targets.targetCount - summary.totalCount) / remain)}件/日` : "—",
            sub: `残り ${Math.max(0, targets.targetCount - summary.totalCount)}件`,
            type: summary.totalCount >= targets.targetCount ? "g" : "y" },
          { label: "HELP売上",
            val: remain > 0 && targets.targetHelpSales > 0 ? yen(Math.round((targets.targetHelpSales - summary.help.revenue) / remain)) + "/日" : "—",
            sub: targets.targetHelpSales > 0 ? `残り ${yen(Math.max(0, targets.targetHelpSales - summary.help.revenue))}` : "目標未設定",
            type: "y" },
          { label: "HELP件数",
            val: remain > 0 && targets.targetHelpCount > 0 ? `${Math.ceil((targets.targetHelpCount - summary.help.count) / remain)}件/日` : "—",
            sub: targets.targetHelpCount > 0 ? `残り ${Math.max(0, targets.targetHelpCount - summary.help.count)}件` : "目標未設定",
            type: "y" },
          { label: "工事取得率",
            val: `${summary.constructionRate.toFixed(1)}%`,
            sub: `目標 ${targets.targetConstructionRate > 0 ? targets.targetConstructionRate.toFixed(1) : "—"}%`,
            type: targets.targetConstructionRate > 0 && summary.constructionRate < targets.targetConstructionRate * 0.9 ? "r" : "y" },
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
                  <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 700, textAlign: "center", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
                  <div style={{
                    fontSize: 15, fontWeight: 800, textAlign: "center", whiteSpace: "nowrap",
                    color: c.type === "g" ? "#16a34a" : c.type === "r" ? "#dc2626" : "#d97706",
                  }}>{c.val}</div>
                  <div style={{ fontSize: 9, color: "#9ca3af", textAlign: "center", marginTop: 3 }}>{c.sub}</div>
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
                  <td className="p-2 text-right">{yen(summary.totalProfit)}</td>
                  <td className="p-2 text-right text-amber-700 dark:text-amber-400">
                    {yen(summary.forecastProfit)}
                  </td>
                  <td className="p-2 text-right">{yen(summary.totalRevenue)}</td>
                  <td className="p-2 text-right">{summary.totalCount}</td>
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

      {/* ============ 部門別 実績 vs 予測 ============ */}
      <section className="px-4 mt-6">
        <h2 className="text-base font-semibold mb-2">部門別 実績 / 予測</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-800 text-xs">
              <tr>
                <th className="p-2 text-left">部門</th>
                <th className="p-2 text-right">利益(実績)</th>
                <th className="p-2 text-right">利益(予測)</th>
                <th className="p-2 text-right">客単価</th>
                <th className="p-2 text-right">件数</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <DeptRow name="自社施工" dept={summary.self} summary={summary} />
              <DeptRow name="新規営業" dept={summary.newSales} summary={summary} />
              <DeptRow name="ヘルプ" dept={summary.help} summary={summary} />
              <tr className="font-bold bg-emerald-50 dark:bg-emerald-950/40">
                <td className="p-2">合計</td>
                <td className="p-2 text-right">{yen(summary.totalProfit)}</td>
                <td className="p-2 text-right text-emerald-700 dark:text-emerald-400">
                  {yen(summary.forecastProfit)}
                </td>
                <td className="p-2 text-right">{yen(summary.companyUnitPrice)}</td>
                <td className="p-2 text-right">{summary.totalCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ============ 入力フォーム (折りたたみ式) ============ */}
      {canEdit && !isManager && isCurrentMonth && !isGroup && (
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
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-emerald-50 dark:bg-emerald-950/30">
          <th className="text-left p-2 font-semibold text-zinc-500 text-[10px]">指標</th>
          <th className="text-right p-2 font-semibold text-zinc-500 text-[10px]">実績</th>
          <th className="text-right p-2 font-semibold text-zinc-500 text-[10px]">売上比</th>
          <th className="text-right p-2 font-semibold text-zinc-500 text-[10px]">目標比</th>
          <th className="text-right p-2 font-semibold text-zinc-500 text-[10px]">状況</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
            <td className="p-2 font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{row.name}</td>
            <td className="p-2 text-right font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.value}</td>
            <td className="p-2 text-right text-[11px] text-zinc-400 whitespace-nowrap">{row.salesRatio ?? "—"}</td>
            <td className="p-2 text-right whitespace-nowrap">
              {row.targetRatio !== null ? (
                <span className={`inline-block text-[10px] font-bold rounded px-1.5 py-0.5 ${
                  row.targetRatio >= 100 ? "bg-emerald-100 text-emerald-800"
                  : row.targetRatio >= 80 ? "bg-amber-100 text-amber-800"
                  : "bg-red-100 text-red-800"
                }`}>{row.targetRatio}%</span>
              ) : <span className="text-zinc-300 text-[10px]">未設定</span>}
            </td>
            <td className={`p-2 text-right text-[11px] font-bold whitespace-nowrap ${
              row.statusLevel === "good" ? "text-emerald-600"
              : row.statusLevel === "warn" ? "text-amber-600"
              : row.statusLevel === "bad" ? "text-red-600"
              : "text-zinc-300"
            }`}>{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeptRow({
  name,
  dept,
  summary,
}: {
  name: string;
  dept: { profit: number; unitPrice: number; count: number };
  summary: { daysElapsed: number; daysInMonth: number };
}) {
  const forecast = Math.round(
    (dept.profit / summary.daysElapsed) * summary.daysInMonth
  );
  return (
    <tr className="border-t border-zinc-100 dark:border-zinc-800">
      <td className="p-2">{name}</td>
      <td className="p-2 text-right">{yen(dept.profit)}</td>
      <td className="p-2 text-right text-emerald-700 dark:text-emerald-400">
        {yen(forecast)}
      </td>
      <td className="p-2 text-right">{yen(dept.unitPrice)}</td>
      <td className="p-2 text-right">{dept.count}</td>
    </tr>
  );
}
