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
        <section style={{ padding: "16px 20px" }}>
          {/* 新規追加フォーム（トグル） */}
          {showCreate && (
            <form onSubmit={createUser} style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 10, alignItems: "end" }}>
                <label>
                  <span style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 4 }}>氏名</span>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    style={{ width: "100%", height: 34, border: "1px solid #d1fae5", borderRadius: 6, padding: "0 8px", fontSize: 12 }} />
                </label>
                <label>
                  <span style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 4 }}>メール</span>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    style={{ width: "100%", height: 34, border: "1px solid #d1fae5", borderRadius: 6, padding: "0 8px", fontSize: 12 }} />
                </label>
                <label>
                  <span style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 4 }}>パスワード(8文字以上)</span>
                  <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    style={{ width: "100%", height: 34, border: "1px solid #d1fae5", borderRadius: 6, padding: "0 8px", fontSize: 12 }} />
                </label>
                <label>
                  <span style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 4 }}>ロール</span>
                  <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                    style={{ width: "100%", height: 34, border: "1px solid #d1fae5", borderRadius: 6, padding: "0 6px", fontSize: 11 }}>
                    <option value="admin">役員</option>
                    <option value="manager">部長</option>
                    <option value="staff">内勤・役職者</option>
                    <option value="input">事務員</option>
                  </select>
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="submit" style={{ flex: 1, height: 34, background: "#059669", color: "#fff", border: "none",
                    borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>作成</button>
                  <button type="button" onClick={() => setShowCreate(false)} style={{ height: 34, padding: "0 10px",
                    background: "#f3f4f6", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>閉じる</button>
                </div>
              </div>
            </form>
          )}

          {/* ユーザーテーブル */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
            <div style={{ background: "#ecfdf5", padding: "10px 16px", borderBottom: "1px solid #d1fae5",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                ユーザー管理（{users.length}名）
              </span>
              <button onClick={() => setShowCreate((v) => !v)}
                style={{ fontSize: 11, fontWeight: 700, background: "#059669", color: "#fff",
                  border: "none", borderRadius: 6, padding: "5px 14px", cursor: "pointer" }}>
                + 新規追加
              </button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "15%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "17%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#ecfdf5" }}>
                  {["氏名", "メール", "権限", "エリア", "状態", "最終ログイン", "アクション"].map((h) => (
                    <th key={h} style={{
                      padding: "8px 10px", fontSize: 10, fontWeight: 700,
                      color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em",
                      borderBottom: "1px solid #d1fae5", textAlign: "left",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f0faf0" }}>
                    <td style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, color: "#111" }}>{u.name}</td>
                    <td style={{ padding: "10px 10px", fontSize: 11, color: "#6b7280",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)}
                        style={{ border: "1px solid #d1fae5", borderRadius: 6, padding: "4px 6px",
                          fontSize: 11, fontWeight: 600, color: "#065f46", background: "#f0fdf4", width: "100%" }}>
                        <option value="admin">役員</option>
                        <option value="manager">部長</option>
                        <option value="staff">内勤</option>
                        <option value="input">事務員</option>
                      </select>
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <select value={u.areaId ?? ""} onChange={(e) => changeArea(u, e.target.value)}
                        style={{ border: "1px solid #d1fae5", borderRadius: 6, padding: "4px 6px",
                          fontSize: 11, color: "#374151", background: "#fff", width: "100%" }}>
                        <option value="">全エリア</option>
                        {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "10px 10px" }}>
                      <span style={{
                        display: "inline-block", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px",
                        background: u.isActive ? "#d1fae5" : "#fee2e2",
                        color: u.isActive ? "#065f46" : "#991b1b",
                      }}>{u.isActive ? "有効" : "無効"}</span>
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: 10, color: "#9ca3af" }}>
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
                        : "未"}
                      {u.lockedUntil && <span style={{ color: "#dc2626", marginLeft: 4 }}>ロック中</span>}
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => toggleActive(u)}
                          style={{ fontSize: 10, fontWeight: 700, border: "1px solid",
                            borderRadius: 5, padding: "4px 8px", cursor: "pointer",
                            borderColor: u.isActive ? "#fca5a5" : "#6ee7b7",
                            color: u.isActive ? "#991b1b" : "#065f46", background: "transparent" }}>
                          {u.isActive ? "無効化" : "有効化"}
                        </button>
                        <button onClick={() => resetPassword(u)}
                          style={{ fontSize: 10, fontWeight: 700, border: "1px solid #d1fae5",
                            borderRadius: 5, padding: "4px 8px", cursor: "pointer",
                            color: "#065f46", background: "#f0fdf4" }}>
                          PW変更
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
