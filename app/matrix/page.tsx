"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BUSINESSES, type BusinessCategory } from "../lib/businesses";
import { useRole } from "../components/RoleProvider";

const ALL_AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export default function MatrixPage() {
  const role = useRole();
  const isAdmin = role === "admin";

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysInMonth = getDaysInMonth(year, month);
  const daysElapsed = Math.max(1, now.getDate());

  const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>("water");
  const businessAreas = useMemo(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (!biz) return ALL_AREAS;
    return biz.areas.map(id => ALL_AREAS.find(a => a.id === id)).filter(Boolean) as typeof ALL_AREAS;
  }, [activeBusiness]);

  const [areaId, setAreaId] = useState<string>("kansai");

  // 事業切替時にエリアリセット
  useEffect(() => {
    const biz = BUSINESSES.find(b => b.id === activeBusiness);
    if (biz && !biz.areas.includes(areaId)) {
      setAreaId(biz.areas[0]);
    }
  }, [activeBusiness, areaId]);

  // 取得データ
  const [currentRevenue, setCurrentRevenue] = useState(0); // 円
  const [profitRatePct, setProfitRatePct] = useState(25); // %（手動編集可）
  const [adRatePct, setAdRatePct] = useState(20); // %（読み取り専用・自動取得）
  const [fixedCostMan, setFixedCostMan] = useState(0); // 万円（admin編集可）
  const [cfExtraMan, setCfExtraMan] = useState(0); // 万円（admin編集可）
  const [loading, setLoading] = useState(false);

  // monthly-summary + fixed-costs を取得
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/monthly-summary?area=${areaId}&year=${year}&month=${month}&category=${activeBusiness}`)
        .then(r => r.ok ? r.json() : { summary: null }),
      fetch(`/api/fixed-costs?area=${areaId}&year=${year}&month=${month}`)
        .then(r => r.ok ? r.json() : {}),
    ]).then(([sumRes, fcRes]) => {
      const s = sumRes.summary;
      if (s) {
        setCurrentRevenue(Number(s.total_revenue ?? 0));
        const pr = Number(s.profit_rate ?? 0);
        if (pr > 0) setProfitRatePct(pr);
        const ar = Number(s.ad_rate ?? 0);
        // 広告費率は自動取得（読み取り専用）。データがない場合はデフォルト20%のまま
        if (ar > 0) setAdRatePct(ar);
      } else {
        setCurrentRevenue(0);
      }
      // 固定費レスポンスは { fixedCosts: { laborCost, rent, other } } または
      // { costs: { labor_cost, rent, other } } の両形式をサポート
      const fcAny = fcRes as Record<string, unknown>;
      const fc: Record<string, unknown> = ((fcAny?.fixedCosts ?? fcAny?.costs ?? {}) as Record<string, unknown>);
      const labor = Number(fc.laborCost ?? fc.labor_cost ?? 0) || 0;
      const rent = Number(fc.rent ?? 0) || 0;
      const other = Number(fc.other ?? 0) || 0;
      const total = labor + rent + other;
      setFixedCostMan(total > 0 ? Math.round(total / 10000) : 0);
      setLoading(false);
    });
  }, [areaId, year, month, activeBusiness]);

  // 月末着地予測（円）
  const forecastRevenue = useMemo(
    () => currentRevenue > 0 ? Math.round(currentRevenue / daysElapsed * daysInMonth) : 0,
    [currentRevenue, daysElapsed, daysInMonth]
  );
  const forecastRevenueMan = Math.round(forecastRevenue / 10000);
  const currentRevenueMan = Math.round(currentRevenue / 10000);

  // 行（売上）: 着地予測と現在実績の両方をカバーする範囲、100万円刻み
  const rowsMan = useMemo(() => {
    const points = [forecastRevenueMan, currentRevenueMan].filter(v => v > 0);
    if (points.length === 0) {
      const list: number[] = [];
      for (let v = 500; v <= 2000; v += 100) list.push(v);
      return list;
    }
    const lowest = Math.min(...points);
    const highest = Math.max(...points);
    const minMan = Math.max(100, Math.round((lowest * 0.5) / 100) * 100);
    const maxMan = Math.max(minMan + 1000, Math.round((highest * 2.0) / 100) * 100);
    const list: number[] = [];
    for (let v = minMan; v <= maxMan; v += 100) list.push(v);
    return list;
  }, [forecastRevenueMan, currentRevenueMan]);

  // 列（広告費率）: 10〜35% を1%刻み
  const cols = useMemo(() => {
    const list: number[] = [];
    for (let v = 10; v <= 35; v++) list.push(v);
    return list;
  }, []);

  // BEP計算: 分母 = 粗利率 - 広告費率（ポイント）。0以下なら計算不可
  const marginPct = profitRatePct - adRatePct;
  const plBep = (marginPct > 0 && fixedCostMan > 0)
    ? Math.round(fixedCostMan / (marginPct / 100))
    : null;
  const cfBep = (marginPct > 0 && (fixedCostMan + cfExtraMan) > 0)
    ? Math.round((fixedCostMan + cfExtraMan) / (marginPct / 100))
    : null;

  // ピン位置を計算するヘルパー: 値に最も近い行/列インデックスを返す
  function nearestIndex(values: number[], target: number): number {
    if (target <= 0) return -1;
    let best = -1, bestDiff = Infinity;
    values.forEach((v, i) => {
      const d = Math.abs(v - target);
      if (d < bestDiff) { bestDiff = d; best = i; }
    });
    return best;
  }

  // 📍 着地予測ピン
  const forecastRowIdx = useMemo(
    () => nearestIndex(rowsMan, forecastRevenueMan),
    [rowsMan, forecastRevenueMan]
  );
  // 📌 現在実績ピン
  const actualRowIdx = useMemo(
    () => nearestIndex(rowsMan, currentRevenueMan),
    [rowsMan, currentRevenueMan]
  );
  // 両ピンの列（同じ広告費率列）
  const pinColIdx = useMemo(
    () => nearestIndex(cols, adRatePct),
    [cols, adRatePct]
  );

  // 自動スクロール: 着地予測ピンを中央へ
  const scrollerRef = useRef<HTMLDivElement>(null);
  const forecastCellRef = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    if (loading) return;
    if (!forecastCellRef.current || !scrollerRef.current) return;
    const cell = forecastCellRef.current;
    const scroller = scrollerRef.current;
    const offsetLeft = cell.offsetLeft - scroller.clientWidth / 2 + cell.offsetWidth / 2;
    const offsetTop = cell.offsetTop - scroller.clientHeight / 2 + cell.offsetHeight / 2;
    scroller.scrollTo({ left: Math.max(0, offsetLeft), top: Math.max(0, offsetTop), behavior: "smooth" });
  }, [loading, forecastRowIdx, actualRowIdx, pinColIdx]);

  // セル判定: 戻り値 { label, bg, color }
  function cellStatus(salesMan: number, adRate: number) {
    const profitMan = salesMan * (profitRatePct / 100);
    const adCostMan = salesMan * (adRate / 100);
    const plMan = profitMan - adCostMan - fixedCostMan;
    const cfMan = plMan - cfExtraMan;
    if (cfMan >= 0) return { label: "✔CF黒", bg: "#d1fae5", color: "#065f46" };
    if (plMan >= 0) return { label: "●PL黒", bg: "#fef9c3", color: "#854d0e" };
    return { label: "●赤字", bg: "#fee2e2", color: "#991b1b" };
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
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
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>損益分岐マトリクス</h1>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
                {BUSINESSES.find(b => b.id === activeBusiness)?.label} ／ {year}年{month}月 ／ 📍着地予測（月末換算）と 📌現在実績の2軸で経営判断
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

      <div style={{ padding: "16px 20px" }}>
        {/* パラメータ入力 */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: "0.07em" }}>
            パラメータ
          </div>
          {/* 入力フィールド: admin のみ固定費・CF追加費用を表示 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isAdmin ? "repeat(4, 1fr)" : "repeat(2, 1fr)",
            gap: 12, marginBottom: 12,
          }}>
            {isAdmin && (
              <>
                <ParamField label="固定費" unit="万円" value={fixedCostMan}
                  onChange={setFixedCostMan} hint="自動取得・編集可" />
                <ParamField label="CF追加費用" unit="万円" value={cfExtraMan}
                  onChange={setCfExtraMan} hint="借入返済・設備投資等" />
              </>
            )}
            <ParamField label="現在の粗利率" unit="%" value={profitRatePct}
              onChange={setProfitRatePct} step="0.1" hint="自動取得・編集可" />
            <ParamField label="現在の広告費率" unit="%" value={adRatePct}
              onChange={setAdRatePct} step="0.1" hint="📍📌のX軸位置（自動・固定）" readOnly />
          </div>

          {/* BEP & 売上カード: admin は4枚（売上2 + BEP2）、非admin は2枚（売上のみ） */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isAdmin ? "repeat(4, 1fr)" : "repeat(2, 1fr)",
            gap: 12, paddingTop: 12, borderTop: "1px solid #f0faf0",
          }}>
            <BepCard label="📍 月末着地予測売上"
              value={forecastRevenueMan > 0 ? `${forecastRevenueMan.toLocaleString()}万` : "—"}
              color="#059669" />
            <BepCard label="📌 現在実績売上"
              value={currentRevenueMan > 0 ? `${currentRevenueMan.toLocaleString()}万` : "—"}
              color="#f59e0b" />
            {isAdmin && (
              <>
                <BepCard
                  label="PL BEP"
                  value={plBep !== null ? `${plBep.toLocaleString()}万`
                    : marginPct <= 0 ? "計算不可"
                    : "—"}
                  color="#854d0e"
                />
                <BepCard
                  label="CF BEP"
                  value={cfBep !== null ? `${cfBep.toLocaleString()}万`
                    : marginPct <= 0 ? "計算不可"
                    : "—"}
                  color="#065f46"
                />
              </>
            )}
          </div>
          {isAdmin && marginPct <= 0 && (
            <div style={{ marginTop: 10, padding: "6px 10px", background: "#fee2e2", color: "#991b1b",
              fontSize: 10, fontWeight: 700, borderRadius: 4 }}>
              ⚠ 粗利率（{profitRatePct}%）が広告費率（{adRatePct}%）以下のため BEP が計算できません
            </div>
          )}
          {isAdmin && marginPct > 0 && fixedCostMan <= 0 && (
            <div style={{ marginTop: 10, padding: "6px 10px", background: "#fef9c3", color: "#854d0e",
              fontSize: 10, fontWeight: 700, borderRadius: 4 }}>
              💡 固定費が未設定です。上のフィールドに手動入力すると BEP が表示されます
            </div>
          )}
        </div>

        {/* 凡例 */}
        <div style={{ marginBottom: 10, padding: "8px 12px", background: "#fff", borderRadius: 8,
          border: "1px solid #d1fae5", display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, alignItems: "center" }}>
          <span style={{ color: "#6b7280", fontWeight: 700 }}>凡例:</span>
          <span style={{ background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: 3, fontWeight: 700 }}>✔CF黒字ゾーン</span>
          <span style={{ background: "#fef9c3", color: "#854d0e", padding: "2px 8px", borderRadius: 3, fontWeight: 700 }}>●PL黒字ゾーン</span>
          <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 3, fontWeight: 700 }}>●赤字ゾーン</span>
          <span style={{ border: "3px solid #059669", padding: "0px 6px", borderRadius: 3, color: "#059669", fontWeight: 700 }}>📍 月末着地予測</span>
          <span style={{ border: "3px solid #f59e0b", padding: "0px 6px", borderRadius: 3, color: "#b45309", fontWeight: 700 }}>📌 現在実績</span>
        </div>

        {/* マトリクステーブル */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 12,
            background: "#fff", borderRadius: 12, border: "1px solid #d1fae5" }}>
            データを読み込み中...
          </div>
        ) : (
          <div ref={scrollerRef} style={{
            background: "#fff", borderRadius: 12, border: "1px solid #d1fae5",
            overflow: "auto", maxHeight: "70vh",
          }}>
            <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{
                    padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#065f46",
                    background: "#ecfdf5", borderBottom: "1px solid #d1fae5", borderRight: "1px solid #d1fae5",
                    position: "sticky", top: 0, left: 0, zIndex: 3, minWidth: 90, textAlign: "center",
                  }}>
                    売上＼広告費率
                  </th>
                  {cols.map((c, ci) => (
                    <th key={c} style={{
                      padding: "6px 6px", fontSize: 10, fontWeight: 700,
                      color: ci === pinColIdx ? "#065f46" : "#6b7280",
                      background: ci === pinColIdx ? "#d1fae5" : "#ecfdf5",
                      borderBottom: "1px solid #d1fae5", borderRight: "1px solid #f0faf0",
                      position: "sticky", top: 0, zIndex: 2, minWidth: 60, textAlign: "center",
                      whiteSpace: "nowrap",
                    }}>
                      {c}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsMan.map((salesMan, ri) => (
                  <tr key={salesMan}>
                    <th style={{
                      padding: "4px 8px", fontSize: 10, fontWeight: 700,
                      color: ri === forecastRowIdx ? "#065f46"
                        : ri === actualRowIdx ? "#b45309"
                        : "#374151",
                      background: ri === forecastRowIdx ? "#d1fae5"
                        : ri === actualRowIdx ? "#fef3c7"
                        : "#fff",
                      borderRight: "1px solid #d1fae5", borderBottom: "1px solid #f5faf5",
                      position: "sticky", left: 0, zIndex: 1, textAlign: "right", whiteSpace: "nowrap",
                    }}>
                      {salesMan.toLocaleString()}万
                    </th>
                    {cols.map((adRate, ci) => {
                      const status = cellStatus(salesMan, adRate);
                      const isForecast = ri === forecastRowIdx && ci === pinColIdx;
                      const isActual = ri === actualRowIdx && ci === pinColIdx;
                      // 着地と現在が同じセルに重なる場合 → 緑枠優先（着地を主役にスクロール対象にする）
                      // ピン両方のときは prefix を 📍📌、片方なら片方のみ
                      let pinPrefix = "";
                      if (isForecast && isActual) pinPrefix = "📍📌";
                      else if (isForecast) pinPrefix = "📍";
                      else if (isActual) pinPrefix = "📌";
                      const border = isForecast
                        ? "3px solid #059669"
                        : isActual
                        ? "3px solid #f59e0b"
                        : undefined;
                      return (
                        <td
                          key={adRate}
                          ref={isForecast ? forecastCellRef : undefined}
                          style={{
                            padding: "4px 6px", fontSize: 10, fontWeight: 700,
                            background: status.bg, color: status.color, textAlign: "center",
                            borderRight: "1px solid #f0faf0", borderBottom: "1px solid #f5faf5",
                            border,
                            whiteSpace: "nowrap",
                          }}>
                          {pinPrefix ? `${pinPrefix}${status.label}` : status.label}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 10, color: "#9ca3af" }}>
          ※ 粗利 = 売上 × 粗利率、広告費 = 売上 × 広告費率、PL = 粗利 − 広告費 − 固定費、CF = PL − CF追加費用
        </div>
      </div>
    </div>
  );
}

function ParamField({ label, unit, value, onChange, step = "1", hint, readOnly }: {
  label: string; unit: string; value: number; onChange: (v: number) => void;
  step?: string; hint?: string; readOnly?: boolean;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, marginBottom: 4 }}>
        {label} <span style={{ color: "#9ca3af", fontWeight: 400 }}>（{unit}）</span>
      </div>
      <input
        type="number" step={step} value={value || ""}
        onChange={(e) => !readOnly && onChange(parseFloat(e.target.value) || 0)}
        readOnly={readOnly}
        placeholder="0"
        style={{
          width: "100%", height: 34, border: "1px solid #d1fae5", borderRadius: 6,
          padding: "0 10px", fontSize: 13, fontWeight: 700, textAlign: "right",
          color: readOnly ? "#6b7280" : "#111",
          background: readOnly ? "#f3f4f6" : "#fff",
          cursor: readOnly ? "not-allowed" : "auto",
        }}
      />
      {hint && <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>{hint}</div>}
    </label>
  );
}

function BepCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ padding: "8px 12px", background: "#f8fdf8", borderRadius: 6, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}
