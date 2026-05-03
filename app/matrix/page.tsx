"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BUSINESSES, type BusinessCategory } from "../lib/businesses";
import { useRole } from "../components/RoleProvider";
import { canViewAdminPages } from "../lib/roles";
import CrossMatrixSection from "../components/CrossMatrixSection";
import AsOfBadge from "../components/AsOfBadge";

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
  const isAdmin = role !== null && canViewAdminPages(role);
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
  const [asOfDay, setAsOfDay] = useState<number | null>(null);
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
      // カテゴリ切替時に前カテゴリの値が引き継がれるバグ防止のため
      // データ取得結果に関わらず、まずデフォルト値を起点にし、有効な値があれば上書きする
      let nextProfit = 25;
      let nextAd = 20;
      if (s) {
        setCurrentRevenue(Number(s.total_revenue ?? 0));
        const pr = Number(s.profit_rate ?? 0);
        if (pr > 0) nextProfit = pr;
        const ar = Number(s.ad_rate ?? 0);
        if (ar > 0) nextAd = ar;
        const aod = Number(s.as_of_day);
        setAsOfDay(Number.isInteger(aod) ? aod : null);
      } else {
        setCurrentRevenue(0);
        setAsOfDay(null);
      }
      setProfitRatePct(nextProfit);
      setAdRatePct(nextAd);
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

  // 行（売上）: 着地予測と現在実績をカバー、動的刻み
  // 〜1億(10,000万) は 100万刻み、1億超は 500万刻み、上限 1.5億(15,000万)
  const ROW_UPPER_CAP = 15000; // 1.5億
  const SWITCH_POINT = 10000;  // 1億で刻み切替
  const rowsMan = useMemo(() => {
    const points = [forecastRevenueMan, currentRevenueMan].filter(v => v > 0);
    let minMan: number;
    if (points.length === 0) {
      minMan = 500;
    } else {
      const lowest = Math.min(...points);
      minMan = Math.max(100, Math.round((lowest * 0.5) / 100) * 100);
    }
    // 上限は常に 1.5億（鍵カテゴリの売上規模を視野に入れるため、データに関わらず固定）
    const maxMan = ROW_UPPER_CAP;
    const list: number[] = [];
    // 〜1億: 100万刻み
    const denseEnd = Math.min(maxMan, SWITCH_POINT);
    for (let v = minMan; v <= denseEnd; v += 100) list.push(v);
    // 1億超: 500万刻み（10,500万から）
    if (maxMan > SWITCH_POINT) {
      for (let v = SWITCH_POINT + 500; v <= maxMan; v += 500) list.push(v);
    }
    return list;
  }, [forecastRevenueMan, currentRevenueMan]);

  // 列（広告費率）: 13〜45% を1%刻み（鍵カテゴリ44.9%視野）
  const cols = useMemo(() => {
    const list: number[] = [];
    for (let v = 13; v <= 45; v++) list.push(v);
    return list;
  }, []);

  // 鍵カテゴリ選択時のみ44.9%相当列（45%）を強調
  const isKeyBusiness = activeBusiness === "locksmith";
  const KEY_HIGHLIGHT_COL = 45; // 44.9%は45列に丸める

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

  // セル判定: 戻り値 { label, sub, bg, color }
  // 行×列が最大 33 × 100 = 3,300 セルになるため、行単位でメモ化する
  type CellResult = { label: string; sub: string; bg: string; color: string };
  function cellStatus(salesMan: number, adRate: number): CellResult {
    const profitMan = salesMan * (profitRatePct / 100);
    const adCostMan = salesMan * (adRate / 100);
    const plMan = profitMan - adCostMan - fixedCostMan;
    const cfMan = plMan - cfExtraMan;
    const displayVal = fixedCostMan > 0 ? cfMan : plMan;
    const sign = displayVal >= 0 ? "+" : "";
    const sub = `${sign}${Math.round(displayVal).toLocaleString()}万`;
    if (cfMan >= 0) return { label: "CF黒", sub, bg: "#d1fae5", color: "#065f46" };
    if (plMan >= 0) return { label: "PL黒", sub, bg: "#fef9c3", color: "#854d0e" };
    return { label: "赤字", sub, bg: "#fee2e2", color: "#991b1b" };
  }

  // 全セルを事前計算しメモ化（パラメータ変更時のみ再計算）
  const cellMatrix = useMemo<CellResult[][]>(
    () => rowsMan.map(salesMan => cols.map(adRate => cellStatus(salesMan, adRate))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowsMan, cols, profitRatePct, fixedCostMan, cfExtraMan]
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
    {/* グループ全体クロス比較（上段・新規） */}
        <div style={{ padding: "16px" }}>
          <CrossMatrixSection />
        </div>  
{/* ヘッダー: タイトル + エリア選択 + カテゴリタブ（融合デザイン） */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          padding: "24px 28px",
          marginBottom: 24,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 600,
                color: "#111827",
                letterSpacing: "-0.01em",
              }}
            >
              損益分岐マトリクス
            </h1>
            <div style={{ margin: "6px 0 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#6B7280" }}>
                {BUSINESSES.find((b) => b.id === activeBusiness)?.label} ・ {year}年{month}月 ・ 着地予測と現在実績の2軸で経営判断
              </span>
              {asOfDay != null && <AsOfBadge asOfDays={[asOfDay]} month={month} />}
            </div>
          </div>
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            style={{
              background: "#FFFFFF",
              border: "1px solid #E5E7EB",
              color: "#111827",
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {businessAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
          {BUSINESSES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBusiness(b.id)}
              style={{
                padding: "6px 14px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                border: "none",
                background: activeBusiness === b.id ? "#1B5E3F" : "transparent",
                color: activeBusiness === b.id ? "#FFFFFF" : "#6B7280",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "20px 20px" }}>
        {/* パラメータ入力カード */}
        <div style={{
          background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB",
          padding: 20, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#065f46", marginBottom: 14,
            textTransform: "uppercase", letterSpacing: "0.08em" }}>
            パラメータ
          </div>
          {/* 入力フィールド: admin のみ固定費・CF追加費用を表示 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isAdmin ? "repeat(4, 1fr)" : "repeat(2, 1fr)",
            gap: 14, marginBottom: 16,
          }}>
            {isAdmin && (
              <>
                <ParamField icon="🏢" label="固定費" unit="万円" value={fixedCostMan}
                  onChange={setFixedCostMan} hint="自動取得・編集可" />
                <ParamField icon="💰" label="CF追加費用" unit="万円" value={cfExtraMan}
                  onChange={setCfExtraMan} hint="借入返済・設備投資等" />
              </>
            )}
            <ParamField icon="📈" label="現在の粗利率" unit="%" value={profitRatePct}
              onChange={setProfitRatePct} step="0.1" hint="自動取得・編集可" />
            <ParamField icon="📢" label="現在の広告費率" unit="%" value={adRatePct}
              onChange={setAdRatePct} step="0.1" hint="📍📌のX軸位置（自動・固定）" readOnly />
          </div>

          {/* KPI数値カード: admin は4枚（売上2 + BEP2）、非admin は2枚（売上のみ） */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isAdmin ? "repeat(4, 1fr)" : "repeat(2, 1fr)",
            gap: 12, paddingTop: 14, borderTop: "1px solid #ecfdf5",
          }}>
            <KpiCard label="📍 月末着地予測売上"
              value={forecastRevenueMan > 0 ? forecastRevenueMan.toLocaleString() : "—"}
              unit={forecastRevenueMan > 0 ? "万" : ""}
              accentColor="#059669" />
            <KpiCard label="📌 現在実績売上"
              value={currentRevenueMan > 0 ? currentRevenueMan.toLocaleString() : "—"}
              unit={currentRevenueMan > 0 ? "万" : ""}
              accentColor="#f59e0b" />
            {isAdmin && (
              <>
                <KpiCard label="PL BEP"
                  value={plBep !== null ? plBep.toLocaleString()
                    : marginPct <= 0 ? "計算不可"
                    : "—"}
                  unit={plBep !== null ? "万" : ""}
                  accentColor="#059669" />
                <KpiCard label="CF BEP"
                  value={cfBep !== null ? cfBep.toLocaleString()
                    : marginPct <= 0 ? "計算不可"
                    : "—"}
                  unit={cfBep !== null ? "万" : ""}
                  accentColor="#3b82f6" />
              </>
            )}
          </div>
          {isAdmin && marginPct <= 0 && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#fee2e2", color: "#991b1b",
              fontSize: 11, fontWeight: 700, borderRadius: 6 }}>
              ⚠ 粗利率（{profitRatePct}%）が広告費率（{adRatePct}%）以下のため BEP が計算できません
            </div>
          )}
          {isAdmin && marginPct > 0 && fixedCostMan <= 0 && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#fef9c3", color: "#854d0e",
              fontSize: 11, fontWeight: 700, borderRadius: 6 }}>
              💡 固定費が未設定です。上のフィールドに手動入力すると BEP が表示されます
            </div>
          )}
        </div>

        {/* 凡例バー */}
        <div style={{
          marginBottom: 12, padding: "10px 14px", background: "#fff", borderRadius: 10,
          border: "1px solid #E5E7EB", display: "flex", gap: 10, flexWrap: "wrap",
          fontSize: 11, alignItems: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}>
          <span style={{ color: "#6b7280", fontWeight: 800, marginRight: 4 }}>凡例:</span>
          <span style={{
            background: "#d1fae5", color: "#065f46",
            padding: "5px 14px", borderRadius: 20, fontWeight: 700,
          }}>CF黒字</span>
          <span style={{
            background: "#fef9c3", color: "#854d0e",
            padding: "5px 14px", borderRadius: 20, fontWeight: 700,
          }}>PL黒字</span>
          <span style={{
            background: "#fee2e2", color: "#991b1b",
            padding: "5px 14px", borderRadius: 20, fontWeight: 700,
          }}>赤字</span>
          <span style={{
            background: "#fff", color: "#059669",
            padding: "5px 14px", borderRadius: 20, fontWeight: 700,
            border: "2px solid #059669",
          }}>📍 着地予測</span>
          <span style={{
            background: "#fff", color: "#b45309",
            padding: "5px 14px", borderRadius: 20, fontWeight: 700,
            border: "2px solid #f59e0b",
          }}>📌 現在実績</span>
          {isKeyBusiness && (
            <span style={{
              background: "#fff7ed", color: "#7c2d12",
              padding: "5px 14px", borderRadius: 20, fontWeight: 700,
              border: "2px solid #f59e0b",
            }}>🔑 鍵カテゴリ実績帯（広告比率 44.9%）</span>
          )}
        </div>

        {/* マトリクステーブル */}
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 12,
            background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB" }}>
            データを読み込み中...
          </div>
        ) : (
          <div ref={scrollerRef} style={{
            background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB",
            overflow: "auto", maxHeight: "70vh",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}>
            <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{
                    padding: "10px 10px", fontSize: 11, fontWeight: 800, color: "#fff",
                    background: "#064e3b",
                    borderBottom: "1px solid #064e3b", borderRight: "1px solid #065f46",
                    position: "sticky", top: 0, left: 0, zIndex: 3, minWidth: 100, textAlign: "center",
                  }}>
                    売上＼広告費率
                  </th>
                  {cols.map((c, ci) => {
                    const isKeyCol = isKeyBusiness && c === KEY_HIGHLIGHT_COL;
                    const isPinCol = ci === pinColIdx;
                    return (
                      <th key={c} style={{
                        padding: "10px 6px", fontSize: 11, fontWeight: 800,
                        color: isKeyCol ? "#fde68a" : isPinCol ? "#a7f3d0" : "#fff",
                        background: isKeyCol ? "#7c2d12" : isPinCol ? "#065f46" : "#064e3b",
                        borderBottom: "1px solid #064e3b", borderRight: "1px solid #065f46",
                        position: "sticky", top: 0, zIndex: 2, minWidth: 64, textAlign: "center",
                        whiteSpace: "nowrap",
                      }}>
                        {isKeyCol ? `🔑 ${c}%` : `${c}%`}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rowsMan.map((salesMan, ri) => (
                  <tr key={salesMan}>
                    <th style={{
                      padding: "6px 10px", fontSize: 11, fontWeight: 600,
                      color: ri === forecastRowIdx ? "#065f46"
                        : ri === actualRowIdx ? "#b45309"
                        : "#374151",
                      background: ri === forecastRowIdx ? "#d1fae5"
                        : ri === actualRowIdx ? "#fef3c7"
                        : "#f0fdf4",
                      borderRight: "1px solid #d1fae5", borderBottom: "1px solid #ecfdf5",
                      position: "sticky", left: 0, zIndex: 1, textAlign: "right", whiteSpace: "nowrap",
                    }}>
                      {salesMan.toLocaleString()}万
                    </th>
                    {cols.map((adRate, ci) => {
                      const status = cellMatrix[ri][ci];
                      const isForecast = ri === forecastRowIdx && ci === pinColIdx;
                      const isActual = ri === actualRowIdx && ci === pinColIdx;
                      const isKeyCol = isKeyBusiness && adRate === KEY_HIGHLIGHT_COL;
                      // 着地と現在が同じセルに重なる場合 → 緑枠優先（着地を主役にスクロール対象にする）
                      let pinPrefix = "";
                      if (isForecast && isActual) pinPrefix = "📍📌";
                      else if (isForecast) pinPrefix = "📍";
                      else if (isActual) pinPrefix = "📌";
                      // 通常: 非常に薄いボーダー / ピン: box-shadow で強調
                      const isPin = isForecast || isActual;
                      const pinShadow = isForecast
                        ? "0 0 0 2px #059669, 0 2px 6px rgba(5,150,105,0.35)"
                        : isActual
                        ? "0 0 0 2px #f59e0b, 0 2px 6px rgba(245,158,11,0.35)"
                        : undefined;
                      return (
                        <td
                          key={adRate}
                          ref={isForecast ? forecastCellRef : undefined}
                          style={{
                            padding: "6px 8px", fontSize: 11, fontWeight: 700,
                            background: status.bg, color: status.color, textAlign: "center",
                            borderRight: isKeyCol ? "2px solid #f59e0b" : "1px solid #f0faf0",
                            borderLeft: isKeyCol ? "2px solid #f59e0b" : undefined,
                            borderBottom: "1px solid #f5faf5",
                            boxShadow: pinShadow,
                            position: isPin ? "relative" : undefined,
                            zIndex: isPin ? 1 : undefined,
                            whiteSpace: "nowrap",
                          }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                            <span style={{ fontSize: 10, fontWeight: 800 }}>{pinPrefix ? `${pinPrefix} ` : ""}{status.label}</span>
                            <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.8 }}>{status.sub}</span>
                          </div>
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

function ParamField({ icon, label, unit, value, onChange, step = "1", hint, readOnly }: {
  icon?: string; label: string; unit: string; value: number; onChange: (v: number) => void;
  step?: string; hint?: string; readOnly?: boolean;
}) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 11, color: "#374151", fontWeight: 700, marginBottom: 6,
        display: "flex", alignItems: "center", gap: 6 }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        <span>{label}</span>
        <span style={{ color: "#9ca3af", fontWeight: 500, fontSize: 10 }}>（{unit}）</span>
      </div>
      <input
        type="number" step={step} value={value || ""}
        onChange={(e) => !readOnly && onChange(parseFloat(e.target.value) || 0)}
        readOnly={readOnly}
        placeholder="0"
        style={{
          width: "100%", height: 38, border: "1px solid #E5E7EB", borderRadius: 8,
          padding: "0 12px", fontSize: 14, fontWeight: 700, textAlign: "right",
          color: readOnly ? "#6b7280" : "#111",
          background: readOnly ? "#f3f4f6" : "#fff",
          cursor: readOnly ? "not-allowed" : "auto",
          outline: "none",
        }}
      />
      {hint && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

function KpiCard({ label, value, unit, accentColor }: {
  label: string; value: string; unit: string; accentColor: string;
}) {
  return (
    <div style={{
      padding: "12px 16px", background: "#fff", borderRadius: 10,
      borderLeft: `4px solid ${accentColor}`,
      border: "1px solid #ecfdf5",
      borderLeftWidth: 4,
    }}>
      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 800, color: accentColor, lineHeight: 1.1,
        display: "flex", alignItems: "baseline", gap: 3,
      }}>
        <span>{value}</span>
        {unit && <span style={{ fontSize: 13, fontWeight: 700 }}>{unit}</span>}
      </div>
    </div>
  );
}
