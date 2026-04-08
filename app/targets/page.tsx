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

type Unit = "man" | "yen" | "count" | "pct";
type Field = { key: keyof Targets; label: string; unit: Unit };

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "① 全体KPI",
    fields: [
      { key: "targetSales", label: "売上目標", unit: "man" },
      { key: "targetProfit", label: "粗利目標", unit: "man" },
      { key: "targetCount", label: "獲得件数目標", unit: "count" },
      { key: "targetCpa", label: "CPA目標", unit: "yen" },
      { key: "targetConversionRate", label: "成約率目標", unit: "pct" },
    ],
  },
  {
    title: "② HELP部門目標",
    fields: [
      { key: "targetHelpSales", label: "HELP売上目標", unit: "man" },
      { key: "targetHelpCount", label: "HELP件数目標", unit: "count" },
      { key: "targetHelpUnitPrice", label: "HELP客単価目標", unit: "yen" },
    ],
  },
  {
    title: "③ 部門別目標",
    fields: [
      { key: "targetSelfSales", label: "自社施工 売上目標", unit: "man" },
      { key: "targetSelfProfit", label: "自社施工 粗利目標", unit: "man" },
      { key: "targetSelfCount", label: "自社施工 件数目標", unit: "count" },
      { key: "targetNewSales", label: "新規営業 売上目標", unit: "man" },
      { key: "targetNewProfit", label: "新規営業 粗利目標", unit: "man" },
      { key: "targetNewCount", label: "新規営業 件数目標", unit: "count" },
    ],
  },
  {
    title: "④ コスト指標",
    fields: [
      { key: "targetAdCost", label: "広告費目標", unit: "man" },
      { key: "targetAdRate", label: "広告費率目標", unit: "pct" },
      { key: "targetLaborRate", label: "職人費率目標", unit: "pct" },
      { key: "targetMaterialRate", label: "材料費率目標", unit: "pct" },
    ],
  },
  {
    title: "⑤ その他KPI",
    fields: [
      { key: "targetVehicleCount", label: "車両数", unit: "count" },
      { key: "targetCallCount", label: "入電件数目標", unit: "count" },
      { key: "targetConstructionRate", label: "工事取得率目標", unit: "pct" },
      { key: "targetPassRate", label: "パス率目標", unit: "pct" },
    ],
  },
];

// 万円系フィールド: 表示は万円、保存は円
const MAN_FIELDS = new Set<keyof Targets>(
  SECTIONS.flatMap((s) => s.fields).filter((f) => f.unit === "man").map((f) => f.key)
);

export default function TargetsPage() {
  const role = useRole();
  // 役員(admin)と管理職(manager)のみ目標編集可能。事務員(input)は閲覧のみ
  const canEdit = role === "admin" || role === "manager";
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
      .then((j: { targets: Targets }) => setTargets({ ...emptyTargets(), ...j.targets }));
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

  /** 入力値 → state(円換算済み) */
  function setField(k: keyof Targets, raw: string) {
    const num = Number(raw.replace(/[^0-9.]/g, "")) || 0;
    const stored = MAN_FIELDS.has(k) ? Math.round(num * 10000) : num;
    setTargets((t) => ({ ...t, [k]: stored }));
  }

  /** state(円) → 入力欄表示値(万円なら ÷10000) */
  function displayValue(k: keyof Targets): string {
    const v = targets[k] ?? 0;
    if (!v) return "";
    if (MAN_FIELDS.has(k)) return String(v / 10000);
    return String(v);
  }

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

      {SECTIONS.map((section) => (
        <section key={section.title} className="px-4 mt-5">
          <h2 className="text-base font-semibold mb-2">{section.title}</h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 grid grid-cols-2 gap-3">
            {section.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-xs text-zinc-500 mb-1">
                  {f.label}
                  {f.unit === "man" && "(万円)"}
                  {f.unit === "yen" && "(円)"}
                  {f.unit === "count" && "(件)"}
                  {f.unit === "pct" && "(%)"}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={!canEdit}
                  value={displayValue(f.key)}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-right text-base tabular-nums disabled:opacity-60"
                  placeholder="0"
                />
                {f.unit === "man" && targets[f.key] > 0 && (
                  <span className="block text-[10px] text-zinc-500 text-right mt-1">
                    {yen(targets[f.key])}
                  </span>
                )}
              </label>
            ))}
          </div>
        </section>
      ))}

      <section className="px-4 mt-6">
        {canEdit ? (
          <button
            type="button" onClick={save} disabled={saving}
            className="w-full min-h-[52px] rounded-lg bg-blue-600 active:bg-blue-800 text-white font-semibold disabled:opacity-50"
          >
            {saving ? "保存中..." : "目標を保存"}
          </button>
        ) : (
          <p className="text-xs text-zinc-500 text-center">目標の編集は役員・管理職のみ可能です</p>
        )}
        {savedMsg && (
          <p className={`mt-2 text-sm text-center ${savedMsg.includes("失敗") ? "text-red-500" : "text-emerald-600"}`}>
            {savedMsg}
          </p>
        )}
      </section>
    </div>
  );
}
