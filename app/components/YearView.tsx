"use client";
// 年次 (YTD) ビュー 実画面 (year-view スライス3)。
//
// 独立ページ /year としてマウントされる自己完結コンポーネント。
// 既存 Dashboard.tsx の14個の月固定 effect とは完全に分離 (本コンポーネントは
// useYearAggregate hook 1 本のみでデータ取得する) → race condition の温床を構造的に回避。
//
// 表示方針 (反専務 + Gemini レビュー確定):
//   - YTD 実績 (5月〜当月の合算、2026/4 以前は集計層でガード済)
//   - 達成ペース比 = YTD実績 ÷ 経過月の目標(当月は日割り按分) … ヒーローで明示
//   - 年間目標の絶対額を併記 (Section には fullYear 目標を渡す)
//   - 着地予測なし / 前年比なし (データ薄期は誤誘導になるため封印)
//   - 赤字は真の負値で表示 (粗利は集計層で 0 底打ちしない)

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRole, useSession } from "./RoleProvider";
import { hasPageAccess, type Role } from "../lib/permissions";
import { BUSINESSES, AREA_NAMES, type BusinessCategory } from "../lib/businesses";
import { COMPANIES } from "../lib/companies";
import { emptyTargets, yen, type Targets } from "../lib/calculations";
import { useYearAggregate, type YearScopePair } from "./useYearAggregate";
import type { YtdActuals } from "../lib/yearAggregation";
import WaterDashboardSection from "./WaterDashboardSection";
import ElectricDashboardSection from "./ElectricDashboardSection";
import LocksmithDashboardSection from "./LocksmithDashboardSection";
import RoadDashboardSection from "./RoadDashboardSection";
import DetectiveDashboardSection from "./DetectiveDashboardSection";

