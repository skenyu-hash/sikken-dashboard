"use client";
// PR #52 c3 + PR #58c: ロード業態専用ダッシュボードセクション。
//
// 役割:
//   Dashboard.tsx の「全 17 項目 指標一覧」を、activeBusiness === 'road' の
//   時のみ本コンポーネントに置換する。RoadForm の入力項目と 1:1 対応した
//   3 セクション表示 (フォーム ⇄ ダッシュボード 双方向確認可能)。
//
// 構成 (RoadForm と同構造):
//   ① 新規対応 — 売上 / 保険売上 / 無保険売上 / 広告費 / 手数料 / 販管費 / 粗利
//   ② 入電    — 7 内訳 + 総入電件数 / 入電単価 (PR #58c で DB 化)
//   ③ 獲得    — 7 内訳 (広告/リピート/紹介/再訪問/ウェルネスト/SEO/保険会社)
//                + 総獲得件数 / 客単価 / CPA / 成約率
//
// データソース:
//   monthlySummary (raw 行): 業態固有の DB 列を直接読む (road_*)
//   targets       : /api/targets から取得済 (Dashboard.tsx で fetch、manToYen 適用済)
//
// 派生値:
//   粗利     = 売上 − 広告費 − 手数料  (RoadForm と同式、販管費は記録のみで式に含めない)
//   CPA      = 広告費 ÷ 総獲得件数
//   成約率   = 総獲得件数 ÷ 総入電件数 × 100

import React from "react";
import { yen, momLabel, type Targets, type SameDayAggregate } from "../lib/calculations";
import { MetricBadge, type GroupType } from "./ui";
import { getGroupBorderColor } from "./dashboard/metric-groups";
import { SECTION } from "./sectionStyles";

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

