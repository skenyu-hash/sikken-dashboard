"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, emptyTargets,
  getDaysInMonth,
  type DailyEntry, type Targets, yen,
} from "../lib/calculations";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type Period = "10" | "20" | "end";

function defaultPeriod(day: number): Period {
  if (day <= 10) return "10";
  if (day <= 20) return "20";
  return "end";
}

export default function MeetingPage() {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();
  const daysInMonth = getDaysInMonth(year, month);

  const [areaId, setAreaId] = useState(AREAS[0].id);
  const [period, setPeriod] = useState<Period>(defaultPeriod(today));
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Targets>(emptyTargets());

  useEffect(() => {
    fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((j: { entries: DailyEntry[] }) => setEntries(j.entries ?? []));
    fetch(`/api/targets?area=${areaId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
      .then((j: { targets: Targets }) => setTargets({ ...emptyTargets(), ...j.targets }));
  }, [areaId, year, month]);

  // 期間に応じたフィルタ
  const filtered = useMemo(() => {
    if (period === "end") return entries;
    const limit = period === "10" ? 10 : 20;
    return entries.filter((e) => {
      const d = Number(e.date.slice(8, 10));
      return d >= 1 && d <= limit;
    });
  }, [entries, period]);

  // 経過日数
  const daysElapsed = useMemo(() => {
    if (period === "10") return 10;
    if (period === "20") return 20;
    // 末日: 当月なら今日まで、過去月なら全日数
    return today;
  }, [period, today]);

  // ダミーtoday(集計用): 月初 + (daysElapsed - 1) 日目
  const summaryToday = useMemo(
    () => new Date(year, month - 1, daysElapsed),
    [year, month, daysElapsed]
  );

  const summary = useMemo(
    () => calculateDashboard(filtered, year, month, summaryToday),
    [filtered, year, month, summaryToday]
  );

  // 指標行
  type Row = {
    label: string;
    actual: number;
    target: number;
    kind: "yen" | "count" | "pct";
  };
  const adRateActual = summary.totalRevenue > 0
    ? (summary.totalAdCost / summary.totalRevenue) * 100
    : 0;

  const rows: Row[] = [
    { label: "全体売上", actual: summary.totalRevenue, target: targets.targetSales, kind: "yen" },
    { label: "全体粗利", actual: summary.totalProfit, target: targets.targetProfit, kind: "yen" },
    { label: "獲得件数", actual: summary.totalCount, target: targets.targetCount, kind: "count" },
    { label: "HELP売上", actual: summary.help.revenue, target: targets.targetHelpSales, kind: "yen" },
    { label: "HELP件数", actual: summary.help.count, target: targets.targetHelpCount, kind: "count" },
    { label: "広告費", actual: summary.totalAdCost, target: targets.targetAdCost, kind: "yen" },
    { label: "広告費率", actual: adRateActual, target: targets.targetAdRate, kind: "pct" },
    { label: "工事取得率", actual: summary.constructionRate, target: targets.targetConstructionRate, kind: "pct" },
    { label: "自社施工売上", actual: summary.self.revenue, target: targets.targetSelfSales, kind: "yen" },
    { label: "新規営業売上", actual: summary.newSales.revenue, target: targets.targetNewSales, kind: "yen" },
  ];

  function fmt(v: number, kind: Row["kind"]): string {
    if (kind === "yen") return yen(v);
    if (kind === "pct") return `${v.toFixed(1)}%`;
    return `${Math.round(v)}件`;
  }

  function calcRow(r: Row) {
    // 率系は予測しない(平均値)
    const forecast = r.kind === "pct"
      ? r.actual
      : Math.round((r.actual / Math.max(1, daysElapsed)) * daysInMonth);
    const achievementPct = r.target > 0 ? (forecast / r.target) * 100 : 0;
    const diff = forecast - r.target;
    const remainingDays = Math.max(0, daysInMonth - daysElapsed);
    const perDay = remainingDays > 0 && r.kind !== "pct"
      ? (r.target - r.actual) / remainingDays
      : null;
    return { forecast, achievementPct, diff, perDay, remainingDays };
  }

  function badgeColor(pct: number) {
    if (pct >= 100) return "bg-emerald-100 text-emerald-700";
    if (pct >= 80) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
      <header className="px-5 py-5 bg-blue-700 text-white">
        <h1 className="text-2xl font-bold">10日会議シート</h1>
        <p className="text-xs opacity-80 mt-1">{year}年{month}月</p>
      </header>

      <section className="px-4 mt-4 space-y-3">
        <label className="block">
          <span className="block text-xs text-zinc-500 mb-1">エリア</span>
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-base"
          >
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <div>
          <span className="block text-xs text-zinc-500 mb-1">集計期間</span>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["10", "10日"],
              ["20", "20日"],
              ["end", "末日"],
            ] as const).map(([key, label]) => (
              <button
                key={key} type="button" onClick={() => setPeriod(key)}
                className={`min-h-[48px] rounded-lg text-base font-semibold border ${
                  period === key
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-blue-700 border-blue-300 dark:bg-zinc-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 mt-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          {rows.map((r, idx) => {
            const { forecast, achievementPct, diff, perDay, remainingDays } = calcRow(r);
            const noTarget = r.target <= 0;
            return (
              <div
                key={r.label}
                className={`p-3 ${idx > 0 ? "border-t border-zinc-100 dark:border-zinc-800" : ""} ${noTarget ? "opacity-50" : ""}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-bold">{r.label}</div>
                    <div className="text-lg font-bold tabular-nums mt-0.5">{fmt(r.actual, r.kind)}</div>
                    <div className="text-[10px] text-zinc-500">実績({daysElapsed}日経過時点)</div>
                  </div>
                  <div className="text-right">
                    {noTarget ? (
                      <span className="text-[10px] text-zinc-500">目標未設定</span>
                    ) : (
                      <>
                        <span className={`inline-block text-[10px] font-semibold rounded px-1.5 py-0.5 ${badgeColor(achievementPct)}`}>
                          達成見込み {achievementPct.toFixed(0)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {!noTarget && (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] tabular-nums">
                    <div>
                      <div className="text-zinc-500">月末着地</div>
                      <div className="font-semibold">{fmt(forecast, r.kind)}</div>
                    </div>
                    <div>
                      <div className="text-zinc-500">目標差</div>
                      <div className={`font-semibold ${diff >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {diff >= 0 ? "+" : ""}{fmt(diff, r.kind)}
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500">1日の目安</div>
                      <div className="font-semibold">
                        {perDay == null || remainingDays <= 0
                          ? "-"
                          : r.kind === "count"
                            ? `${perDay.toFixed(1)}件`
                            : fmt(perDay, r.kind)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
