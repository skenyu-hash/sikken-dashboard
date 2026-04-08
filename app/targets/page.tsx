"use client";

import { useEffect, useState } from "react";
import { emptyTargets, type Targets, yen } from "../lib/calculations";
import { useRole } from "../components/RoleProvider";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

export default function TargetsPage() {
  const role = useRole();
  const canEdit = role === "admin";
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [areaId, setAreaId] = useState(AREAS[0].id);
  const [targets, setTargets] = useState<Targets>(emptyTargets());
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/targets?area=${areaId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
      .then((j: { targets: Targets }) => setTargets(j.targets));
  }, [areaId, year, month]);

  async function save() {
    setSaving(true); setSavedMsg(null);
    const res = await fetch("/api/targets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ areaId, year, month, targets }),
    });
    setSaving(false);
    setSavedMsg(res.ok ? "保存しました" : "保存に失敗しました");
  }

  function setField(k: keyof Targets, v: string) {
    setTargets((t) => ({
      ...t,
      [k]: Number(v.replace(/[^0-9.]/g, "")) || 0,
    }));
  }

  const fields: { key: keyof Targets; label: string; format: "yen" | "count" | "pct" }[] = [
    { key: "targetSales", label: "目標売上", format: "yen" },
    { key: "targetProfit", label: "目標粗利", format: "yen" },
    { key: "targetCount", label: "目標件数", format: "count" },
    { key: "targetCpa", label: "目標CPA", format: "yen" },
    { key: "targetConversionRate", label: "目標成約率(%)", format: "pct" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
      <header className="px-5 py-5 bg-gradient-to-b from-blue-700 to-blue-800 text-white">
        <h1 className="text-2xl font-bold">月次目標</h1>
        <p className="text-xs opacity-80 mt-1">{year}年{month}月</p>
      </header>

      <section className="px-4 mt-4">
        <label className="block text-xs text-zinc-500 mb-1">エリア</label>
        <select
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-base"
        >
          {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </section>

      <section className="px-4 mt-6">
        <h2 className="text-base font-semibold mb-2">目標値</h2>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-xs text-zinc-500 mb-1">{f.label}</span>
              <input
                type="text" inputMode="decimal"
                disabled={!canEdit}
                value={targets[f.key] || ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-right text-base tabular-nums disabled:opacity-60"
                placeholder="0"
              />
              {f.format === "yen" && targets[f.key] > 0 && (
                <span className="block text-[10px] text-zinc-500 text-right mt-1">
                  {yen(targets[f.key])}
                </span>
              )}
            </label>
          ))}
          {canEdit ? (
            <button
              type="button" onClick={save} disabled={saving}
              className="w-full min-h-[52px] rounded-lg bg-blue-600 active:bg-blue-800 text-white font-semibold disabled:opacity-50"
            >
              {saving ? "保存中..." : "目標を保存"}
            </button>
          ) : (
            <p className="text-xs text-zinc-500 text-center">目標の編集は役員のみ可能です</p>
          )}
          {savedMsg && (
            <p className={`text-sm text-center ${savedMsg.includes("失敗") ? "text-red-500" : "text-emerald-600"}`}>
              {savedMsg}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