const GROUP = "__group__";
const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export default function YearView() {
  const role = useRole();
  const session = useSession();
  const canEditDashboard = role !== null && hasPageAccess({ role: role as Role }, "dashboard", "edit");

  const now = new Date();
  const currentYear = now.getFullYear();

  const [viewMode, setViewMode] = useState<"business" | "company">("business");
  const [activeBusiness, setActiveBusiness] = useState<BusinessCategory>("water");
  const [activeArea, setActiveArea] = useState<string>(GROUP);
  const [activeCompany, setActiveCompany] = useState<string>("__all__");
  const [viewYear, setViewYear] = useState<number>(currentYear);

  const businessAreas = useMemo(
    () => BUSINESSES.find((b) => b.id === activeBusiness)?.areas ?? [],
    [activeBusiness],
  );

  // ===== scope (業態×エリア) 集合の算出 =====
  const pairs = useMemo<YearScopePair[]>(() => {
    if (viewMode === "business") {
      if (activeArea === GROUP) {
        return businessAreas.map((areaId) => ({ category: activeBusiness, areaId }));
      }
      return [{ category: activeBusiness, areaId: activeArea }];
    }
    // company
    if (activeCompany === "__all__") {
      return COMPANIES.flatMap((c) => c.areas.map((a) => ({ category: a.category, areaId: a.areaId })));
    }
    const co = COMPANIES.find((c) => c.id === activeCompany);
    return co ? co.areas.map((a) => ({ category: a.category, areaId: a.areaId })) : [];
  }, [viewMode, activeBusiness, activeArea, businessAreas, activeCompany]);

  const { actuals, targets, loading } = useYearAggregate(pairs, viewYear, now);

  // ===== ヒーロー: scope 全業態合算 =====
  const totals = useMemo(() => {
    let revenue = 0, profit = 0, count = 0, adCost = 0;
    for (const cat of Object.keys(actuals) as BusinessCategory[]) {
      const a = actuals[cat]!;
      revenue += n(a.total_revenue);
      profit += n(a.total_profit); // 負値可
      count += n(a.total_count);
      adCost += n(a.ad_cost);
    }
    return {
      revenue, profit, count, adCost,
      unitPrice: count > 0 ? Math.round(revenue / count) : 0,
      profitRate: revenue > 0 ? (profit / revenue) * 100 : 0,
      adRate: revenue > 0 ? (adCost / revenue) * 100 : 0,
    };
  }, [actuals]);

  // 目標は「入力済み月の月次目標の合計」(fullYear)。月次画面の目標比と同じ流儀に統一 (D-013)。
  // pacing(当月日割り按分)は経営者に分かりにくいため不採用 (DECISIONS.md D-013)。
  const tgt = useMemo(() => {
    const sum = { fSales: 0, fProfit: 0, fCount: 0, fAd: 0 };
    for (const cat of Object.keys(targets) as BusinessCategory[]) {
      const t = targets[cat]!;
      sum.fSales += t.fullYear.targetSales; sum.fProfit += t.fullYear.targetProfit;
      sum.fCount += t.fullYear.targetCount; sum.fAd += t.fullYear.targetAdCost;
    }
    return sum;
  }, [targets]);

  const headerLabel = useMemo(() => {
    if (viewMode === "company") {
      if (activeCompany === "__all__") return "全社合計";
      return COMPANIES.find((c) => c.id === activeCompany)?.name ?? "";
    }
    const bizLabel = BUSINESSES.find((b) => b.id === activeBusiness)?.label ?? "";
    const areaLabel = activeArea === GROUP ? "全エリア" : (AREA_NAMES[activeArea] ?? activeArea);
    return `${bizLabel}・${areaLabel}`;
  }, [viewMode, activeCompany, activeBusiness, activeArea]);

  // Section レンダー (actuals の業態キーが存在するものだけ、fullYear 目標を渡す)
  const sectionProps = (cat: BusinessCategory): { monthlySummary: YtdActuals; targets: Targets; prevCalc: null } => ({
    monthlySummary: actuals[cat]!,
    targets: targets[cat]?.fullYear ?? emptyTargets(),
    prevCalc: null,
  });

  const tabBtn = (active: boolean) => ({
    padding: "8px 16px", borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700,
    cursor: "pointer", border: "none", whiteSpace: "nowrap" as const,
    background: active ? "rgba(255,255,255,0.18)" : "transparent",
    color: active ? "#fff" : "rgba(255,255,255,0.65)",
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-24">
      {/* ============ トップバー ============ */}
      <div style={{ background: "#064e3b", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px", height: 48 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.06em" }}>SIKKEN GROUP 経営OS</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* 月次 / 年次 トグル (月次は / へリンク = ルート遷移で完全分離) */}
          <div style={{ display: "flex", gap: 2, background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: 2 }}>
            <Link href="/" style={{ padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, textDecoration: "none", background: "transparent", color: "rgba(255,255,255,0.7)" }}>月次</Link>
            <span style={{ padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: "#fff", color: "#059669" }}>年次</span>
          </div>
          {canEditDashboard && (
            <div style={{ display: "flex", gap: 2, background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: 2 }}>
              <button type="button" onClick={() => setViewMode("business")} style={{ padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, border: "none", background: viewMode === "business" ? "#fff" : "transparent", color: viewMode === "business" ? "#059669" : "rgba(255,255,255,0.7)", cursor: "pointer" }}>事業別</button>
              <button type="button" onClick={() => setViewMode("company")} style={{ padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 700, border: "none", background: viewMode === "company" ? "#fff" : "transparent", color: viewMode === "company" ? "#059669" : "rgba(255,255,255,0.7)", cursor: "pointer" }}>会社別</button>
            </div>
          )}
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>年初来累計 (YTD)</span>
        </div>
      </div>

      {/* ============ グリーンヘッダー ============ */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        {viewMode === "business" && (
          <>
            <div style={{ display: "flex", gap: 4, padding: "8px 20px 0", overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              {BUSINESSES.map((b) => (
                <button key={b.id} type="button" onClick={() => { setActiveBusiness(b.id); setActiveArea(GROUP); }}
                  style={{ ...tabBtn(activeBusiness === b.id), padding: "6px 14px", fontSize: 11,
                    background: activeBusiness === b.id ? "rgba(255,255,255,0.25)" : "transparent",
                    color: activeBusiness === b.id ? "#fff" : "rgba(255,255,255,0.55)" }}>{b.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, padding: "6px 20px 0", overflowX: "auto" }}>
              <button type="button" onClick={() => setActiveArea(GROUP)} style={tabBtn(activeArea === GROUP)}>全エリア</button>
              {businessAreas.map((areaId) => (
                <button key={areaId} type="button" onClick={() => setActiveArea(areaId)} style={tabBtn(activeArea === areaId)}>{AREA_NAMES[areaId] ?? areaId}</button>
              ))}
            </div>
          </>
        )}
        {viewMode === "company" && (
          <div style={{ display: "flex", gap: 4, padding: "10px 20px 0", overflowX: "auto" }}>
            {[{ id: "__all__", name: "全社合計" }, ...COMPANIES.map((c) => ({ id: c.id, name: c.name }))].map((c) => (
              <button key={c.id} type="button" onClick={() => setActiveCompany(c.id)} style={tabBtn(activeCompany === c.id)}>{c.name}</button>
            ))}
          </div>
        )}

        {/* ヒーロー */}
        <div style={{ padding: "14px 20px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <button type="button" onClick={() => setViewYear((y) => y - 1)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 14 }}>◀</button>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{viewYear}年</span>
            <button type="button" onClick={() => setViewYear((y) => Math.min(currentYear, y + 1))} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 14 }}>▶</button>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{headerLabel}</h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
            {viewYear}年 年初来累計（5月〜）{loading ? " ｜ 読込中…" : ""}
            <br />目標 = 月次目標管理で入力済みの月の合計（未入力の月は含まない）
          </p>

          {/* ヒーロー KPI: YTD実績 / 目標比 / 目標(入力済み月の合計)。月次画面と同じ目標比の流儀 (D-013) */}
          <div className="kpi-grid-5" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 12 }}>
            <HeroCard label="売上" actual={yen(totals.revenue)} ratio={ratio(totals.revenue, tgt.fSales)} target={tgt.fSales > 0 ? yen(tgt.fSales) : "—"} />
            <HeroCard label="粗利" actual={yen(totals.profit)} sub={`粗利率 ${totals.profitRate.toFixed(1)}%`} ratio={ratio(totals.profit, tgt.fProfit)} target={tgt.fProfit > 0 ? yen(tgt.fProfit) : "—"} negative={totals.profit < 0} />
            <HeroCard label="対応件数" actual={`${totals.count.toLocaleString("ja-JP")}件`} ratio={ratio(totals.count, tgt.fCount)} target={tgt.fCount > 0 ? `${tgt.fCount.toLocaleString("ja-JP")}件` : "—"} />
            <HeroCard label="客単価" actual={yen(totals.unitPrice)} ratio={ratio(totals.unitPrice, tgt.fCount > 0 ? Math.round(tgt.fSales / tgt.fCount) : 0)} target={tgt.fCount > 0 ? yen(Math.round(tgt.fSales / tgt.fCount)) : "—"} />
            <HeroCard label="広告費" actual={yen(totals.adCost)} sub={`広告費率 ${totals.adRate.toFixed(1)}%`} ratio={ratio(totals.adCost, tgt.fAd)} target={tgt.fAd > 0 ? yen(tgt.fAd) : "—"} />
          </div>
        </div>
      </div>

      {/* ============ 業態別セクション (actuals に存在する業態のみ、fullYear 目標) ============ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 32, padding: "20px", paddingBottom: 48 }}>
        {Object.keys(actuals).length === 0 && !loading && (
          <p style={{ color: "#6b7280", fontSize: 14, textAlign: "center", padding: 40 }}>この範囲・年に集計対象のデータがありません（2026年5月以降のデータが対象です）。</p>
        )}
        {actuals.water && <WaterDashboardSection {...sectionProps("water")} />}
        {actuals.electric && <ElectricDashboardSection {...sectionProps("electric")} />}
        {actuals.locksmith && <LocksmithDashboardSection {...sectionProps("locksmith")} />}
        {actuals.road && <RoadDashboardSection {...sectionProps("road")} />}
        {actuals.detective && <DetectiveDashboardSection {...sectionProps("detective")} />}
      </div>
    </div>
  );
}

/** 目標比 (YTD実績 ÷ 入力済み月の目標合計) を色付き文字列で返す。月次画面の目標比と同じ流儀 (D-013)。 */
function ratio(actual: number, target: number): { text: string; color: string } | null {
  if (target <= 0) return null;
  const r = (actual / target) * 100;
  const color = r >= 100 ? "#a7f3d0" : r >= 70 ? "#fde68a" : "#fca5a5";
  return { text: `${r.toFixed(1)}%`, color };
}

function HeroCard(props: {
  label: string; actual: string; sub?: string;
  ratio?: { text: string; color: string } | null; target: string; negative?: boolean;
}) {
  return (
    <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{props.label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: props.negative ? "#fca5a5" : "#fff", marginTop: 2, whiteSpace: "nowrap" }}>{props.actual}</div>
      {props.sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>{props.sub}</div>}
      {props.ratio && (
        <div style={{ fontSize: 11, fontWeight: 700, color: props.ratio.color, marginTop: 4 }}>目標比 {props.ratio.text}</div>
      )}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2, whiteSpace: "nowrap" }}>目標 {props.target}</div>
    </div>
  );
}
