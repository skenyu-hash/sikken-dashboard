"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, calculateBreakeven, calculateAchievement, achievementColor,
  forecastWeekday, forecastRecent7,
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
      {/* ============ エリアタブ ============ */}
      <div className="bg-zinc-900 text-white">
        <div className="flex overflow-x-auto no-scrollbar px-2 pt-2 pb-2 gap-1.5 touch-pan-x">
          {AREAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveTab(a.id)}
              className={`shrink-0 min-h-[44px] px-4 py-3 text-sm rounded-lg whitespace-nowrap active:scale-95 transition ${
                activeTab === a.id
                  ? "bg-emerald-600 text-white font-semibold"
                  : "bg-zinc-800 text-zinc-300"
              }`}
            >
              {a.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActiveTab(GROUP_TAB)}
            className={`shrink-0 min-h-[44px] px-4 py-3 text-sm rounded-lg whitespace-nowrap active:scale-95 transition ${
              isGroup
                ? "bg-amber-500 text-white font-semibold"
                : "bg-zinc-800 text-zinc-300"
            }`}
          >
            グループ全体
          </button>
        </div>
      </div>

      {/* ============ 月切り替え ============ */}
      <div
        className={`flex items-center justify-between px-4 pt-4 text-white ${
          isGroup ? "bg-amber-600" : "bg-emerald-600"
        }`}
      >
        <button
          type="button"
          onClick={gotoPrevMonth}
          className="min-h-[44px] min-w-[44px] rounded-full bg-white/15 active:bg-white/30 px-4 py-2 text-base font-bold"
          aria-label="前の月"
        >
          ◀
        </button>
        <div className="text-base font-semibold tabular-nums">
          {viewYear}年{viewMonth}月
          {!isCurrentMonth && (
            <span className="ml-2 text-[10px] rounded bg-white/20 px-1.5 py-0.5">
              読み取り専用
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={gotoNextMonth}
          disabled={isCurrentMonth}
          className="min-h-[44px] min-w-[44px] rounded-full bg-white/15 active:bg-white/30 px-4 py-2 text-base font-bold disabled:opacity-30"
          aria-label="次の月"
        >
          ▶
        </button>
      </div>

      {/* ============ ヒーロー ============ */}
      <section
        className={`px-5 pt-4 pb-6 text-white bg-gradient-to-b ${
          isGroup
            ? "from-amber-600 to-amber-700"
            : "from-emerald-600 to-emerald-700"
        }`}
      >
        <p className="text-xs opacity-90">
          {headerLabel} ・ {viewYear}年{viewMonth}月{" "}
          {isCurrentMonth ? "着地予測" : "実績"}({summary.daysElapsed}/
          {summary.daysInMonth}日)
        </p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
          {yen(isCurrentMonth ? summary.forecastProfit : summary.totalProfit)}
        </h1>
        <p className="mt-1 text-sm opacity-90">
          {isCurrentMonth ? "合計限界利益・月末予測" : "合計限界利益・月次実績"}
        </p>
        <div className="mt-3 flex gap-3 text-xs">
          <span className="rounded-full bg-white/15 px-3 py-1">
            実績 {yen(summary.totalProfit)}
          </span>
          {isCurrentMonth && (
            <span
              className={`rounded-full px-3 py-1 ${
                diff >= 0 ? "bg-white/15" : "bg-red-500/40"
              }`}
            >
              前日比 {diff >= 0 ? "+" : ""}
              {yen(diff)}
            </span>
          )}
        </div>
      </section>

      {/* ============ 異常アラート(赤) ============ */}
      {isAlert && (
        <div className="mx-4 mt-3 rounded-xl bg-red-600 text-white px-4 py-3 text-sm font-bold shadow animate-pulse">
          🚨 利益予測が前日比 {profitDropRate.toFixed(1)}% 急落しています
        </div>
      )}

      {/* ============ あと○件で目標達成 ============ */}
      {!isGroup && targets.targetCount > 0 && (
        <div className="mx-4 mt-3 rounded-xl bg-blue-700 text-white px-4 py-3">
          <p className="text-[11px] opacity-80">目標達成まで</p>
          <p className="text-3xl font-bold tabular-nums">
            あと {achievement.remainingCount} 件
          </p>
          <p className="text-[11px] opacity-80 mt-1">
            目標 {targets.targetCount}件 ・ 達成率 {achievement.countPct.toFixed(0)}%
          </p>
        </div>
      )}

      {/* ============ あと○件必要(損益分岐) ============ */}
      {!isGroup && breakeven.fixedTotal > 0 && (
        <div className="mx-4 mt-3 rounded-xl bg-indigo-700 text-white px-4 py-3">
          <p className="text-[11px] opacity-80">損益分岐まで</p>
          <p className="text-2xl font-bold tabular-nums">
            あと {breakeven.remainingCount} 件 必要
          </p>
          <p className="text-[11px] opacity-80 mt-1">
            1日あたり {breakeven.perDayCount.toFixed(1)} 件 ・ 達成率 {breakeven.achievementPct.toFixed(0)}%
          </p>
        </div>
      )}

      {/* ============ マイルストーン進捗 ============ */}
      <section className="px-4 mt-3">
        <MilestoneBar
          daysElapsed={summary.daysElapsed}
          daysInMonth={summary.daysInMonth}
        />
      </section>

      {/* ============ 未来予測(複数モデル) ============ */}
      <section className="px-4 mt-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <ForecastTile label="単純平均" value={yen(summary.forecastProfit)} />
          <ForecastTile label="曜日補正" value={yen(weekdayForecast.forecastProfit)} accent />
          <ForecastTile label="直近7日" value={yen(recent7Forecast.forecastProfit)} />
        </div>
      </section>

      {/* ============ KPI / 全体カード ============ */}
      <section className="px-4 mt-3">
        <div className="grid grid-cols-2 gap-3">
          <Card
            label="合計売上(実績)"
            value={yen(summary.totalRevenue)}
            target={targets.targetSales > 0 ? `達成 ${achievement.salesPct.toFixed(0)}%` : undefined}
            targetAccent={targets.targetSales > 0 ? achievementColor(achievement.salesPct) : undefined}
          />
          <Card label="売上 月末予測" value={yen(summary.forecastRevenue)} />
          <Card label="会社総合客単価" value={yen(summary.companyUnitPrice)} />
          <Card
            label="全体件数"
            value={`${summary.totalCount} 件`}
            target={targets.targetCount > 0 ? `達成 ${achievement.countPct.toFixed(0)}%` : undefined}
            targetAccent={targets.targetCount > 0 ? achievementColor(achievement.countPct) : undefined}
          />
          <Card label="工事取得率" value={`${summary.constructionRate.toFixed(1)} %`} accent="emerald" />
          <Card label="ヘルプ率" value={`${summary.helpRate.toFixed(1)} %`} accent="amber" />
          <Card label="内製化率" value={`${summary.insourceRate.toFixed(1)} %`} accent="emerald" />
          <Card label="外注比率" value={`${summary.outsourceRate.toFixed(1)} %`} accent="amber" />
        </div>
      </section>

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

      {/* ============ 入力フォーム (当月 & 会社タブのみ・managerは編集不可) ============ */}
      {canEdit && !isManager ? (
        <section className="px-4 mt-8">
          <h2 className="text-base font-semibold mb-2">
            {activeArea?.name} 日次入力
          </h2>
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-5"
          >
            <div>
              <label className="block text-sm text-zinc-500 mb-1.5">日付</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => {
                  setField("date", e.target.value);
                  loadDate(e.target.value);
                }}
                className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 py-3 text-base"
              />
            </div>

            {formSections.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-semibold text-zinc-500 mb-2">
                  {section.title}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {section.fields.map((f) => (
                    <label key={f.key} className="block">
                      <span className="block text-xs text-zinc-500 mb-1">
                        {f.label}
                        {f.unit ? `(${f.unit})` : ""}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={(form[f.key] as number) || ""}
                        onChange={(e) =>
                          setField(f.key, e.target.value.replace(/[^0-9]/g, ""))
                        }
                        className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-3 text-right text-base tabular-nums"
                        placeholder="0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {saveError && (
              <p className="text-sm text-red-500">{saveError}</p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[52px] rounded-lg bg-emerald-600 active:bg-emerald-800 text-white font-semibold py-4 text-base active:scale-[0.98] transition disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存する"}
            </button>
          </form>
        </section>
      ) : (
        <section className="px-4 mt-8">
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-center text-sm text-zinc-500">
            {isGroup
              ? "グループ全体は読み取り専用です。各社タブから入力してください。"
              : "過去月のため読み取り専用です。入力・編集は当月のみ可能です。"}
          </div>
        </section>
      )}
    </div>
  );
}

function Card({
  label, value, accent, target, targetAccent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "amber";
  target?: string;
  targetAccent?: "good" | "warn" | "bad";
}) {
  const accentCls =
    accent === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : accent === "amber" ? "text-amber-600 dark:text-amber-400"
    : "text-zinc-900 dark:text-zinc-100";
  const tCls =
    targetAccent === "good" ? "bg-emerald-100 text-emerald-700"
    : targetAccent === "warn" ? "bg-amber-100 text-amber-700"
    : targetAccent === "bad" ? "bg-red-100 text-red-700"
    : "bg-zinc-100 text-zinc-700";
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 shadow-sm">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${accentCls}`}>{value}</p>
      {target && (
        <p className={`mt-1 inline-block text-[10px] font-semibold rounded px-1.5 py-0.5 ${tCls}`}>
          {target}
        </p>
      )}
    </div>
  );
}

function MilestoneBar({
  daysElapsed, daysInMonth,
}: { daysElapsed: number; daysInMonth: number }) {
  const milestones = [5, 10, 15, 20, 25].filter((m) => m <= daysInMonth);
  const pct = Math.min(100, (daysElapsed / daysInMonth) * 100);
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
        <span>マイルストーン</span>
        <span>{daysElapsed}/{daysInMonth}日</span>
      </div>
      <div className="relative h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-visible">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
          style={{ width: `${pct}%` }}
        />
        {milestones.map((m) => {
          const left = (m / daysInMonth) * 100;
          const reached = daysElapsed >= m;
          return (
            <div
              key={m}
              className="absolute -top-1 h-5 w-0.5 -translate-x-1/2"
              style={{ left: `${left}%` }}
            >
              <div className={`h-full ${reached ? "bg-emerald-700" : "bg-zinc-400"}`} />
              <div className={`mt-0.5 text-[9px] -translate-x-1/2 ${reached ? "text-emerald-700" : "text-zinc-400"}`}>
                {m}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ForecastTile({
  label, value, accent,
}: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-2 ${
      accent
        ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
    }`}>
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
    </div>
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
