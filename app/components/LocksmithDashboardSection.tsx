"use client";
// PR #51 c3: 鍵業態専用ダッシュボードセクション。
//
// 役割:
//   Dashboard.tsx の「全 17 項目 指標一覧」を、activeBusiness === 'locksmith'
//   の時のみ本コンポーネントに置換する。LocksmithForm の入力項目と完全に
//   1:1 対応した 4 セクション表示 (フォーム ⇄ ダッシュボード 双方向確認可能)。
//
// 構成 (LocksmithForm と同構造):
//   ① 新規対応 — 売上 / 工事費 / 材料費 / 広告費 / 手数料 / 粗利 + 売上比%
//   ② 入電    — 総入電件数 / 入電単価 (内訳は Phase B のため "— UI のみ" 表記)
//   ③ 獲得    — 5 内訳 (車LP+メール / インハウス / リピート / 再訪問 / HELP)
//                + 総獲得件数 / CPA / 成約率
//   ④ HELP    — HELP 売上 / HELP 件数 / HELP 客単価 / HELP 率
//
// データソース:
//   monthlySummary (raw 行): 業態固有の DB 列を直接読む (locksmith_*)
//   targets       : /api/targets から取得済 (Dashboard.tsx で fetch)
//
// 派生値:
//   粗利     = 売上 - 工事費 - 材料費 - 広告費 - 手数料 (LocksmithForm と同式)
//   CPA      = 広告費 ÷ 総獲得件数
//   成約率   = 総獲得件数 ÷ 総入電件数 × 100
//   HELP 客単価 = HELP売上 ÷ HELP件数
//   HELP 率  = HELP売上 ÷ 売上 × 100

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

