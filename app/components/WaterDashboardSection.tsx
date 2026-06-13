"use client";
// PR c94-B-1: 水道業態専用ダッシュボードセクション。
//
// 役割:
//   Dashboard.tsx の旧「指標一覧」(MetricsTable、フラット 22 row) を、
//   activeBusiness === 'water' の時のみ本コンポーネントに置換。
//   ElectricDashboardSection と同型 5 セクション構成で 5 業態 UI 統一。
//
// 構成 (Electric と 1:1 対応、⑤ のみ水道専用):
//   ① 新規対応・コスト・粗利 (7) — 売上 / 職人費 / 材料費 / 広告費 /
//                                   営業外注費 / カード手数料 / 粗利
//   ② 広告・効率指標 (8)        — 広告費率 / 入電件数 / 入電単価 / 獲得件数 /
//                                   CPA / 成約率 / 客単価 / 対応件数
//   ③ 施工 (6)                  — 工事件数 / 自社工事件数 / 自社工事比率 /
//                                   工事取得率 / 外注工事費 / 自社工事利益
//   ④ HELP 部門 (4)             — HELP売上 / HELP件数 / HELP客単価 / HELP率
//   ⑤ 水道専用 (5, full-width)  — 対応率 / リピート / 再訪問 / 口コミ / 車両数
//                                   (車両数は c94-C で ⑥ 体制 へ移動予定)
//
// データソース:
//   monthlySummary (raw 行): 既存 c90+ カラム全て (repeat_count/revisit_count/
//                            review_count/vehicle_count も c90 aggregation で書込済)
//   targets       : /api/targets fetch 済 (Dashboard.tsx で manToYen 適用済)
//
// 派生値:
//   粗利 = resolveTotalProfit (PR #51.2、Electric と同パターン)
//   対応率 = 対応件数 ÷ 入電件数 × 100 (⑤ で新規、旧 buildMetricRows から継承)

import React from "react";
import { yen, momLabel, type Targets, type SameDayAggregate } from "../lib/calculations";
import { resolveTotalProfit } from "../lib/profit";
import { MetricBadge, type GroupType } from "./ui";
import { getGroupBorderColor } from "./dashboard/metric-groups";
import { SECTION } from "./sectionStyles";
import ConsultantFeeBadge from "./ConsultantFeeBadge";

type Props = {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
  prevCalc: SameDayAggregate | null;
};

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const fmtCount = (v: number): string => (v > 0 ? `${v.toLocaleString()}件` : "—");
const fmtPct = (v: number): string => (v > 0 ? `${v.toFixed(1)}%` : "—");
const fmtYen = (v: number): string => (v > 0 ? yen(v) : "—");