export default function RoadDashboardSection({ monthlySummary, targets, prevCalc }: Props) {
  const p = prevCalc;
  // 売上・コスト
  const sales = numOf(monthlySummary?.total_revenue);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.sales_outsourcing_cost);
  const profit = sales - adCost - commission;

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;

  // 獲得 7 内訳 (PR #52 で永続化)
  const acqAd = numOf(monthlySummary?.road_ad_count);
  const acqRepeat = numOf(monthlySummary?.road_repeat_count);
  const acqReferral = numOf(monthlySummary?.road_referral_count);
  const acqRevisit = numOf(monthlySummary?.road_revisit_count);
  const acqWellnest = numOf(monthlySummary?.road_wellnest_count);
  const acqSeo = numOf(monthlySummary?.road_seo_count);
  const acqInsurance = numOf(monthlySummary?.road_insurance_count);

  // PR #58c: 入電 7 内訳 + 保険売上 2 分割 + 販管費 (Phase B 完結)
  const callAd = numOf(monthlySummary?.road_ad_call_count);
  const callRepeat = numOf(monthlySummary?.road_repeat_call_count);
  const callReferral = numOf(monthlySummary?.road_referral_call_count);
  const callRevisit = numOf(monthlySummary?.road_revisit_call_count);
  const callWellnest = numOf(monthlySummary?.road_wellnest_call_count);
  const callSeo = numOf(monthlySummary?.road_seo_call_count);
  const callInsurance = numOf(monthlySummary?.road_insurance_call_count);
  const insuranceRevenue = numOf(monthlySummary?.road_insurance_revenue);
  const nonInsuranceRevenue = numOf(monthlySummary?.road_non_insurance_revenue);
  const sellingAdminCost = numOf(monthlySummary?.road_selling_admin_cost);

  // 売上比%
  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  // 目標値 (Dashboard.tsx 側で manToYen 済 → 円系は そのまま、 計算用に再掛け不要)
  const targetSales = numOf(targets.targetSales);
  const targetAdCost = numOf(targets.targetAdCost);
  const targetCount = numOf(targets.targetCount);
  const targetUnitPrice = numOf(targets.targetUnitPrice);
  const targetCpa = numOf(targets.targetCpa);
  const targetConvRate = numOf(targets.targetConversionRate);
  const targetCallCount = numOf(targets.targetCallCount);
  // ⑥ 体制 (PR c94-C-3a) — 全業態共通、車両数 + 研修生 (スナップショット)
  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);
  const targetVehicleCount = numOf(targets.targetVehicleCount);
  const targetTraineeCount = numOf(targets.targetTraineeCount);

  return (
    <section style={{ marginBottom: SECTION.MARGIN }}>
      <SectionLabel>ロード業態 — フォーム連動 KPI 一覧</SectionLabel>
      <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SECTION.GAP, gridAutoRows: "min-content" }}>
        {/* ① 新規対応 */}
        <Card title="① 新規対応 (売上・コスト・粗利)" group="rev">
          <Row label="売上"   actual={fmtYen(sales)}     target={fmtYen(targetSales)}   achievement={achv(sales, targetSales)}
            mom={momLabel(sales, p?.total_revenue ?? 0, "yen")} />
          <Row label="保険売上"   actual={fmtYen(insuranceRevenue)}    target="—" sub="保険業務由来の売上" />
          <Row label="無保険売上" actual={fmtYen(nonInsuranceRevenue)} target="—" sub="保険業務以外の売上" />
          <Row label="広告費" actual={fmtYen(adCost)} target={fmtYen(targetAdCost)} achievement={achv(adCost, targetAdCost, true)} sub={`売上比 ${fmtPct(ratio(adCost))}`}
            mom={momLabel(adCost, p?.ad_cost ?? 0, "yen")} momInvert />
          <Row label="手数料" actual={fmtYen(commission)} target="—" sub={`売上比 ${fmtPct(ratio(commission))}`}
            mom={momLabel(commission, p?.sales_outsourcing_cost ?? 0, "yen")} momInvert />
          <Row label="販管費" actual={fmtYen(sellingAdminCost)} target="—" sub="記録のみ (営業利益式には含めず)" />
          <Row label="粗利"   actual={fmtYen(profit)}    target="—" sub="= 売上 − (広告費 + 手数料)" highlight
            mom={momLabel(profit, p?.total_profit ?? 0, "yen")} />
        </Card>

        {/* ② 入電 (PR #58c で 7 内訳 DB 化) */}
        <Card title="② 入電 (7 内訳)" group="acq">
          <Row label="広告 入電"       actual={fmtCount(callAd)}       target="—" />
          <Row label="リピート 入電"   actual={fmtCount(callRepeat)}   target="—" />
          <Row label="紹介 入電"       actual={fmtCount(callReferral)} target="—" />
          <Row label="再訪問 入電"     actual={fmtCount(callRevisit)}  target="—" />
          <Row label="ウェルネスト 入電" actual={fmtCount(callWellnest)} target="—" />
          <Row label="SEO 入電"        actual={fmtCount(callSeo)}      target="—" />
          <Row label="保険会社 入電"   actual={fmtCount(callInsurance)} target="—" />
          <Row label="総入電件数" actual={fmtCount(callCount)} target={fmtCount(targetCallCount)} achievement={achv(callCount, targetCallCount)}
            mom={momLabel(callCount, p?.call_count ?? 0, "count")} />
          <Row label="入電単価"   actual={fmtYen(callUnitPrice)} target="—" sub="= 広告費 ÷ 総入電件数"
            mom={momLabel(callUnitPrice, p ? Math.round(safeDiv(p.ad_cost, p.call_count)) : 0, "yen")} momInvert />
        </Card>

        {/* ③ 獲得 (PR #52 で 7 内訳 DB 化) — PR #82: 3 sections (odd) → 最終を full-width 化 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="③ 獲得 (7 内訳)" group="acq">
            <Row label="広告 獲得"       actual={fmtCount(acqAd)}        target="—" />
            <Row label="リピート 獲得"   actual={fmtCount(acqRepeat)}    target="—" />
            <Row label="紹介 獲得"       actual={fmtCount(acqReferral)}  target="—" />
            <Row label="再訪問 獲得"     actual={fmtCount(acqRevisit)}   target="—" />
            <Row label="ウェルネスト 獲得" actual={fmtCount(acqWellnest)} target="—" />
            <Row label="SEO 獲得"        actual={fmtCount(acqSeo)}       target="—" />
            <Row label="保険会社 獲得"   actual={fmtCount(acqInsurance)} target="—" />
            <Row label="総獲得件数" actual={fmtCount(acquisitionCount)} target={fmtCount(targetCount)} achievement={achv(acquisitionCount, targetCount)} highlight
              mom={momLabel(acquisitionCount, p?.acquisition_count ?? 0, "count")} />
            <Row label="客単価" actual={fmtYen(Math.round(safeDiv(sales, acquisitionCount)))} target={fmtYen(targetUnitPrice)} sub="= 売上 ÷ 総獲得件数"
              mom={momLabel(Math.round(safeDiv(sales, acquisitionCount)), p ? Math.round(safeDiv(p.total_revenue, p.acquisition_count)) : 0, "yen")} />
            <Row label="CPA"    actual={fmtYen(cpa)} target={fmtYen(targetCpa)} achievement={achv(cpa, targetCpa, true)} sub="= 広告費 ÷ 総獲得件数"
              mom={momLabel(cpa, p ? Math.round(safeDiv(p.ad_cost, p.acquisition_count)) : 0, "yen")} momInvert />
            <Row label="成約率" actual={fmtPct(convRate)} target={fmtPct(targetConvRate)} achievement={achv(convRate, targetConvRate)} sub="= 総獲得件数 ÷ 総入電件数 × 100"
              mom={momLabel(convRate, p ? safeDiv(p.acquisition_count, p.call_count) * 100 : 0, "pct")} />
          </Card>
        </div>

        {/* ⑥ 体制 (PR c94-C-3a) — 全業態共通、車両数 + 研修生 (スナップショット) */}
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

