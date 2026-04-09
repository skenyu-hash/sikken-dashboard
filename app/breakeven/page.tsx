"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateBreakeven, calculateDashboard, type DailyEntry, type FixedCosts, yen,
} from "../lib/calculations";
import { useRole } from "../components/RoleProvider";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

const SECTION_TITLE_STYLE: React.CSSProperties = {
  background: "#ecfdf5", padding: "8px 14px",
  fontSize: 11, fontWeight: 700, color: "#065f46",
  textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: "1px solid #d1fae5",
};
const CARD_STYLE: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden",
};

export default function BreakevenPage() {
  const role = useRole();
  const canEdit = role === "admin";
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [areaId, setAreaId] = useState(AREAS[0].id);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [fixed, setFixed] = useState<FixedCosts>({ laborCost: 0, rent: 0, other: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((j: { entries: DailyEntry[] }) => setEntries(j.entries ?? []));
    fetch(`/api/fixed-costs?area=${areaId}&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { fixedCosts: { laborCost: 0, rent: 0, other: 0 } }))
      .then((j: { fixedCosts: FixedCosts }) => setFixed(j.fixedCosts));
  }, [areaId, year, month]);

  const summary = useMemo(
    () => calculateDashboard(entries, year, month, now),
    [entries, year, month] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const be = useMemo(() => calculateBreakeven(fixed, summary), [fixed, summary]);

  // 万円<->円
  const setManField = (k: keyof FixedCosts, raw: string) => {
    const n = Number(raw.replace(/[^0-9.]/g, "")) || 0;
    setFixed((f) => ({ ...f, [k]: Math.round(n * 10000) }));
  };
  const dispMan = (k: keyof FixedCosts) => (fixed[k] ? String(fixed[k] / 10000) : "");

  async function save() {
    setSaving(true);
    await fetch("/api/fixed-costs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ areaId, year, month, fixedCosts: fixed }),
    });
    setSaving(false);
  }

  const fixedFields: { key: keyof FixedCosts; label: string; color: string }[] = [
    { key: "laborCost", label: "人件費", color: "#d97706" },
    { key: "rent", label: "家賃", color: "#3b82f6" },
    { key: "other", label: "その他固定費", color: "#9ca3af" },
  ];

  const achievementBadge = (pct: number) => {
    if (pct >= 100) return { bg: "#d1fae5", color: "#064e3b" };
    if (pct >= 80) return { bg: "#fef9c3", color: "#713f12" };
    return { bg: "#fee2e2", color: "#7f1d1d" };
  };
  const ab = achievementBadge(be.achievementPct);

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)", padding: "16px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>損益分岐エンジン</h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
              {year}年{month}月 ／ 固定費から達成必要件数を逆算
            </p>
          </div>
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)",
              color: "#fff", borderRadius: 8, padding: "6px 12px",
              fontSize: 13, fontWeight: 700,
            }}
          >
            {AREAS.map((a) => <option key={a.id} value={a.id} style={{ color: "#111" }}>{a.name}エリア</option>)}
          </select>
        </div>
      </div>

      {/* ボディ */}
      <div style={{ padding: "16px 20px" }}>
        {/* 上段: 2列 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          {/* 固定費入力 */}
          <div style={CARD_STYLE}>
            <div style={SECTION_TITLE_STYLE}>固定費 (月次)</div>
            <div style={{ padding: "6px 14px 12px" }}>
              {fixedFields.map((f) => (
                <div key={f.key}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 0", borderBottom: "1px solid #f5faf5" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 3, height: 14, borderRadius: 1, background: f.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{f.label}</span>
                    <span style={{ fontSize: 10, color: "#9ca3af" }}>（万円）</span>
                  </div>
                  <input
                    type="text" inputMode="decimal" disabled={!canEdit}
                    value={dispMan(f.key)}
                    onChange={(e) => setManField(f.key, e.target.value)}
                    placeholder="0"
                    style={{
                      width: 120, height: 32,
                      border: "1px solid #d1fae5", borderRadius: 6,
                      padding: "0 10px", fontSize: 12, fontWeight: 600,
                      textAlign: "right", color: "#111", background: "#fff",
                      outline: "none", opacity: canEdit ? 1 : 0.6,
                    }}
                  />
                </div>
              ))}
              {canEdit ? (
                <button onClick={save} disabled={saving}
                  style={{
                    marginTop: 12, width: "100%", height: 40,
                    background: "#059669", color: "#fff", border: "none",
                    borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: "pointer", opacity: saving ? 0.6 : 1,
                  }}>
                  {saving ? "保存中..." : "固定費を保存"}
                </button>
              ) : (
                <p style={{ marginTop: 12, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
                  固定費の編集は役員のみ可能です
                </p>
              )}
            </div>
          </div>

          {/* 損益分岐 自動算出 */}
          <div style={CARD_STYLE}>
            <div style={SECTION_TITLE_STYLE}>損益分岐 自動算出</div>
            <div style={{ padding: "6px 14px 10px" }}>
              <BERow label="固定費合計" value={yen(be.fixedTotal)} />
              <BERow label="現在の粗利率" value={`${be.grossMarginPct.toFixed(1)}%`} />
              <BERow label="損益分岐売上" value={yen(be.breakevenSales)} big highlight />
              <BERow label="損益分岐件数" value={`${be.breakevenCount} 件`} big highlight />
              <BERow label="残必要件数" value={`${be.remainingCount} 件`} />
              <BERow label="1日あたり必要" value={`${be.perDayCount.toFixed(1)} 件`} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5faf5" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>達成率</span>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  borderRadius: 4, padding: "2px 7px",
                  background: ab.bg, color: ab.color,
                }}>
                  {be.achievementPct.toFixed(1)}%
                </span>
              </div>
              <BERow label="残営業日数" value={`${be.remainingDays} 日`} />
            </div>
          </div>
        </div>

        {/* 下段: 現状サマリー 4枚 */}
        <div style={CARD_STYLE}>
          <div style={SECTION_TITLE_STYLE}>現状サマリー</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: 14, gap: 12 }}>
            <SummaryCard label="現在の売上" value={yen(summary.totalRevenue)} color="#059669" />
            <SummaryCard label="現在の粗利" value={yen(summary.totalProfit)} color="#059669" />
            <SummaryCard label="現在の件数" value={`${summary.totalCount} 件`} color="#3b82f6" />
            <SummaryCard label="現在の客単価" value={yen(summary.companyUnitPrice)} color="#3b82f6" />
          </div>
        </div>
      </div>
    </div>
  );
}

function BERow({ label, value, big, highlight }: { label: string; value: string; big?: boolean; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5faf5" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{label}</span>
      <span style={{
        fontSize: big ? 20 : 13, fontWeight: 800,
        color: highlight ? "#059669" : "#111",
      }}>{value}</span>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
      <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#111", marginTop: 2 }}>{value}</div>
    </div>
  );
}
