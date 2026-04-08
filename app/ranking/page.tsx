"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateDashboard, type DailyEntry, yen } from "../lib/calculations";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type Mode = "revenue" | "profit" | "margin" | "count" | "unit";
const MODES: { key: Mode; label: string }[] = [
  { key: "revenue", label: "売上" },
  { key: "profit", label: "粗利" },
  { key: "margin", label: "粗利率" },
  { key: "count", label: "件数" },
  { key: "unit", label: "客単価" },
];

export default function RankingPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const prevDate = new Date(year, month - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;

  const [current, setCurrent] = useState<Record<string, DailyEntry[]>>({});
  const [previous, setPrevious] = useState<Record<string, DailyEntry[]>>({});
  const [mode, setMode] = useState<Mode>("revenue");

  useEffect(() => {
    Promise.all(AREAS.map(async (a) => {
      const r = await fetch(`/api/entries?area=${a.id}&year=${year}&month=${month}`);
      return [a.id, (await r.json()).entries ?? []] as const;
    })).then((pairs) => {
      const m: Record<string, DailyEntry[]> = {};
      for (const [k, v] of pairs) m[k] = v;
      setCurrent(m);
    });
    Promise.all(AREAS.map(async (a) => {
      const r = await fetch(`/api/entries?area=${a.id}&year=${prevYear}&month=${prevMonth}`);
      return [a.id, (await r.json()).entries ?? []] as const;
    })).then((pairs) => {
      const m: Record<string, DailyEntry[]> = {};
      for (const [k, v] of pairs) m[k] = v;
      setPrevious(m);
    });
  }, [year, month, prevYear, prevMonth]);

  const rows = useMemo(() => {
    return AREAS.map((a) => {
      const cur = calculateDashboard(current[a.id] ?? [], year, month, now);
      const prev = calculateDashboard(previous[a.id] ?? [], prevYear, prevMonth, new Date(prevYear, prevMonth, 0));
      const getValue = (s: typeof cur): number => {
        switch (mode) {
          case "revenue": return s.totalRevenue;
          case "profit": return s.totalProfit;
          case "margin": return s.grossMargin;
          case "count": return s.totalCount;
          case "unit": return s.companyUnitPrice;
        }
      };
      const value = getValue(cur);
      const prevValue = getValue(prev);
      const diff = value - prevValue;
      return { area: a, value, prevValue, diff };
    }).sort((a, b) => b.value - a.value);
  }, [current, previous, mode, year, month, prevYear, prevMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const max = Math.max(1, ...rows.map((r) => r.value));
  const fmt = (v: number) =>
    mode === "margin" ? `${v.toFixed(1)}%`
    : mode === "count" ? `${v}件`
    : yen(v);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
      <header className="px-5 py-5 bg-gradient-to-b from-rose-700 to-rose-800 text-white">
        <h1 className="text-2xl font-bold">エリアランキング</h1>
        <p className="text-xs opacity-80 mt-1">{year}年{month}月 ・ 前月比</p>
      </header>

      <section className="px-3 mt-3">
        <div className="flex overflow-x-auto no-scrollbar gap-2 touch-pan-x">
          {MODES.map((m) => (
            <button
              key={m.key} type="button" onClick={() => setMode(m.key)}
              className={`shrink-0 min-h-[44px] px-4 rounded-lg text-sm whitespace-nowrap ${
                mode === m.key
                  ? "bg-rose-600 text-white font-semibold"
                  : "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="px-4 mt-4 space-y-2">
        {rows.map((r, idx) => {
          const ratio = (r.value / max) * 100;
          const up = r.diff > 0;
          const down = r.diff < 0;
          return (
            <div
              key={r.area.id}
              className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-7 text-center text-sm font-bold ${
                    idx === 0 ? "text-amber-500" : idx === 1 ? "text-zinc-400" : idx === 2 ? "text-orange-700" : "text-zinc-500"
                  }`}>
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`}
                  </span>
                  <span className="font-semibold">{r.area.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold tabular-nums">{fmt(r.value)}</div>
                  <div className={`text-[11px] tabular-nums ${
                    up ? "text-emerald-600" : down ? "text-red-500" : "text-zinc-500"
                  }`}>
                    {up ? "↑" : down ? "↓" : "→"} {fmt(Math.abs(r.diff))}
                  </div>
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-rose-500"
                  style={{ width: `${ratio}%` }}
                />
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