// ===== UI 部品 (LocksmithDashboardSection と同パターン) =====

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: SECTION.HEADER_FONT_SIZE, fontWeight: SECTION.HEADER_FONT_WEIGHT, color: SECTION.HEADER_COLOR,
      textTransform: "uppercase", letterSpacing: "0.07em",
      marginBottom: 8, paddingLeft: 4,
    }}>{children}</div>
  );
}

// PR #59 c1: Card は group を受け取り、子 <Row> 全てに cloneElement で注入する。
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
          <col style={{ width: "28%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#fafffe" }}>
            {["指標", "実績", "目標", "達成率 / 補足", "前月同日比"].map((h, i) => (
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
  mom?: string | null;
  momInvert?: boolean;
}) {
  const td: React.CSSProperties = {
    padding: `9px ${SECTION.PADDING_H}px`, fontSize: 12, color: "#374151",
    borderBottom: "1px solid #f5faf5", whiteSpace: "nowrap",
  };
  const bg = highlight ? "#f0fdf4" : "transparent";
  const borderColor = group ? getGroupBorderColor(group) : "transparent";
  const momColor = mom
    ? (() => { const up = mom.startsWith("↑") || mom.startsWith("+"); return (momInvert ? !up : up) ? "#059669" : "#dc2626"; })()
    : "#9ca3af";

  return (
    <tr style={{ background: bg }}>
      <td style={{
        ...td, textAlign: "left", fontWeight: highlight ? 800 : 700,
        color: highlight ? "#065f46" : "#111",
        borderLeft: `3px solid ${borderColor}`,
      }}>
        {label}
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
        ) : sub ? (
          <span style={{ fontSize: 10, color: "#6b7280" }}>{sub}</span>
        ) : (
          <span style={{ color: "#d1d5db" }}>—</span>
        )}
      </td>
      <td style={{ ...td, textAlign: "right", fontSize: 11, color: momColor }}>
        {mom ?? <span style={{ color: "#d1d5db" }}>—</span>}
      </td>
    </tr>
  );
}

/** 達成率 + ステータス。invert=true でコスト系 (低いほど良い) の評価軸 */
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
