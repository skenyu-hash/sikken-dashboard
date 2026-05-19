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
import { yen, type Targets } from "../lib/calculations";
import { MetricBadge, type GroupType } from "./ui";
import { getGroupBorderColor } from "./dashboard/metric-groups";

type Props = {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
};

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const fmtCount = (v: number): string => (v > 0 ? `${v.toLocaleString()}件` : "—");
const fmtPct = (v: number): string => (v > 0 ? `${v.toFixed(1)}%` : "—");
const fmtYen = (v: number): string => (v > 0 ? yen(v) : "—");

export default function LocksmithDashboardSection({ monthlySummary, targets }: Props) {
  // 売上系
  const sales = numOf(monthlySummary?.total_revenue);
  const constructionCost = numOf(monthlySummary?.locksmith_construction_cost);
  const materialCost = numOf(monthlySummary?.material_cost);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.locksmith_commission_fee);
  const profit = sales - constructionCost - materialCost - adCost - commission;

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
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

  return (
    <section style={{ marginBottom: 16 }}>
      <SectionLabel>鍵業態 — フォーム連動 KPI 一覧</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* ① 新規対応 */}
        <Card title="① 新規対応 (売上・コスト・粗利)" group="rev">
          <Row label="売上"   actual={fmtYen(sales)}            target={fmtYen(targetSales)}    achievement={achv(sales, targetSales)} />
          <Row label="工事費" actual={fmtYen(constructionCost)} target="—"                       sub={`売上比 ${fmtPct(ratio(constructionCost))}`} />
          <Row label="材料費" actual={fmtYen(materialCost)}     target="—"                       sub={`売上比 ${fmtPct(ratio(materialCost))}`} />
          <Row label="広告費" actual={fmtYen(adCost)}           target={fmtYen(targetAdCost)}   achievement={achv(adCost, targetAdCost, true)} sub={`売上比 ${fmtPct(ratio(adCost))}`} />
          <Row label="手数料" actual={fmtYen(commission)}       target="—"                       sub={`売上比 ${fmtPct(ratio(commission))}`} />
          <Row label="販管費" actual="— (UI のみ、Phase 4 予定)" target="—" />
          <Row label="粗利"   actual={fmtYen(profit)}            target="—"                       sub="= 売上 − (工事費 + 材料費 + 広告費 + 手数料)" highlight />
        </Card>

        {/* ② 入電 */}
        <Card title="② 入電" group="acq">
          <Row label="車LP+メール 入電" actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="インハウス 入電"  actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="総入電件数" actual={fmtCount(callCount)}        target={fmtCount(targetCallCount)} achievement={achv(callCount, targetCallCount)} />
          <Row label="入電単価"   actual={fmtYen(callUnitPrice)}      target="—"                          sub="= 広告費 ÷ 総入電件数" />
        </Card>

        {/* ③ 獲得 */}
        <Card title="③ 獲得 (5 内訳)" group="acq">
          <Row label="車LP+メール 獲得" actual={fmtCount(acqLpMail)}  target="—" />
          <Row label="インハウス 獲得"  actual={fmtCount(acqInhouse)} target="—" />
          <Row label="リピート（紹介）" actual={fmtCount(acqRepeat)}  target="—" />
          <Row label="再訪問"           actual={fmtCount(acqRevisit)} target="—" />
          <Row label="HELP 件数 (獲得)" actual={fmtCount(acqHelp)}    target={fmtCount(targetHelpCount)} achievement={achv(acqHelp, targetHelpCount)} />
          <Row label="総獲得件数" actual={fmtCount(acquisitionCount)} target={fmtCount(targetCount)} achievement={achv(acquisitionCount, targetCount)} highlight />
          <Row label="客単価"      actual={fmtYen(Math.round(safeDiv(sales, acquisitionCount)))} target={fmtYen(targetUnitPrice)} sub="= 売上 ÷ 総獲得件数" />
          <Row label="CPA"         actual={fmtYen(cpa)}                target={fmtYen(targetCpa)}     achievement={achv(cpa, targetCpa, true)} sub="= 広告費 ÷ 総獲得件数" />
          <Row label="成約率"      actual={fmtPct(convRate)}            target={fmtPct(targetConvRate)} achievement={achv(convRate, targetConvRate)} sub="= 総獲得件数 ÷ 総入電件数 × 100" />
        </Card>

        {/* ④ HELP */}
        <Card title="④ HELP" group="help">
          <Row label="HELP 売上"    actual={fmtYen(helpRevenue)}   target={fmtYen(targetHelpSales)}    achievement={achv(helpRevenue, targetHelpSales)} />
          <Row label="HELP 件数"    actual={fmtCount(helpCount)}   target={fmtCount(targetHelpCount)} achievement={achv(helpCount, targetHelpCount)} />
          <Row label="HELP 客単価"  actual={fmtYen(helpUnitPrice)} target={fmtYen(targetHelpUnitPrice)} achievement={achv(helpUnitPrice, targetHelpUnitPrice)} sub="= HELP売上 ÷ HELP件数" />
          <Row label="HELP 率"      actual={fmtPct(helpRate)}      target={fmtPct(targetHelpRate)}      achievement={achv(helpRate, targetHelpRate)} sub="= HELP売上 ÷ 売上 × 100" />
        </Card>
      </div>
    </section>
  );
}

// ===== UI 部品 =====

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#065f46",
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
        background: "#ecfdf5", padding: "8px 14px",
        borderBottom: "1px solid #d1fae5",
        fontSize: 12, fontWeight: 700, color: "#065f46",
      }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "34%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "22%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#fafffe" }}>
            {["指標", "実績", "目標", "達成率 / 補足"].map((h, i) => (
              <th key={h} style={{
                padding: "7px 12px", fontSize: 10, fontWeight: 700, color: "#6b7280",
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
  label, actual, target, achievement, sub, highlight, group,
}: {
  label: string;
  actual: string;
  target: string;
  achievement?: { pct: number; status: "good" | "warn" | "bad" } | null;
  sub?: string;
  highlight?: boolean;
  /** PR #59 c1: 親 Card から cloneElement で注入される */
  group?: GroupType;
}) {
  const td: React.CSSProperties = {
    padding: "9px 12px", fontSize: 12, color: "#374151",
    borderBottom: "1px solid #f5faf5", whiteSpace: "nowrap",
  };
  const bg = highlight ? "#f0fdf4" : "transparent";
  const borderColor = group ? getGroupBorderColor(group) : "transparent";

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
          <span style={{ fontSize: 10, color: "#9ca3af" }}>{sub}</span>
        ) : (
          <span style={{ color: "#d1d5db" }}>—</span>
        )}
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
