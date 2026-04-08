"use client";

import { useMemo, useState, useEffect } from "react";
import {
  calculateBreakeven, calculateDashboard, calculateDriver,
  type DailyEntry, type DriverInputs, type FixedCosts, yen,
} from "../lib/calculations";
import { useRole } from "../components/RoleProvider";

const DEFAULT: DriverInputs = {
  adCost: 1_000_000,
  cpa: 15_000,
  closingRate: 50,
  lightRatio: 30, constRatio: 50, helpRatio: 20,
  lightUnit: 30_000, constUnit: 200_000, helpUnit: 80_000,
  lightMargin: 60, constMargin: 35, helpMargin: 50,
};

export default function DriverPage() {
  const role = useRole();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [d, setD] = useState<DriverInputs>(DEFAULT);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [fixed, setFixed] = useState<FixedCosts>({ laborCost: 0, rent: 0, other: 0 });

  // 全エリア合算で参考情報を取得
  useEffect(() => {
    const ids = ["kansai","kanto","nagoya","kyushu","kitakanto","hokkaido","chugoku","shizuoka"];
    Promise.all(ids.map(id =>
      fetch(`/api/entries?area=${id}&year=${year}&month=${month}`)
        .then(r => r.ok ? r.json() : { entries: [] })
    )).then((rs: { entries: DailyEntry[] }[]) => {
      setEntries(rs.flatMap(r => r.entries ?? []));
    });
    fetch(`/api/fixed-costs?area=kansai&year=${year}&month=${month}`)
      .then(r => r.ok ? r.json() : { fixedCosts: { laborCost: 0, rent: 0, other: 0 } })
      .then((j: { fixedCosts: FixedCosts }) => setFixed(j.fixedCosts));
  }, [year, month]);

  const result = useMemo(() => calculateDriver(d), [d]);
  const summary = useMemo(
    () => calculateDashboard(entries, year, month, now),
    [entries, year, month] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const be = useMemo(() => calculateBreakeven(fixed, summary), [fixed, summary]);
  const diff = result.grossProfit - be.fixedTotal;

  if (role && role !== "admin") {
    return (
      <div className="p-8 text-center text-zinc-500">
        このページは役員のみアクセス可能です
      </div>
    );
  }

  function update<K extends keyof DriverInputs>(k: K, v: number) {
    setD(prev => ({ ...prev, [k]: v }));
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
      <header className="px-5 py-5 bg-gradient-to-b from-purple-700 to-purple-800 text-white">
        <h1 className="text-2xl font-bold">利益ドライバーモデル</h1>
        <p className="text-xs opacity-80 mt-1">スライダー操作でリアルタイム試算</p>
      </header>

      {/* 結果カード */}
      <section className="px-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <Card label="予測リード" value={`${result.leads} 件`} />
          <Card label="予測成約" value={`${result.deals} 件`} accent="purple" />
          <Card label="予測売上" value={yen(result.revenue)} accent="purple" />
          <Card label="予測粗利" value={yen(result.grossProfit)} accent="purple" />
          <Card label="平均客単価" value={yen(result.avgUnit)} />
          <Card label="平均粗利率" value={`${result.avgMargin.toFixed(1)} %`} />
        </div>
      </section>

      {/* 損益分岐との差分 */}
      <section className="px-4 mt-4">
        <div className={`rounded-xl p-4 text-white ${diff >= 0 ? "bg-emerald-600" : "bg-red-600"}`}>
          <p className="text-xs opacity-90">損益分岐との差分(粗利 - 固定費)</p>
          <p className="text-3xl font-bold tabular-nums mt-1">
            {diff >= 0 ? "+" : ""}{yen(diff)}
          </p>
          <p className="text-xs opacity-80 mt-1">
            固定費合計: {yen(be.fixedTotal)}
          </p>
        </div>
      </section>

      {/* スライダー群 */}
      <section className="px-4 mt-6 space-y-4">
        <h2 className="text-base font-semibold">パラメータ</h2>

        <Slider label="広告費" value={d.adCost} min={0} max={5_000_000} step={50_000}
          format={yen} onChange={(v) => update("adCost", v)} />
        <Slider label="CPA(獲得単価)" value={d.cpa} min={5_000} max={50_000} step={500}
          format={yen} onChange={(v) => update("cpa", v)} />
        <Slider label="成約率" value={d.closingRate} min={0} max={100} step={1}
          format={(v) => `${v}%`} onChange={(v) => update("closingRate", v)} />

        <h3 className="text-sm font-semibold text-zinc-500 mt-4">案件ミックス</h3>
        <Slider label="軽作業比率" value={d.lightRatio} min={0} max={100} step={1}
          format={(v) => `${v}%`} onChange={(v) => update("lightRatio", v)} />
        <Slider label="工事率" value={d.constRatio} min={0} max={100} step={1}
          format={(v) => `${v}%`} onChange={(v) => update("constRatio", v)} />
        <Slider label="HELP率" value={d.helpRatio} min={0} max={100} step={1}
          format={(v) => `${v}%`} onChange={(v) => update("helpRatio", v)} />

        <h3 className="text-sm font-semibold text-zinc-500 mt-4">単価</h3>
        <Slider label="軽作業単価" value={d.lightUnit} min={10_000} max={500_000} step={5_000}
          format={yen} onChange={(v) => update("lightUnit", v)} />
        <Slider label="工事単価" value={d.constUnit} min={10_000} max={500_000} step={5_000}
          format={yen} onChange={(v) => update("constUnit", v)} />
        <Slider label="HELP単価" value={d.helpUnit} min={10_000} max={500_000} step={5_000}
          format={yen} onChange={(v) => update("helpUnit", v)} />

        <h3 className="text-sm font-semibold text-zinc-500 mt-4">粗利率</h3>
        <Slider label="軽作業粗利率" value={d.lightMargin} min={0} max={100} step={1}
          format={(v) => `${v}%`} onChange={(v) => update("lightMargin", v)} />
        <Slider label="工事粗利率" value={d.constMargin} min={0} max={100} step={1}
          format={(v) => `${v}%`} onChange={(v) => update("constMargin", v)} />
        <Slider label="HELP粗利率" value={d.helpMargin} min={0} max={100} step={1}
          format={(v) => `${v}%`} onChange={(v) => update("helpMargin", v)} />
      </section>
    </div>
  );
}

function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm">{label}</span>
        <span className="text-base font-bold tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-3 accent-purple-600"
      />
    </div>
  );
}

function Card({
  label, value, accent,
}: { label: string; value: string; accent?: "purple" }) {
  const cls = accent === "purple" ? "text-purple-600 dark:text-purple-400" : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