export default function WaterDashboardSection({ monthlySummary, targets, prevCalc }: Props) {
  const p = prevCalc;
  // 売上・コスト
  const sales = numOf(monthlySummary?.total_revenue);
  const laborCost = numOf(monthlySummary?.total_labor_cost);
  const materialCost = numOf(monthlySummary?.material_cost);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.sales_outsourcing_cost);
  const cardFee = numOf(monthlySummary?.card_processing_fee);
  const profit = resolveTotalProfit(monthlySummary);

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const totalCount = numOf(monthlySummary?.total_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;
  const adRate = safeDiv(adCost, sales) * 100;
  const unitPrice = Math.round(safeDiv(sales, totalCount));

  // 施工 (Electric と完全同等、対応ベース c93-2)
  const constructionCount = numOf(monthlySummary?.construction_count);
  const internalConstructionCount = numOf(monthlySummary?.internal_construction_count);
  const constructionRate = safeDiv(constructionCount, totalCount) * 100;
  const internalConstructionRatio = safeDiv(internalConstructionCount, constructionCount) * 100;
  const outsourcedConstructionCost = numOf(monthlySummary?.outsourced_construction_cost);
  const internalConstructionProfit = numOf(monthlySummary?.internal_construction_profit);

  // HELP
  const helpRevenue = numOf(monthlySummary?.help_revenue);
  const helpCount = numOf(monthlySummary?.help_count);
  const helpUnitPrice = Math.round(safeDiv(helpRevenue, helpCount));
  const helpRate = safeDiv(helpRevenue, sales) * 100;

  // ⑤ 水道専用 (PR c94-B-1)
  //   - 対応率: 対応件数 ÷ 入電件数 (入電のうち何件対応できたか、旧 MetricsTable から継承)
  //   - repeat/revisit/review: monthly_summaries に c90 aggregation で書込済の SUM
  //   - 車両数: vehicle_count (現 MetricsTable line 1 から移植、c94-C で ⑥ 体制 へ)
  const responseRate = safeDiv(totalCount, callCount) * 100;
  const repeatCount = numOf(monthlySummary?.repeat_count);
  const revisitCount = numOf(monthlySummary?.revisit_count);
  const reviewCount = numOf(monthlySummary?.review_count);
  // ⑥ 体制 (PR c94-C-3a) — 車両数を ⑤ から移動、研修生を新規追加 (スナップショット)
  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);

  // 売上比% (UI 表示用)
  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  // 目標値 (Dashboard.tsx で manToYen 済、yen 系は再変換不要)
  const targetSales = numOf(targets.targetSales);
  const targetProfit = numOf(targets.targetProfit);
  const targetCount = numOf(targets.targetCount);
  const targetUnitPrice = numOf(targets.targetUnitPrice);
  const targetAdCost = numOf(targets.targetAdCost);
  const targetAdRate = numOf(targets.targetAdRate);
  const targetCallCount = numOf(targets.targetCallCount);
  const targetCpa = numOf(targets.targetCpa);
  const targetConstructionRate = numOf(targets.targetConstructionRate);
  const targetConvRate = numOf(targets.targetConversionRate);
  const targetHelpSales = numOf(targets.targetHelpSales);
  const targetHelpCount = numOf(targets.targetHelpCount);
  const targetHelpUnitPrice = numOf(targets.targetHelpUnitPrice);
  const targetHelpRate = numOf(targets.targetHelpRate);
  const targetVehicleCount = numOf(targets.targetVehicleCount);
  const targetTraineeCount = numOf(targets.targetTraineeCount);

  return (
    <section style={{ marginBottom: SECTION.MARGIN }}>
      <SectionLabel>水道業態 — フォーム連動 KPI 一覧 (5 セクション、業態統一)</SectionLabel>
      {/* PR c95-B-4b: コンサル費控除注記。yyyymm >= 202605 のみ表示 (過去月閲覧時は非表示)。
          monthlySummary.year/month を内部参照し、親 Dashboard.tsx の props 追加を回避。 */}
      <div style={{ marginBottom: SECTION.GAP }}>
        <ConsultantFeeBadge category="water" year={monthlySummary?.year as number | string | null | undefined} month={monthlySummary?.month as number | string | null | undefined} />
      </div>
      <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SECTION.GAP, gridAutoRows: "min-content" }}>
        {/* ① 新規対応・コスト・粗利 */}
        <Card title="① 新規対応・コスト・粗利" group="rev">
          <Row label="売上"         actual={fmtYen(sales)}        target={fmtYen(targetSales)}  achievement={achv(sales, targetSales)}
            mom={momLabel(sales, p?.total_revenue ?? 0, "yen")} />
          <Row label="職人費"       actual={fmtYen(laborCost)}    target="—" sub={`売上比 ${fmtPct(ratio(laborCost))}`}
            mom={momLabel(laborCost, p?.total_labor_cost ?? 0, "yen")} momInvert />
          <Row label="材料費"       actual={fmtYen(materialCost)} target="—" sub={`売上比 ${fmtPct(ratio(materialCost))}`}
            mom={momLabel(materialCost, p?.material_cost ?? 0, "yen")} momInvert />
          <Row label="広告費"       actual={fmtYen(adCost)}       target={fmtYen(targetAdCost)} achievement={achv(adCost, targetAdCost, true)} sub={`売上比 ${fmtPct(ratio(adCost))}`}
            mom={momLabel(adCost, p?.ad_cost ?? 0, "yen")} momInvert />
          <Row label="営業外注費"   actual={fmtYen(commission)}   target="—" sub={`売上比 ${fmtPct(ratio(commission))}`}
            mom={momLabel(commission, p?.sales_outsourcing_cost ?? 0, "yen")} momInvert />
          <Row label="カード手数料" actual={fmtYen(cardFee)}      target="—" sub={`売上比 ${fmtPct(ratio(cardFee))}`}
            mom={momLabel(cardFee, p?.card_processing_fee ?? 0, "yen")} momInvert />
          <Row label="粗利"         actual={fmtYen(profit)}       target={fmtYen(targetProfit)} achievement={achv(profit, targetProfit)} highlight
            mom={momLabel(profit, p?.total_profit ?? 0, "yen")} />
        </Card>

        {/* ② 広告・効率指標 */}
        <Card title="② 広告・効率指標" group="acq">
          <Row label="広告費率"  actual={fmtPct(adRate)}             target={fmtPct(targetAdRate)}     achievement={achv(adRate, targetAdRate, true)}
            mom={momLabel(adRate, p ? safeDiv(p.ad_cost, p.total_revenue) * 100 : 0, "pct")} momInvert />
          <Row label="入電件数"  actual={fmtCount(callCount)}        target={fmtCount(targetCallCount)} achievement={achv(callCount, targetCallCount)}
            mom={momLabel(callCount, p?.call_count ?? 0, "count")} />
          <Row label="入電単価"  actual={fmtYen(callUnitPrice)}      target="—" sub="= 広告費 ÷ 入電件数"
            mom={momLabel(callUnitPrice, p ? Math.round(safeDiv(p.ad_cost, p.call_count)) : 0, "yen")} momInvert />
          <Row label="獲得件数"  actual={fmtCount(acquisitionCount)} target={fmtCount(targetCount)}    achievement={achv(acquisitionCount, targetCount)}
            mom={momLabel(acquisitionCount, p?.acquisition_count ?? 0, "count")} />
          <Row label="CPA"       actual={fmtYen(cpa)}                target={fmtYen(targetCpa)}        achievement={achv(cpa, targetCpa, true)} sub="= 広告費 ÷ 獲得件数"
            mom={momLabel(cpa, p ? Math.round(safeDiv(p.ad_cost, p.acquisition_count)) : 0, "yen")} momInvert />
          <Row label="成約率"    actual={fmtPct(convRate)}           target={fmtPct(targetConvRate)}   achievement={achv(convRate, targetConvRate)} sub="= 獲得件数 ÷ 入電件数"
            mom={momLabel(convRate, p ? safeDiv(p.acquisition_count, p.call_count) * 100 : 0, "pct")} />
          <Row label="客単価"    actual={fmtYen(unitPrice)}          target={fmtYen(targetUnitPrice)}  achievement={achv(unitPrice, targetUnitPrice)} sub="= 売上 ÷ 対応件数"
            mom={momLabel(unitPrice, p ? Math.round(safeDiv(p.total_revenue, p.total_count)) : 0, "yen")} />
          <Row label="対応件数"  actual={fmtCount(totalCount)}       target={fmtCount(targetCount)}    achievement={achv(totalCount, targetCount)}
            mom={momLabel(totalCount, p?.total_count ?? 0, "count")} />
        </Card>

        {/* ③ 施工 */}
        <Card title="③ 施工" group="cnt">
          <Row label="工事件数"     actual={fmtCount(constructionCount)}         target="—" sub="対応1件 = 工事1件 (10万円以上)"
            mom={momLabel(constructionCount, p?.construction_count ?? 0, "count")} />
          <Row label="自社工事件数" actual={fmtCount(internalConstructionCount)} target="—" sub="うち会社内製化分 (営業マン自施工は除く)"
            mom={momLabel(internalConstructionCount, p?.internal_construction_count ?? 0, "count")} />
          <Row label="自社工事比率" actual={fmtPct(internalConstructionRatio)}   target="—" sub="= 自社工事件数 ÷ 工事件数 × 100"
            mom={momLabel(internalConstructionRatio, p ? safeDiv(p.internal_construction_count, p.construction_count) * 100 : 0, "pct")} />
          <Row label="工事取得率"   actual={fmtPct(constructionRate)}            target={fmtPct(targetConstructionRate)} achievement={achv(constructionRate, targetConstructionRate)} sub="= 工事件数 ÷ 対応件数"
            mom={momLabel(constructionRate, p ? safeDiv(p.construction_count, p.total_count) * 100 : 0, "pct")} />
          <Row label="外注工事費"   actual={fmtYen(outsourcedConstructionCost)}  target="—"
            mom={momLabel(outsourcedConstructionCost, p?.outsourced_construction_cost ?? 0, "yen")} momInvert />
          <Row label="自社工事利益" actual={fmtYen(internalConstructionProfit)}  target="—"
            mom={momLabel(internalConstructionProfit, p?.internal_construction_profit ?? 0, "yen")} />
        </Card>

        {/* ④ HELP */}
        <Card title="④ HELP 部門" group="help">
          <Row label="HELP 売上"   actual={fmtYen(helpRevenue)}   target={fmtYen(targetHelpSales)}    achievement={achv(helpRevenue, targetHelpSales)}
            mom={momLabel(helpRevenue, p?.help_revenue ?? 0, "yen")} />
          <Row label="HELP 件数"   actual={fmtCount(helpCount)}   target={fmtCount(targetHelpCount)}  achievement={achv(helpCount, targetHelpCount)}
            mom={momLabel(helpCount, p?.help_count ?? 0, "count")} />
          <Row label="HELP 客単価" actual={fmtYen(helpUnitPrice)} target={fmtYen(targetHelpUnitPrice)} achievement={achv(helpUnitPrice, targetHelpUnitPrice)} sub="= HELP売上 ÷ HELP件数"
            mom={momLabel(helpUnitPrice, p ? Math.round(safeDiv(p.help_revenue, p.help_count)) : 0, "yen")} />
          <Row label="HELP 率"     actual={fmtPct(helpRate)}      target={fmtPct(targetHelpRate)}      achievement={achv(helpRate, targetHelpRate)} sub="= HELP売上 ÷ 売上 × 100"
            mom={momLabel(helpRate, p ? safeDiv(p.help_revenue, p.total_revenue) * 100 : 0, "pct")} />
        </Card>

        {/* ⑤ 水道専用 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="⑤ 水道専用" group="cnt">
            <Row label="対応率"       actual={fmtPct(responseRate)}    target="—" sub="= 対応件数 ÷ 入電件数 × 100"
              mom={momLabel(responseRate, p ? safeDiv(p.total_count, p.call_count) * 100 : 0, "pct")} />
            <Row label="リピート件数" actual={fmtCount(repeatCount)}   target="—"
              mom={momLabel(repeatCount, p?.repeat_count ?? 0, "count")} />
            <Row label="再訪問件数"   actual={fmtCount(revisitCount)}  target="—"
              mom={momLabel(revisitCount, p?.revisit_count ?? 0, "count")} />
            <Row label="口コミ件数"   actual={fmtCount(reviewCount)}   target="—"
              mom={momLabel(reviewCount, p?.review_count ?? 0, "count")} />
          </Card>
        </div>

        {/* ⑥ 体制 — スナップショット型のため前月同日比は非表示 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="⑥ 体制" group="cnt">
            <Row label="車両数"           actual={vehicleCount > 0 ? `${vehicleCount}台` : "—"} target={targetVehicleCount > 0 ? `${targetVehicleCount}台` : "—"} achievement={achv(vehicleCount, targetVehicleCount)} />
            <Row label="研修生（営業マン）" actual={traineeCount > 0 ? `${traineeCount}人` : "—"} target={targetTraineeCount > 0 ? `${targetTraineeCount}人` : "—"} achievement={achv(traineeCount, targetTraineeCount)} />
          </Card>
        </div>
      </div>
    </section>
  );
}

// ===== UI 部品 (ElectricDashboardSection と完全同パターン、c94-B-1 では各業態 Section 重複コピー方針) =====
// 共通化は別 PR 候補 (AGENTS.md KNOWN_ISSUES §7 と同類の負債、Web Claude Q5=a 承認)

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: SECTION.HEADER_FONT_SIZE, fontWeight: SECTION.HEADER_FONT_WEIGHT, color: SECTION.HEADER_COLOR,
      textTransform: "uppercase", letterSpacing: "0.07em",
      marginBottom: 8, paddingLeft: 4,
    }}>{children}</div>
  );
}

function Card({ title, group, children }: { title: string; group: GroupType; children: React.ReactNode }) {
  const childrenWithGroup = React.Children.map(children, (child) =>
    React.isValidElement(child)
      ? React.cloneElement(child as React.ReactElement<{ group?: GroupType }>, { group })
      : child
  );
  return (
    <div style={{
      background: "#fff", borderRadius: 12,
      border: "1px solid #d1fae5", overflow: "hidden",
    }}>
      <div style={{
        background: "#ecfdf5", padding: `8px ${SECTION.PADDING_H}px`,
        borderBottom: "1px solid #d1fae5",
        fontSize: SECTION.HEADER_FONT_SIZE, fontWeight: SECTION.HEADER_FONT_WEIGHT, color: SECTION.HEADER_COLOR,
      }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "34%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "22%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#fafffe" }}>
            {["指標", "実績", "目標", "達成率", "前月同日比"].map((h, i) => (
              <th key={h} style={{
                padding: `7px ${SECTION.PADDING_H}px`, fontSize: 10, fontWeight: 700, color: "#6b7280",
                textTransform: "uppercase", letterSpacing: "0.06em",
                borderBottom: "1px solid #d1fae5",
                textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{childrenWithGroup}</tbody>
      </table>
    </div>
  );
}

function Row({
  label, actual, target, achievement, sub, highlight, group, mom, momInvert,
}: {
  label: string;
  actual: string;
  target: string;
  achievement?: { pct: number; status: "good" | "warn" | "bad" } | null;
  sub?: string;
  highlight?: boolean;
  group?: GroupType;
  mom?: string | null;      // momLabel() で生成した前月同日比文字列
  momInvert?: boolean;      // true = 低い方が良い指標（広告費・CPAなど）
}) {
  const td: React.CSSProperties = {
    padding: `9px ${SECTION.PADDING_H}px`, fontSize: 12, color: "#374151",
    borderBottom: "1px solid #f5faf5", whiteSpace: "nowrap",
  };
  const bg = highlight ? "#f0fdf4" : "transparent";
  const borderColor = group ? getGroupBorderColor(group) : "transparent";

  // mom の色: pct は "X% → Y%" 形式なので矢印なし、数値比較で上下を判定
  const momColor = mom
    ? (() => {
        let up: boolean;
        if (mom.includes("→")) {
          const parts = mom.split("→");
          up = parseFloat(parts[1]) >= parseFloat(parts[0]);
        } else {
          up = mom.startsWith("+");
        }
        const isGood = momInvert ? !up : up;
        return isGood ? "#059669" : "#dc2626";
      })()
    : "#9ca3af";

  return (
    <tr style={{ background: bg }}>
      <td style={{
        ...td, textAlign: "left", fontWeight: highlight ? 800 : 700,
        color: highlight ? "#065f46" : "#111",
        borderLeft: `3px solid ${borderColor}`,
      }}>
        <div style={{ whiteSpace: "nowrap" }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 400, whiteSpace: "normal", lineHeight: 1.4, marginTop: 2 }}>{sub}</div>}
      </td>
      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: highlight ? "#065f46" : "#111" }}>{actual}</td>
      <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>{target}</td>
      <td style={{ ...td, textAlign: "right" }}>
        {achievement ? (
          <MetricBadge
            color={achievement.status === "good" ? "green" : achievement.status === "warn" ? "yellow" : "red"}
            minWidth={false}
          >
            {achievement.pct.toFixed(1)}%
          </MetricBadge>
        ) : (
          <span style={{ color: "#d1d5db" }}>—</span>
        )}
      </td>
      <td style={{ ...td, textAlign: "right" }}>
        {mom ? (() => {
          let badge = mom;
          let sub: string | null = null;
          if (!mom.includes("→")) {
            const idx = mom.indexOf("%") + 1;
            badge = mom.slice(0, idx);
            sub = mom.slice(idx).trim() || null;
          }
          return (
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: momColor }}>{badge}</span>
              {sub && <span style={{ fontSize: 10, fontWeight: 400, color: momColor, opacity: 0.7 }}>{sub}</span>}
            </div>
          );
        })() : <span style={{ color: "#d1d5db" }}>—</span>}
      </td>
    </tr>
  );
}

function achv(actual: number, target: number, invert = false): { pct: number; status: "good" | "warn" | "bad" } | null {
  if (target <= 0 || actual <= 0) return null;
  const pct = (actual / target) * 100;
  let status: "good" | "warn" | "bad";
  if (invert) {
    status = pct <= 100 ? "good" : pct <= 120 ? "warn" : "bad";
  } else {
    status = pct >= 100 ? "good" : pct >= 80 ? "warn" : "bad";
  }
  return { pct, status };
}
