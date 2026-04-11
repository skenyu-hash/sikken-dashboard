"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateBreakeven, calculateDashboard, getDaysInMonth,
  type DailyEntry, type DashboardSummary, type FixedCosts, yen,
} from "../lib/calculations";
import { useRole } from "../components/RoleProvider";
import { BUSINESSES, type BusinessCategory } from "../lib/businesses";

const ALL_AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type CostItem = { id: string; name: string; amount: number; color: string };
const COLORS = ["#3b82f6", "#0891b2", "#d97706", "#059669", "#8b5cf6", "#ec4899", "#6b7280", "#dc2626"];

type AreaBreakeven = {
  areaId: string; areaName: string;
  revenue: number; profitRate: number; fixedCost: number;
  breakevenRevenue: number; achievementRate: number;
  remainingCount: number; dailyRequired: number;
};

export default function BreakevenPage() {
  const role = useRole();
  const canEdit = role === "admin";
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>("water");
  const businessAreas = useMemo(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (!biz) return ALL_AREAS;
    return biz.areas.map(id => ALL_AREAS.find(a => a.id === id)).filter(Boolean) as typeof ALL_AREAS;
  }, [activeBusiness]);

  const [areaId, setAreaId] = useState(ALL_AREAS[0].id);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [fixed, setFixed] = useState<FixedCosts>({ laborCost: 0, rent: 0, other: 0 });
  const [saving, setSaving] = useState(false);
  const [monthlySummary, setMonthlySummary] = useState<Record<string, unknown> | null>(null);
  const [costItems, setCostItems] = useState<CostItem[]>([
    { id: "1", name: "人件費", amount: 0, color: "#3b82f6" },
    { id: "2", name: "家賃・リース", amount: 0, color: "#0891b2" },
    { id: "3", name: "その他", amount: 0, color: "#6b7280" },
  ]);
  const [areaBreakevens, setAreaBreakevens] = useState<AreaBreakeven[]>([]);

  // 事業切替時にエリアリセット
  useEffect(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (biz && !biz.areas.includes(areaId)) {
      setAreaId(biz.areas[0]);
    }
  }, [activeBusiness, areaId]);

  // 選択エリアのデータ取得
  useEffect(() => {
    Promise.all([
      fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}&category=${activeBusiness}`),
      fetch(`/api/monthly-summary?area=${areaId}&year=${year}&month=${month}&category=${activeBusiness}`),
      fetch(`/api/fixed-costs?area=${areaId}&year=${year}&month=${month}`),
    ]).then(async ([eRes, sRes, fRes]) => {
      const eJson = eRes.ok ? await eRes.json() : { entries: [] };
      const sJson = sRes.ok ? await sRes.json() : { summary: null };
      const fJson = fRes.ok ? await fRes.json() : { fixedCosts: { laborCost: 0, rent: 0, other: 0 } };

      setEntries(eJson.entries ?? []);
      setMonthlySummary(sJson.summary ?? null);
      setFixed(fJson.fixedCosts);

      const fc = fJson.fixedCosts as FixedCosts;
      setCostItems([
        { id: "1", name: "人件費", amount: fc.laborCost || 0, color: "#3b82f6" },
        { id: "2", name: "家賃・リース", amount: fc.rent || 0, color: "#0891b2" },
        { id: "3", name: "その他", amount: fc.other || 0, color: "#6b7280" },
      ]);
    });
  }, [areaId, year, month, activeBusiness]);

  // 全エリア達成状況取得
  useEffect(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const daysElapsed = now.getDate();
    const remainingDays = daysInMonth - daysElapsed;

    Promise.all(businessAreas.map(async (area) => {
      const [eRes, sRes, fRes] = await Promise.all([
        fetch(`/api/entries?area=${area.id}&year=${year}&month=${month}&category=${activeBusiness}`),
        fetch(`/api/monthly-summary?area=${area.id}&year=${year}&month=${month}&category=${activeBusiness}`),
        fetch(`/api/fixed-costs?area=${area.id}&year=${year}&month=${month}`),
      ]);
      const eJson = eRes.ok ? await eRes.json() : { entries: [] };
      const sJson = sRes.ok ? await sRes.json() : { summary: null };
      const fJson = fRes.ok ? await fRes.json() : { fixedCosts: { laborCost: 0, rent: 0, other: 0 } };

      const s = calculateDashboard(eJson.entries ?? [], year, month, now);
      const ms = sJson.summary;
      const revenue = ms ? Number(ms.total_revenue ?? 0) : s.totalRevenue;
      const profit = ms ? Number(ms.total_profit ?? 0) : s.totalProfit;
      const count = ms ? Number(ms.total_count ?? 0) : s.totalCount;
      const unitPrice = ms ? Number(ms.unit_price ?? 0) : s.companyUnitPrice;

      const profitRate = revenue > 0 ? profit / revenue * 100 : 0;
      const fc = fJson.fixedCosts as FixedCosts;
      const fixedCost = (fc.laborCost || 0) + (fc.rent || 0) + (fc.other || 0);
      const breakevenRevenue = profitRate > 0 ? Math.round(fixedCost / (profitRate / 100)) : 0;
      const achievementRate = breakevenRevenue > 0 ? Math.round(revenue / breakevenRevenue * 1000) / 10 : 0;
      const remainingRevenue = Math.max(0, breakevenRevenue - revenue);
      const remainingCount = unitPrice > 0 ? Math.ceil(remainingRevenue / unitPrice) : 0;
      const dailyRequired = remainingDays > 0 ? remainingCount / remainingDays : 0;

      return { areaId: area.id, areaName: area.name, revenue, profitRate, fixedCost, breakevenRevenue, achievementRate, remainingCount, dailyRequired };
    })).then(setAreaBreakevens);
  }, [year, month, businessAreas, activeBusiness]); // eslint-disable-line react-hooks/exhaustive-deps

  const rawSummary = useMemo(
    () => calculateDashboard(entries, year, month, now),
    [entries, year, month] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // displaySummary: monthly_summariesがある場合はその値を使用
  const displayRevenue = monthlySummary ? Number(monthlySummary.total_revenue ?? 0) : rawSummary.totalRevenue;
  const displayProfit = monthlySummary ? Number(monthlySummary.total_profit ?? 0) : rawSummary.totalProfit;
  const displayCount = monthlySummary ? Number(monthlySummary.total_count ?? 0) : rawSummary.totalCount;
  const displayUnitPrice = monthlySummary ? Number(monthlySummary.unit_price ?? 0) : rawSummary.companyUnitPrice;
  const displayGrossMargin = displayRevenue > 0 ? displayProfit / displayRevenue * 100 : 0;

  // displaySummary をベースにBE計算
  const displaySummary: DashboardSummary = useMemo(() => {
    if (!monthlySummary) return rawSummary;
    const dim = getDaysInMonth(year, month);
    return { ...rawSummary, totalRevenue: displayRevenue, totalProfit: displayProfit, totalCount: displayCount,
      companyUnitPrice: displayUnitPrice, grossMargin: displayGrossMargin, daysElapsed: dim, daysInMonth: dim };
  }, [rawSummary, monthlySummary, displayRevenue, displayProfit, displayCount, displayUnitPrice, displayGrossMargin, year, month]);

  const totalFixed = costItems.reduce((s, c) => s + c.amount, 0);

  const fixedForCalc: FixedCosts = useMemo(
    () => ({ laborCost: 0, rent: 0, other: totalFixed }),
    [totalFixed]
  );
  const be = useMemo(() => calculateBreakeven(fixedForCalc, displaySummary), [fixedForCalc, displaySummary]);

  const addItem = () => {
    const nextColor = COLORS[costItems.length % COLORS.length];
    setCostItems(prev => [...prev, { id: Date.now().toString(), name: "新規項目", amount: 0, color: nextColor }]);
  };
  const removeItem = (id: string) => setCostItems(prev => prev.filter(c => c.id !== id));
  const updateItem = (id: string, field: "name" | "amount", value: string | number) => {
    setCostItems(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };
  const cycleColor = (id: string) => {
    setCostItems(prev => prev.map(c => {
      if (c.id !== id) return c;
      const idx = COLORS.indexOf(c.color);
      return { ...c, color: COLORS[(idx + 1) % COLORS.length] };
    }));
  };

  async function save() {
    setSaving(true);
    const fixedCosts: FixedCosts = { laborCost: 0, rent: 0, other: totalFixed };
    await fetch("/api/fixed-costs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ areaId, year, month, fixedCosts }),
    });
    setFixed(fixedCosts);
    setSaving(false);
  }

  const achievementBadge = (pct: number) => {
    if (pct >= 100) return { bg: "#d1fae5", color: "#064e3b" };
    if (pct >= 80) return { bg: "#fef9c3", color: "#713f12" };
    return { bg: "#fee2e2", color: "#7f1d1d" };
  };
  const ab = achievementBadge(be.achievementPct);

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        {/* 事業タブ */}
        <div style={{ display: "flex", gap: 4, padding: "8px 24px 0", overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          {BUSINESSES.map((b) => (
            <button key={b.id} type="button" onClick={() => setActiveBusiness(b.id)}
              style={{
                padding: "5px 12px", borderRadius: "6px 6px 0 0",
                fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                background: activeBusiness === b.id ? "rgba(255,255,255,0.25)" : "transparent",
                color: activeBusiness === b.id ? "#fff" : "rgba(255,255,255,0.55)",
                whiteSpace: "nowrap",
              }}>
              {b.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 24px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>損益分岐エンジン</h1>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
                {BUSINESSES.find(b => b.id === activeBusiness)?.label} ／ {year}年{month}月 ／ 固定費から達成必要件数を逆算
              </p>
            </div>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)}
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)",
                color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700 }}>
              {businessAreas.map((a) => <option key={a.id} value={a.id} style={{ color: "#111" }}>{a.name}エリア</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ボディ */}
      <div style={{ padding: "16px 20px" }}>
        {/* 中段：2カラム */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* 左：固定費入力 */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
            <div style={{ background: "#ecfdf5", padding: "10px 14px", borderBottom: "1px solid #d1fae5",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>固定費入力</span>
              {canEdit && (
                <button onClick={addItem} style={{ fontSize: 11, fontWeight: 700, background: "#059669", color: "#fff",
                  border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>+ 追加</button>
              )}
            </div>
            {costItems.map((item) => {
              const pct = totalFixed > 0 ? Math.round(item.amount / totalFixed * 100) : 0;
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid #f0faf0" }}>
                  <div onClick={() => cycleColor(item.id)} style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, cursor: "pointer", flexShrink: 0 }} />
                  <input value={item.name} onChange={e => updateItem(item.id, "name", e.target.value)} disabled={!canEdit}
                    style={{ flex: 1, border: "none", outline: "none", fontSize: 12, fontWeight: 600, color: "#111", background: "transparent", minWidth: 0 }} />
                  <span style={{ fontSize: 10, color: "#9ca3af", minWidth: 28, textAlign: "right" }}>{pct}%</span>
                  <input type="number" value={item.amount || ""} onChange={e => updateItem(item.id, "amount", Number(e.target.value))}
                    disabled={!canEdit} placeholder="0"
                    style={{ width: 90, height: 28, border: "1px solid #d1fae5", borderRadius: 5, padding: "0 6px", fontSize: 11, fontWeight: 600, textAlign: "right" }} />
                  {canEdit && costItems.length > 1 && (
                    <button onClick={() => removeItem(item.id)} style={{ fontSize: 11, color: "#d1d5db", background: "none", border: "none", cursor: "pointer", padding: "0 2px" }}>✕</button>
                  )}
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f0fdf4", borderTop: "1px solid #d1fae5" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#065f46" }}>合計</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#065f46" }}>&yen;{totalFixed.toLocaleString()}</span>
            </div>
            {canEdit && (
              <div style={{ padding: "10px 14px", borderTop: "1px solid #f0faf0" }}>
                <button onClick={save} disabled={saving}
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "none",
                    background: "#059669", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "保存中..." : "固定費を保存"}
                </button>
              </div>
            )}
            {!canEdit && <p style={{ padding: "10px 14px", fontSize: 11, color: "#9ca3af", textAlign: "center" }}>固定費の編集は役員のみ可能です</p>}
          </div>

          {/* 右：損益分岐結果 + 現状サマリー */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* 損益分岐 自動算出 */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
              <div style={{ background: "#ecfdf5", padding: "10px 14px", borderBottom: "1px solid #d1fae5" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>損益分岐 自動算出</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                {[
                  { label: "固定費合計", value: yen(be.fixedTotal) },
                  { label: "現在の粗利率", value: `${be.grossMarginPct.toFixed(1)}%` },
                  { label: "損益分岐売上", value: yen(be.breakevenSales), hl: true },
                  { label: "損益分岐件数", value: `${be.breakevenCount}件`, hl: true },
                ].map((item, i) => (
                  <div key={i} style={{ padding: "12px 14px",
                    borderBottom: i < 2 ? "1px solid #f0faf0" : "none",
                    borderRight: i % 2 === 0 ? "1px solid #f0faf0" : "none" }}>
                    <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: item.hl ? 18 : 16, fontWeight: 800, color: item.hl ? "#059669" : "#111" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* 現状サマリー */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
              <div style={{ background: "#ecfdf5", padding: "9px 14px", borderBottom: "1px solid #d1fae5",
                fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                現状サマリー
              </div>
              {/* 達成率バー */}
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #f0faf0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>損益分岐達成率</span>
                  <span style={{ fontSize: 20, fontWeight: 800,
                    color: be.achievementPct >= 100 ? "#059669" : be.achievementPct >= 80 ? "#d97706" : "#dc2626" }}>
                    {be.achievementPct.toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: 8, borderRadius: 4, width: `${Math.min(be.achievementPct, 100)}%`,
                    background: be.achievementPct >= 100 ? "#059669" : be.achievementPct >= 80 ? "#d97706" : "#dc2626",
                    transition: "width 0.3s" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                {[
                  { label: "残営業日数", value: `${be.remainingDays}日` },
                  { label: "残必要件数", value: be.remainingCount <= 0 ? "達成済" : `${be.remainingCount}件`,
                    color: be.remainingCount <= 0 ? "#059669" : "#dc2626" },
                  { label: "1日あたり必要", value: be.perDayCount <= 0 ? "達成済" : `${be.perDayCount.toFixed(1)}件`,
                    color: be.perDayCount <= 0 ? "#059669" : "#374151" },
                  { label: "現在の売上", value: yen(displayRevenue) },
                  { label: "現在の粗利", value: yen(displayProfit) },
                  { label: "客単価", value: yen(displayUnitPrice) },
                ].map((item, i) => (
                  <div key={i} style={{ padding: "10px 14px",
                    borderBottom: i < 4 ? "1px solid #f0faf0" : "none",
                    borderRight: i % 2 === 0 ? "1px solid #f0faf0" : "none" }}>
                    <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: (item as { color?: string }).color ?? "#111" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* エリア別損益分岐達成状況 */}
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase",
          letterSpacing: "0.1em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          エリア別 損益分岐達成状況
          <div style={{ flex: 1, height: 1, background: "#d1fae5" }} />
        </div>
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "10%" }} /><col style={{ width: "13%" }} /><col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} /><col style={{ width: "11%" }} /><col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#ecfdf5" }}>
                {["エリア", "売上", "粗利率", "固定費", "損益分岐売上", "達成率", "残必要件数", "1日あたり", "状態"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", fontSize: 9, fontWeight: 700, color: "#6b7280",
                    textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #d1fae5",
                    textAlign: h === "エリア" ? "left" : "right", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areaBreakevens.map((ab) => {
                const isAbove = ab.achievementRate >= 100;
                const isNear = ab.achievementRate >= 80;
                return (
                  <tr key={ab.areaId} style={{ borderBottom: "1px solid #f0faf0" }}>
                    <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, color: "#111" }}>{ab.areaName}</td>
                    <td style={{ padding: "9px 10px", fontSize: 11, textAlign: "right", color: "#111" }}>
                      {ab.revenue > 0 ? yen(ab.revenue) : <span style={{ color: "#d1d5db" }}>未入力</span>}
                    </td>
                    <td style={{ padding: "9px 10px", fontSize: 11, textAlign: "right",
                      color: ab.profitRate >= 25 ? "#059669" : ab.profitRate >= 15 ? "#d97706" : "#dc2626" }}>
                      {ab.revenue > 0 ? `${ab.profitRate.toFixed(1)}%` : "\u2014"}
                    </td>
                    <td style={{ padding: "9px 10px", fontSize: 11, textAlign: "right", color: "#374151" }}>
                      {ab.fixedCost > 0 ? yen(ab.fixedCost) : <span style={{ color: "#d1d5db" }}>未設定</span>}
                    </td>
                    <td style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700, textAlign: "right", color: "#374151" }}>
                      {ab.breakevenRevenue > 0 ? yen(ab.breakevenRevenue) : "\u2014"}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>
                      {ab.achievementRate > 0 ? (
                        <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px",
                          background: isAbove ? "#d1fae5" : isNear ? "#fef9c3" : "#fee2e2",
                          color: isAbove ? "#065f46" : isNear ? "#854d0e" : "#991b1b" }}>
                          {ab.achievementRate.toFixed(1)}%
                        </span>
                      ) : <span style={{ color: "#d1d5db", fontSize: 10 }}>{"\u2014"}</span>}
                    </td>
                    <td style={{ padding: "9px 10px", fontSize: 11, textAlign: "right", fontWeight: 700,
                      color: ab.remainingCount <= 0 ? "#059669" : "#dc2626" }}>
                      {ab.remainingCount > 0 ? `${ab.remainingCount}件` : "達成済"}
                    </td>
                    <td style={{ padding: "9px 10px", fontSize: 11, textAlign: "right", color: "#374151" }}>
                      {ab.dailyRequired > 0 ? `${ab.dailyRequired.toFixed(1)}件` : <span style={{ color: "#059669" }}>達成済</span>}
                    </td>
                    <td style={{ padding: "9px 10px", textAlign: "right" }}>
                      <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "2px 7px",
                        background: isAbove ? "#d1fae5" : isNear ? "#fef9c3" : "#fee2e2",
                        color: isAbove ? "#065f46" : isNear ? "#854d0e" : "#991b1b" }}>
                        {isAbove ? "達成" : isNear ? "接近" : "未達"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BERow({ label, value, big, highlight }: { label: string; value: string; big?: boolean; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f5faf5" }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{label}</span>
      <span style={{ fontSize: big ? 20 : 13, fontWeight: 800, color: highlight ? "#059669" : "#111" }}>{value}</span>
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
