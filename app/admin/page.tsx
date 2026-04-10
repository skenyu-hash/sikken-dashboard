"use client";

import { useEffect, useState } from "react";
import { useSession } from "../components/RoleProvider";
import type { Role } from "../lib/auth";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type User = {
  id: number;
  email: string;
  name: string;
  role: Role;
  areaId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
};

type AuditLog = {
  id: number;
  userName: string | null;
  userEmail: string | null;
  action: string;
  areaId: string | null;
  targetDate: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export default function AdminPage() {
  const session = useSession();
  const [tab, setTab] = useState<"users" | "audit">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [areaFilter, setAreaFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{
    email: string; password: string; name: string; role: Role; areaId: string;
  }>({ email: "", password: "", name: "", role: "input", areaId: "" });
  const [msg, setMsg] = useState<string | null>(null);

  async function loadUsers() {
    const r = await fetch("/api/users");
    if (r.ok) setUsers((await r.json()).users);
  }
  async function loadLogs() {
    const url = areaFilter ? `/api/audit?area=${areaFilter}` : "/api/audit";
    const r = await fetch(url);
    if (r.ok) setLogs((await r.json()).logs);
  }

  useEffect(() => {
    if (session?.role !== "admin") return;
    if (tab === "users") loadUsers();
    else loadLogs();
  }, [tab, areaFilter, session]);

  if (session && session.role !== "admin") {
    return <div className="p-8 text-center text-zinc-500">役員のみアクセス可能です</div>;
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...form,
        areaId: form.areaId || null,
      }),
    });
    if (res.ok) {
      setMsg("ユーザーを作成しました");
      setShowCreate(false);
      setForm({ email: "", password: "", name: "", role: "input", areaId: "" });
      loadUsers();
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error ?? "作成に失敗しました");
    }
  }

  async function toggleActive(u: User) {
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: u.id, isActive: !u.isActive }),
    });
    loadUsers();
  }

  async function changeRole(u: User, role: Role) {
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: u.id, role }),
    });
    loadUsers();
  }

  async function changeArea(u: User, areaId: string) {
    await fetch("/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: u.id, areaId: areaId || null }),
    });
    loadUsers();
  }

  async function resetPassword(u: User) {
    const pw = prompt(`${u.email} の新しいパスワード(8文字以上)`);
    if (!pw) return;
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: u.id, password: pw }),
    });
    setMsg(res.ok ? "パスワードを変更しました" : "変更に失敗しました");
  }

  function exportCsv() {
    const url = areaFilter ? `/api/audit?area=${areaFilter}&format=csv` : "/api/audit?format=csv";
    window.open(url, "_blank");
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
      <header className="px-5 py-5 bg-gradient-to-b from-zinc-800 to-zinc-900 text-white">
        <h1 className="text-2xl font-bold">管理者画面</h1>
        <p className="text-xs opacity-80 mt-1">ユーザー管理 / 操作ログ</p>
      </header>

      <div className="px-3 mt-3 flex gap-2">
        {(["users", "audit"] as const).map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`min-h-[44px] px-4 rounded-lg text-sm ${
              tab === t ? "bg-emerald-600 text-white font-semibold" : "bg-zinc-200 dark:bg-zinc-800"
            }`}
          >{t === "users" ? "ユーザー" : "操作ログ"}</button>
        ))}
      </div>

      {msg && (
        <div className="mx-4 mt-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-3 py-2 text-sm">
          {msg}
        </div>
      )}

      {tab === "users" && (
        <section className="px-4 mt-4">
          <button
            type="button" onClick={() => setShowCreate((v) => !v)}
            className="w-full min-h-[48px] rounded-lg bg-emerald-600 text-white font-semibold mb-3"
          >{showCreate ? "閉じる" : "+ 新規ユーザー追加"}</button>

          {showCreate && (
            <form onSubmit={createUser} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 mb-4">
              <Input label="氏名" value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
              <Input label="メール" type="email" value={form.email}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
              <Input label="パスワード(8文字以上)" type="password" value={form.password}
                onChange={(v) => setForm((f) => ({ ...f, password: v }))} />
              <label className="block">
                <span className="block text-xs text-zinc-500 mb-1">ロール</span>
                <select value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                  className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-base">
                  <option value="admin">役員（全編集・全閲覧）</option>
                  <option value="manager">部長（ダッシュボード・目標のみ編集）</option>
                  <option value="staff">内勤・役職者（編集なし・限定閲覧）</option>
                  <option value="input">事務員（ダッシュボードのみ編集）</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-xs text-zinc-500 mb-1">担当エリア(input時のみ有効/未指定=全エリア)</span>
                <select value={form.areaId}
                  onChange={(e) => setForm((f) => ({ ...f, areaId: e.target.value }))}
                  className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-base">
                  <option value="">(全エリア)</option>
                  {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <button type="submit"
                className="w-full min-h-[48px] rounded-lg bg-blue-600 text-white font-semibold">
                作成
              </button>
            </form>
          )}

          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold">{u.name}</div>
                    <div className="text-xs text-zinc-500">{u.email}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  }`}>{u.isActive ? "有効" : "無効"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <select value={u.role}
                    onChange={(e) => changeRole(u, e.target.value as Role)}
                    className="min-h-[40px] rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm px-2">
                    <option value="admin">役員</option>
                    <option value="manager">部長</option>
                    <option value="staff">内勤・役職者</option>
                    <option value="input">事務員</option>
                  </select>
                  <select value={u.areaId ?? ""}
                    onChange={(e) => changeArea(u, e.target.value)}
                    className="min-h-[40px] rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm px-2">
                    <option value="">全エリア</option>
                    {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="text-[10px] text-zinc-500 mt-2">
                  最終ログイン: {u.lastLoginAt ?? "未"}
                  {u.lockedUntil && <span className="text-red-500 ml-2">ロック中</span>}
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => toggleActive(u)}
                    className="flex-1 min-h-[36px] rounded text-xs bg-zinc-200 dark:bg-zinc-800">
                    {u.isActive ? "無効化" : "有効化"}
                  </button>
                  <button type="button" onClick={() => resetPassword(u)}
                    className="flex-1 min-h-[36px] rounded text-xs bg-zinc-200 dark:bg-zinc-800">
                    PW変更
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "audit" && (
        <section className="px-4 mt-4">
          <div className="flex gap-2 mb-3">
            <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}
              className="flex-1 min-h-[44px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm">
              <option value="">全エリア</option>
              {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button type="button" onClick={exportCsv}
              className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold">
              CSV
            </button>
          </div>
          <div className="space-y-2">
            {logs.length === 0 && <p className="text-xs text-zinc-500 text-center py-4">ログがありません</p>}
            {logs.map((l) => (
              <div key={l.id} className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold">{l.action}</span>
                  <span className="text-zinc-500">{new Date(l.createdAt).toLocaleString("ja-JP")}</span>
                </div>
                <div className="text-zinc-500 mt-1">
                  {l.userName ?? "-"} ({l.userEmail ?? "-"})
                </div>
                <div className="text-zinc-500">
                  {l.areaId && `エリア:${l.areaId} `}
                  {l.targetDate && `日付:${l.targetDate} `}
                  {l.ipAddress && `IP:${l.ipAddress}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Input({
  label, value, onChange, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-500 mb-1">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[48px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 text-base" />
    </label>
  );
}
