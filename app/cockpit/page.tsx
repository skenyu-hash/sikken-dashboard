"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateCashflow, calculateDashboard,
  type CashflowSummary, type DailyEntry, yen,
} from "../lib/calculations";
import { useRole } from "../components/RoleProvider";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type CashflowEntry = {
  id?: number;
  areaId: string;
  year: number;
  month: number;
  accountsReceivable: number;
  accountsReceivableOverdue: number;
  bankBalance: number;
  loanBalance: number;
  loanRepayment: number;
  scheduledPayments: number;
  paymentDueDate: string | null;
  notes: string;
};

const empty = (year: number, month: number): CashflowEntry => ({
  areaId: AREAS[0].id, year, month,
  accountsReceivable: 0, accountsReceivableOverdue: 0,
  bankBalance: 0, loanBalance: 0, loanRepayment: 0,
  scheduledPayments: 0, paymentDueDate: null, notes: "",
});

export default function CockpitPage() {
  const role = useRole();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [cfs, setCfs] = useState<CashflowEntry[]>([]);
  const [form, setForm] = useState<CashflowEntry>(() => empty(year, month));
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const r = await fetch(`/api/cashflow?year=${year}&month=${month}`);
    if (!r.ok) return;
    const j = await r.json();
    setCfs(j.entries ?? []);
  }

  useEffect(() => {
    if (role !== "admin") return;
    reload();
    // 全エリア合算売上(DSO計算用)
    Promise.all(AREAS.map(async (a) => {
      const r = await fetch(`/api/entries?area=${a.id}&year=${year}&month=${month}`);
      return (await r.json()).entries ?? [];
    })).then((rs: DailyEntry[][]) => {
      const all = rs.flat();
      const s = calculateDashboard(all, year, month, now);
      setMonthlyRevenue(s.totalRevenue);
    });
  }, [role, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => calculateCashflow(cfs, monthlyRevenue), [cfs, monthlyRevenue]);

  // エリア別集計
  const perArea = useMemo(() => {
    const map = new Map<string, CashflowSummary>();
    for (const a of AREAS) {
      const filt = cfs.filter((c) => c.areaId === a.id);
      map.set(a.id, calculateCashflow(filt, monthlyRevenue / AREAS.length));
    }
    return map;
  }, [cfs, monthlyRevenue]);

  if (role && role !== "admin") {
    return (
      <div className="p-8 text-center text-zinc-500">
        このページは役員のみアクセス可能です
      </div>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/cashflow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setForm(empty(year, month));
    reload();
  }

  async function remove(id: number) {
    if (!confirm("削除しますか?")) return;
    await fetch(`/api/cashflow?id=${id}`, { method: "DELETE" });
    reload();
  }

  function setF<K extends keyof CashflowEntry>(k: K, v: CashflowEntry[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const shortAlert = summary.daysToShortage < 30;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
      <header className="px-5 py-5 bg-gradient-to-b from-slate-800 to-slate-900 text-white">
        <h1 className="text-2xl font-bold">役員コックピット</h1>
        <p className="text-xs opacity-80 mt-1">{year}年{month}月 ・ CF管理</p>
      </header>

      {/* 資金ショート予測 */}
      <section className="px-4 mt-4">
        <div className={`rounded-2xl p-5 text-white ${
          shortAlert ? "bg-red-700 animate-pulse" : "bg-emerald-700"
        }`}>
          <p className="text-xs opacity-90">資金ショートまで</p>
          <p className="text-5xl font-bold tabular-nums mt-1">
            {summary.daysToShortage >= 9999 ? "—" : `${summary.daysToShortage} 日`}
          </p>
          <p className="text-xs opacity-90 mt-2">
            残高 {yen(summary.totalBank)} ÷ 日次支出
          </p>
        </div>
      </section>

      {/* 主要指標 */}
      <section className="px-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <Card label="売掛金合計" value={yen(summary.totalAR)} />
          <Card label="口座残高合計" value={yen(summary.totalBank)}
            color={summary.totalBank > summary.totalPayments ? "good" : "bad"} />
          <Card label="融資残高" value={yen(summary.totalLoan)} />
          <Card label="月次返済" value={yen(summary.totalRepayment)} />
          <Card label="支払予定" value={yen(summary.totalPayments)} />
          <Card label="月次CF" value={yen(summary.monthlyCF)}
            color={summary.monthlyCF >= 0 ? "good" : "bad"} />
          <Card label="DSO(回収日数)" value={`${summary.dso.toFixed(1)} 日`} />
          <Card label="回収遅延率" value={`${summary.overdueRate.toFixed(1)} %`}
            color={summary.overdueRate > 20 ? "bad" : summary.overdueRate > 10 ? "warn" : "good"} />
        </div>
      </section>

      {/* エリア別CF */}
      <section className="px-4 mt-6">
        <h2 className="text-base font-semibold mb-2">エリア別 売掛金 / 残高</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-800 text-xs">
              <tr>
                <th className="p-2 text-left">エリア</th>
                <th className="p-2 text-right">売掛金</th>
                <th className="p-2 text-right">残高</th>
                <th className="p-2 text-right">CF</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {AREAS.map((a) => {
                const s = perArea.get(a.id)!;
                return (
                  <tr key={a.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="p-2">{a.name}</td>
                    <td className="p-2 text-right">{yen(s.totalAR)}</td>
                    <td className="p-2 text-right">{yen(s.totalBank)}</td>
                    <td className={`p-2 text-right font-semibold ${
                      s.monthlyCF >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}>{yen(s.monthlyCF)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 支払予定一覧 */}
      <section className="px-4 mt-6">
        <h2 className="text-base font-semibold mb-2">登録済みエントリ</h2>
        <div className="space-y-2">
          {cfs.length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-4">まだ登録がありません</p>
          )}
          {cfs.map((c) => {
            const area = AREAS.find((a) => a.id === c.areaId);
            return (
              <div key={c.id} className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="flex justify-between items-start">
                  <div className="text-sm font-semibold">{area?.name}</div>
                  <button
                    type="button"
                    onClick={() => c.id && remove(c.id)}
                    className="text-xs text-red-500"
                  >削除</button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs tabular-nums">
                  <div>売掛: {yen(c.accountsReceivable)}</div>
                  <div className="text-amber-600">遅延: {yen(c.accountsReceivableOverdue)}</div>
                  <div>残高: {yen(c.bankBalance)}</div>
                  <div>融資: {yen(c.loanBalance)}</div>
                  <div>返済: {yen(c.loanRepayment)}</div>
                  <div>支払: {yen(c.scheduledPayments)}</div>
                </div>
                {c.paymentDueDate && (
                  <div className="text-[11px] text-zinc-500 mt-1">期日: {c.paymentDueDate}</div>
                )}
                {c.notes && <div className="text-[11px] text-zinc-500 mt-1">{c.notes}</div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* 入力フォーム */}
      <section className="px-4 mt-6">
        <h2 className="text-base font-semibold mb-2">CFエントリ追加</h2>
        <form onSubmit={save} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">エリア</span>
            <select value={form.areaId} onChange={(e) => setF("areaId", e.target.value)}
              className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-base">
              {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          {([
            ["売掛金", "accountsReceivable"],
            ["うち30日超(遅延)", "accountsReceivableOverdue"],
            ["口座残高", "bankBalance"],
            ["融資残高", "loanBalance"],
            ["月次返済", "loanRepayment"],
            ["支払予定", "scheduledPayments"],
          ] as const).map(([label, key]) => (
            <label key={key} className="block">
              <span className="block text-xs text-zinc-500 mb-1">{label}</span>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*"
                value={form[key] || ""}
                onChange={(e) => setF(key, Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-right text-base tabular-nums"
                placeholder="0"
              />
            </label>
          ))}

          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">支払期日</span>
            <input type="date" value={form.paymentDueDate ?? ""}
              onChange={(e) => setF("paymentDueDate", e.target.value || null)}
              className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-base" />
          </label>

          <label className="block">
            <span className="block text-xs text-zinc-500 mb-1">備考</span>
            <textarea value={form.notes}
              onChange={(e) => setF("notes", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-base" />
          </label>

          <button type="submit" disabled={saving}
            className="w-full min-h-[52px] rounded-lg bg-slate-700 active:bg-slate-900 text-white font-semibold disabled:opacity-50">
            {saving ? "保存中..." : "追加する"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Card({
  label, value, color,
}: { label: string; value: string; color?: "good" | "warn" | "bad" }) {
  const cls =
    color === "good" ? "text-emerald-600 dark:text-emerald-400" :
    color === "warn" ? "text-amber-600 dark:text-amber-400" :
    color === "bad" ? "text-red-600 dark:text-red-400" :
    "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
