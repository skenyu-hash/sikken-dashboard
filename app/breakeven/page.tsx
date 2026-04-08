"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateBreakeven, calculateDashboard, type DailyEntry, type FixedCosts,
  yen,
} from "../lib/calculations";
import { useRole } from "../components/RoleProvider";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

export default function BreakevenPage() {
  const role = useRole();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [areaId, setAreaId] = useState(AREAS[0].id);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [fixed, setFixed] = useState<FixedCosts>({ laborCost: 0, rent: 0, other: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}`)
      .then(r => r.ok ? r.json() : { entries: [] })
      .then((j: { entries: DailyEntry[] }) => setEntries(j.entries ?? []));
    fetch(`/api/fixed-costs?area=${areaId}&year=${year}&month=${month}`)
      .then(r => r.ok ? r.json() : { fixedCosts: { laborCost: 0, rent: 0, other: 0 } })
      .then((j: { fixedCosts: FixedCosts }) => setFixed(j.fixedCosts));
  }, [areaId, year, month]);

  const summary = useMemo(
    () => calculateDashboard(entries, year, month, now),
    [entries, year, month] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const be = useMemo(() => calculateBreakeven(fixed, summary), [fixed, summary]);

  const canEdit = role === "admin";

  async function save() {
    setSaving(true);
    await fetch("/api/fixed-costs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ areaId, year, month, fixedCosts: fixed }),
    });
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
      <header className="px-5 py-5 bg-gradient-to-b from-indigo-700 to-indigo-800 text-white">
        <h1 className="text-2xl font-bold">損益分岐エンジン</h1>
        <p className="text-xs opacity-80 mt-1">{year}年{month}月</p>
      </header>

      <section className="px-4 mt-4">
        <label className="block text-xs text-zinc-500 mb-1">エリア</label>
        <select
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-base"
        >
          {AREAS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </section>

      <section className="px-4 mt-6">
        <h2 className="text-base font-semibold mb-2">固定費(月次)</h2>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          {([
            ["人件費", "laborCost"],
            ["家賃", "rent"],
            ["その他固定費", "other"],
          ] as const).map(([label, key]) => (
            <label key={key} className="block">
              <span className="block text-xs text-zinc-500 mb-1">{label}</span>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                disabled={!canEdit}
                value={fixed[key] || ""}
                onChange={(e) => setFixed(f => ({
                  ...f, [key]: Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                }))}
                className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-right text-base tabular-nums disabled:opacity-60"
                placeholder="0"
              />
            </label>
          ))}
          {canEdit && (
            <button
              type="button" onClick={save} disabled={saving}
              className="w-full min-h-[52px] rounded-lg bg-indigo-600 active:bg-indigo-800 text-white font-semibold disabled:opacity-50"
            >
              {saving ? "保存中..." : "固定費を保存"}
            </button>
          )}
          {!canEdit && (
            <p className="text-xs text-zinc-500 text-center">固定費の編集は役員のみ可能です</p>
          )}
        </div>
      </section>

      <section className="px-4 mt-6">
        <h2 className="text-base font-semibold mb-2">損益分岐 自動算出</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card label="固定費合計" value={yen(be.fixedTotal)} />
          <Card label="現在の粗利率" value={`${be.grossMarginPct.toFixed(1)} %`} />
          <Card label="損益分岐売上" value={yen(be.breakevenSales)} accent />
          <Card label="損益分岐件数" value={`${be.breakevenCount} 件`} accent />
          <Card label="残必要件数" value={`${be.remainingCount} 件`} />
          <Card label="1日あたり必要" value={`${be.perDayCount.toFixed(1)} 件`} />
          <Card label="達成率" value={`${be.achievementPct.toFixed(1)} %`}
            accent={be.achievementPct >= 100 ? "good" : "warn"} />
          <Card label="残営業日数" value={`${be.remainingDays} 日`} />
        </div>
      </section>

      <section className="px-4 mt-6">
        <h2 className="text-base font-semibold mb-2">参考:現状サマリー</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card label="現在の売上" value={yen(summary.totalRevenue)} />
          <Card label="現在の粗利" value={yen(summary.totalProfit)} />
          <Card label="現在の件数" value={`${summary.totalCount} 件`} />
          <Card label="現在の客単価" value={yen(summary.companyUnitPrice)} />
        </div>
      </section>
    </div>
  );
}

function Card({
  label, value, accent,
}: { label: string; value: string; accent?: boolean | "good" | "warn" }) {
  const cls =
    accent === "good" ? "text-emerald-600" :
    accent === "warn" ? "text-amber-600" :
    accent ? "text-indigo-600" : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