export default function LocksmithDashboardSection({ monthlySummary, targets, prevCalc }: Props) {
  const p = prevCalc;
  // 売上系
  const sales = numOf(monthlySummary?.total_revenue);
  const constructionCost = numOf(monthlySummary?.locksmith_construction_cost);
  const materialCost = numOf(monthlySummary?.material_cost);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.locksmith_commission_fee);
  const profit = sales - constructionCost - materialCost - adCost - commission;

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
  const callLpMail = numOf(monthlySummary?.locksmith_car_lp_email_call_count);
  const callInhouse = numOf(monthlySummary?.locksmith_inhouse_call_count);
  const acqLpMail = numOf(monthlySummary?.locksmith_car_lp_email_count);
  const acqInhouse = numOf(monthlySummary?.locksmith_inhouse_count);
  const acqRepeat = numOf(monthlySummary?.locksmith_repeat_count);
  const acqRevisit = numOf(monthlySummary?.locksmith_revisit_count);
  const acqHelp = numOf(monthlySummary?.help_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;

  // HELP
  const helpRevenue = numOf(monthlySummary?.help_revenue);
  const helpCount = numOf(monthlySummary?.help_count);
  const helpUnitPrice = Math.round(safeDiv(helpRevenue, helpCount));
  const helpRate = safeDiv(helpRevenue, sales) * 100;

  // 売上比%
  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  // 目標値: Dashboard.tsx で setTargets(manToYen(j.targets)) (Dashboard.tsx:239)
  // により既に万円→円換算済。本コンポーネントで再度 ×10000 すると二重変換になる
  // (PR #51.1 hotfix: 売上目標が ¥196 億表示になっていた問題)。
  // manToYen が変換するのは targetSales / targetProfit / targetHelpSales /
  // targetSelfSales / targetSelfProfit / targetNewSales / targetNewProfit /
  // targetAdCost の 8 フィールドのみ。それ以外 (targetUnitPrice / targetCpa /
  // targetHelpUnitPrice 等) は元から円単位 or 件数 or 0-100% で保存されている。
  const targetSales = numOf(targets.targetSales);
  const targetAdCost = numOf(targets.targetAdCost);
  const targetCount = numOf(targets.targetCount);
  const targetHelpSales = numOf(targets.targetHelpSales);
  const targetHelpCount = numOf(targets.targetHelpCount);
  const targetUnitPrice = numOf(targets.targetUnitPrice);
  const targetCpa = numOf(targets.targetCpa);
  const targetConvRate = numOf(targets.targetConversionRate);
  const targetCallCount = numOf(targets.targetCallCount);
  const targetHelpUnitPrice = numOf(targets.targetHelpUnitPrice);
  const targetHelpRate = numOf(targets.targetHelpRate);
  // ⑥ 体制 (PR c94-C-3a) — 全業態共通、車両数 + 研修生 (スナップショット)
  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);
  const targetVehicleCount = numOf(targets.targetVehicleCount);
  const targetTraineeCount = numOf(targets.targetTraineeCount);

  return (
    <section style={{ marginBottom: SECTION.MARGIN }}>
      <SectionLabel>鍵業態 — フォーム連動 KPI 一覧</SectionLabel>
      <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SECTION.GAP, gridAutoRows: "min-content" }}>
        {/* ① 新規対応 */}
        <Card title="① 新規対応 (売上・コスト・粗利)" group="rev">
          <Row label="売上"   actual={fmtYen(sales)}            target={fmtYen(targetSales)}  achievement={achv(sales, targetSales)}
            mom={momLabel(sales, p?.total_revenue ?? 0, "yen")} />
          <Row label="工事費" actual={fmtYen(constructionCost)} target="—" sub={`売上比 ${fmtPct(ratio(constructionCost))}`}
            mom={momLabel(constructionCost, p?.locksmith_construction_cost ?? 0, "yen")} momInvert />
          <Row label="材料費" actual={fmtYen(materialCost)}     target="—" sub={`売上比 ${fmtPct(ratio(materialCost))}`}
            mom={momLabel(materialCost, p?.material_cost ?? 0, "yen")} momInvert />
          <Row label="広告費" actual={fmtYen(adCost)}           target={fmtYen(targetAdCost)} achievement={achv(adCost, targetAdCost, true)} sub={`売上比 ${fmtPct(ratio(adCost))}`}
            mom={momLabel(adCost, p?.ad_cost ?? 0, "yen")} momInvert />
          <Row label="手数料" actual={fmtYen(commission)}       target="—" sub={`売上比 ${fmtPct(ratio(commission))}`}
            mom={momLabel(commission, p?.locksmith_commission_fee ?? 0, "yen")} momInvert />
          <Row label="販管費" actual="— (UI のみ、Phase 4 予定)" target="—" />
          <Row label="粗利"   actual={fmtYen(profit)}           target="—" sub="= 売上 − (工事費 + 材料費 + 広告費 + 手数料)" highlight
            mom={momLabel(profit, p?.total_profit ?? 0, "yen")} />
        </Card>

        {/* ② 入電 */}
        <Card title="② 入電" group="acq">
          <Row label="車LP+メール 入電" actual={fmtCount(callLpMail)} target="—"
            mom={momLabel(callLpMail, p?.locksmith_car_lp_email_call_count ?? 0, "count")} />
          <Row label="インハウス 入電"  actual={fmtCount(callInhouse)} target="—"
            mom={momLabel(callInhouse, p?.locksmith_inhouse_call_count ?? 0, "count")} />
          <Row label="総入電件数" actual={fmtCount(callCount)}   target={fmtCount(targetCallCount)} achievement={achv(callCount, targetCallCount)}
            mom={momLabel(callCount, p?.call_count ?? 0, "count")} />
          <Row label="入電単価"   actual={fmtYen(callUnitPrice)} target="—" sub="= 広告費 ÷ 総入電件数"
            mom={momLabel(callUnitPrice, p ? Math.round(safeDiv(p.ad_cost, p.call_count)) : 0, "yen")} momInvert />
        </Card>

        {/* ③ 獲得 */}
        <Card title="③ 獲得 (5 内訳)" group="acq">
          <Row label="車LP+メール 獲得" actual={fmtCount(acqLpMail)}  target="—" />
          <Row label="インハウス 獲得"  actual={fmtCount(acqInhouse)} target="—" />
          <Row label="リピート（紹介）" actual={fmtCount(acqRepeat)}  target="—"
            mom={momLabel(acqRepeat, p?.locksmith_repeat_count ?? 0, "count")} />
          <Row label="再訪問"           actual={fmtCount(acqRevisit)} target="—"
            mom={momLabel(acqRevisit, p?.locksmith_revisit_count ?? 0, "count")} />
          <Row label="HELP 件数 (獲得)" actual={fmtCount(acqHelp)}    target={fmtCount(targetHelpCount)} achievement={achv(acqHelp, targetHelpCount)}
            mom={momLabel(acqHelp, p?.help_count ?? 0, "count")} />
          <Row label="総獲得件数" actual={fmtCount(acquisitionCount)} target={fmtCount(targetCount)} achievement={achv(acquisitionCount, targetCount)} highlight
            mom={momLabel(acquisitionCount, p?.acquisition_count ?? 0, "count")} />
          <Row label="客単価" actual={fmtYen(Math.round(safeDiv(sales, acquisitionCount)))} target={fmtYen(targetUnitPrice)}
            achievement={achv(Math.round(safeDiv(sales, acquisitionCount)), targetUnitPrice)} sub="= 売上 ÷ 総獲得件数"
            mom={momLabel(Math.round(safeDiv(sales, acquisitionCount)), p ? Math.round(safeDiv(p.total_revenue, p.acquisition_count)) : 0, "yen")} />
          <Row label="CPA"    actual={fmtYen(cpa)} target={fmtYen(targetCpa)} achievement={achv(cpa, targetCpa, true)} sub="= 広告費 ÷ 総獲得件数"
            mom={momLabel(cpa, p ? Math.round(safeDiv(p.ad_cost, p.acquisition_count)) : 0, "yen")} momInvert />
          <Row label="成約率"  actual={fmtPct(convRate)} target={fmtPct(targetConvRate)} achievement={achv(convRate, targetConvRate)} sub="= 総獲得件数 ÷ 総入電件数 × 100"
            mom={momLabel(convRate, p ? safeDiv(p.acquisition_count, p.call_count) * 100 : 0, "pct")} />
        </Card>

        {/* ④ HELP */}
        <Card title="④ HELP" group="help">
          <Row label="HELP 売上"   actual={fmtYen(helpRevenue)}   target={fmtYen(targetHelpSales)}    achievement={achv(helpRevenue, targetHelpSales)}
            mom={momLabel(helpRevenue, p?.help_revenue ?? 0, "yen")} />
          <Row label="HELP 件数"   actual={fmtCount(helpCount)}   target={fmtCount(targetHelpCount)}  achievement={achv(helpCount, targetHelpCount)}
            mom={momLabel(helpCount, p?.help_count ?? 0, "count")} />
          <Row label="HELP 客単価" actual={fmtYen(helpUnitPrice)} target={fmtYen(targetHelpUnitPrice)} achievement={achv(helpUnitPrice, targetHelpUnitPrice)} sub="= HELP売上 ÷ HELP件数"
            mom={momLabel(helpUnitPrice, p ? Math.round(safeDiv(p.help_revenue, p.help_count)) : 0, "yen")} />
          <Row label="HELP 率"     actual={fmtPct(helpRate)}      target={fmtPct(targetHelpRate)}      achievement={achv(helpRate, targetHelpRate)} sub="= HELP売上 ÷ 売上 × 100"
            mom={momLabel(helpRate, p ? safeDiv(p.help_revenue, p.total_revenue) * 100 : 0, "pct")} />
        </Card>

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

// ===== UI 部品 =====

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

/** 達成率 + ステータス (good / warn / bad)。invert=true でコスト系の評価軸 (低いほど良い) */
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
