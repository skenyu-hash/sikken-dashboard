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

const SECTION_TITLE_STYLE: React.CSSProperties = {
  background: "#ecfdf5", padding: "8px 14px",
  fontSize: 11, fontWeight: 700, color: "#065f46",
  textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: "1px solid #d1fae5",
};
const CARD_STYLE: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden",
};

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

  const perArea = useMemo(() => {
    const map = new Map<string, CashflowSummary>();
    for (const a of AREAS) {
      const filt = cfs.filter((c) => c.areaId === a.id);
      map.set(a.id, calculateCashflow(filt, monthlyRevenue / AREAS.length));
    }
    return map;
  }, [cfs, monthlyRevenue]);

  if (role && role !== "admin") {
    return <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>このページは役員のみアクセス可能です</div>;
  }

  // 万円<->円
  const MAN_KEYS = new Set<keyof CashflowEntry>([
    "accountsReceivable", "accountsReceivableOverdue", "bankBalance",
    "loanBalance", "loanRepayment", "scheduledPayments",
  ]);
  function setF<K extends keyof CashflowEntry>(k: K, v: CashflowEntry[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function setManField(k: keyof CashflowEntry, raw: string) {
    const n = Number(raw.replace(/[^0-9.]/g, "")) || 0;
    setForm((f) => ({ ...f, [k]: Math.round(n * 10000) }));
  }
  function dispMan(k: keyof CashflowEntry): string {
    const v = form[k];
    if (typeof v !== "number" || !v) return "";
    return MAN_KEYS.has(k) ? String(v / 10000) : String(v);
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

  const shortAlert = summary.daysToShortage < 30;

  const moneyFields: { key: keyof CashflowEntry; label: string }[] = [
    { key: "accountsReceivable", label: "売掛金" },
    { key: "accountsReceivableOverdue", label: "うち30日超(遅延)" },
    { key: "bankBalance", label: "口座残高" },
    { key: "loanBalance", label: "融資残高" },
    { key: "loanRepayment", label: "月次返済" },
    { key: "scheduledPayments", label: "支払予定" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)", padding: "16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>役員コックピット</h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
              {year}年{month}月 ／ キャッシュフロー管理
            </p>
          </div>
        </div>
        {/* KPIサマリーバー */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
          <KPI label="資金ショートまで"
            value={summary.daysToShortage >= 9999 ? "—" : `${summary.daysToShortage}日`}
            alert={shortAlert} />
          <KPI label="売掛金合計" value={yen(summary.totalAR)} />
          <KPI label="口座残高" value={yen(summary.totalBank)} />
          <KPI label="融資残高" value={yen(summary.totalLoan)} />
          <KPI label="月次CF" value={yen(summary.monthlyCF)}
            color={summary.monthlyCF >= 0 ? "#a7f3d0" : "#fca5a5"} />
        </div>
      </div>

      {/* 主要指標カード(4枚) */}
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
          <SubCard label="月次返済" value={yen(summary.totalRepayment)} />
          <SubCard label="支払予定" value={yen(summary.totalPayments)} />
          <SubCard label="DSO(回収日数)" value={`${summary.dso.toFixed(1)} 日`} />
          <SubCard label="回収遅延率" value={`${summary.overdueRate.toFixed(1)}%`}
            badge={summary.overdueRate > 20 ? "danger" : summary.overdueRate > 10 ? "warn" : "good"} />
        </div>
      </div>

      {/* ボディ: 2列 */}
      <div style={{ padding: "0 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* 左: エリア別テーブル */}
        <div style={CARD_STYLE}>
          <div style={SECTION_TITLE_STYLE}>エリア別 売掛金 / 残高</div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "16%" }} />
              <col style={{ width: "23%" }} />
              <col style={{ width: "23%" }} />
              <col style={{ width: "23%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f8fdf8" }}>
                {["エリア", "売掛金", "口座残高", "月次CF", "件数"].map((h) => (
                  <th key={h} style={{
                    padding: "7px 8px", fontSize: 9, fontWeight: 700, color: "#9ca3af",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    borderBottom: "1px solid #f0faf0",
                    textAlign: h === "エリア" ? "left" : "right",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AREAS.map((a) => {
                const s = perArea.get(a.id)!;
                const cfPositive = s.monthlyCF >= 0;
                const count = cfs.filter((c) => c.areaId === a.id).length;
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f5faf5" }}>
                    <td style={{ padding: "8px 8px", fontSize: 12, fontWeight: 700, color: "#111" }}>{a.name}</td>
                    <td style={{ padding: "8px 8px", fontSize: 11, textAlign: "right" }}>{yen(s.totalAR)}</td>
                    <td style={{ padding: "8px 8px", fontSize: 11, textAlign: "right" }}>{yen(s.totalBank)}</td>
                    <td style={{ padding: "8px 8px", fontSize: 11, textAlign: "right", fontWeight: 700, color: cfPositive ? "#059669" : "#dc2626" }}>
                      {yen(s.monthlyCF)}
                    </td>
                    <td style={{ padding: "8px 8px", fontSize: 10, textAlign: "right", color: "#9ca3af" }}>{count}件</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 右: CFエントリ追加フォーム */}
        <div style={CARD_STYLE}>
          <div style={SECTION_TITLE_STYLE}>CFエントリ追加</div>
          <form onSubmit={save} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <FieldRow label="エリア">
              <select value={form.areaId} onChange={(e) => setF("areaId", e.target.value)}
                style={{
                  width: 160, height: 32, border: "1px solid #d1fae5", borderRadius: 6,
                  padding: "0 10px", fontSize: 12, fontWeight: 600, background: "#fff",
                }}>
                {AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FieldRow>
            {moneyFields.map((f) => (
              <FieldRow key={f.key} label={f.label} unit="万円">
                <input
                  type="text" inputMode="decimal"
                  value={dispMan(f.key)}
                  onChange={(e) => setManField(f.key, e.target.value)}
                  placeholder="0"
                  style={{
                    width: 160, height: 32, border: "1px solid #d1fae5", borderRadius: 6,
                    padding: "0 10px", fontSize: 12, fontWeight: 600, textAlign: "right",
                  }}
                />
              </FieldRow>
            ))}
            <FieldRow label="支払期日">
              <input type="date"
                value={form.paymentDueDate ?? ""}
                onChange={(e) => setF("paymentDueDate", e.target.value || null)}
                style={{
                  width: 160, height: 32, border: "1px solid #d1fae5", borderRadius: 6,
                  padding: "0 10px", fontSize: 12,
                }}
              />
            </FieldRow>
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>備考</div>
              <textarea value={form.notes} onChange={(e) => setF("notes", e.target.value)} rows={2}
                style={{
                  width: "100%", border: "1px solid #d1fae5", borderRadius: 6,
                  padding: "6px 10px", fontSize: 12, resize: "vertical",
                }}
              />
            </div>
            <button type="submit" disabled={saving}
              style={{
                marginTop: 4, width: "100%", height: 40,
                background: "#059669", color: "#fff", border: "none",
                borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: "pointer", opacity: saving ? 0.6 : 1,
              }}>
              {saving ? "保存中..." : "追加する"}
            </button>
          </form>
        </div>
      </div>

      {/* 下段: 登録済みエントリ */}
      <div style={{ padding: "14px 20px 24px" }}>
        <div style={CARD_STYLE}>
          <div style={SECTION_TITLE_STYLE}>登録済みエントリ</div>
          {cfs.length === 0 ? (
            <p style={{ padding: 24, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>まだ登録がありません</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fdf8" }}>
                  {["エリア", "売掛金", "口座残高", "融資残高", "月次返済", "支払予定", "支払期日", "備考", ""].map((h) => (
                    <th key={h} style={{
                      padding: "7px 8px", fontSize: 9, fontWeight: 700, color: "#9ca3af",
                      textTransform: "uppercase", letterSpacing: "0.05em",
                      borderBottom: "1px solid #f0faf0",
                      textAlign: h === "エリア" || h === "備考" ? "left" : "right",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cfs.map((c) => {
                  const area = AREAS.find((a) => a.id === c.areaId);
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f5faf5" }}>
                      <td style={{ padding: "8px 8px", fontSize: 12, fontWeight: 700 }}>{area?.name}</td>
                      <td style={{ padding: "8px 8px", fontSize: 11, textAlign: "right" }}>{yen(c.accountsReceivable)}</td>
                      <td style={{ padding: "8px 8px", fontSize: 11, textAlign: "right" }}>{yen(c.bankBalance)}</td>
                      <td style={{ padding: "8px 8px", fontSize: 11, textAlign: "right" }}>{yen(c.loanBalance)}</td>
                      <td style={{ padding: "8px 8px", fontSize: 11, textAlign: "right" }}>{yen(c.loanRepayment)}</td>
                      <td style={{ padding: "8px 8px", fontSize: 11, textAlign: "right" }}>{yen(c.scheduledPayments)}</td>
                      <td style={{ padding: "8px 8px", fontSize: 10, textAlign: "right", color: "#6b7280" }}>{c.paymentDueDate ?? "—"}</td>
                      <td style={{ padding: "8px 8px", fontSize: 10, color: "#6b7280" }}>{c.notes || "—"}</td>
                      <td style={{ padding: "8px 8px", textAlign: "right" }}>
                        <button type="button" onClick={() => c.id && remove(c.id)}
                          style={{
                            fontSize: 10, color: "#dc2626", background: "none", border: "none",
                            cursor: "pointer", fontWeight: 700,
                          }}>削除</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, color, alert }: { label: string; value: string; color?: string; alert?: boolean }) {
  return (
    <div style={{
      background: alert ? "rgba(220,38,38,0.25)" : "rgba(255,255,255,0.1)",
      borderRadius: 8, padding: "8px 12px",
      border: alert ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.15)",
    }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color ?? "#fff", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function SubCard({ label, value, badge }: { label: string; value: string; badge?: "good" | "warn" | "danger" }) {
  const bg = badge === "good" ? "#d1fae5" : badge === "warn" ? "#fef9c3" : badge === "danger" ? "#fee2e2" : "#fff";
  const color = badge === "good" ? "#064e3b" : badge === "warn" ? "#713f12" : badge === "danger" ? "#7f1d1d" : "#111";
  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", padding: 14,
    }}>
      <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ marginTop: 4 }}>
        {badge ? (
          <span style={{
            display: "inline-block", fontSize: 14, fontWeight: 800,
            borderRadius: 4, padding: "2px 10px", background: bg, color,
          }}>{value}</span>
        ) : (
          <span style={{ fontSize: 18, fontWeight: 800, color: "#111" }}>{value}</span>
        )}
      </div>
    </div>
  );
}

function FieldRow({ label, unit, children }: { label: string; unit?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{label}</span>
        {unit && <span style={{ fontSize: 10, color: "#9ca3af" }}>（{unit}）</span>}
      </div>
      {children}
    </div>
  );
}
