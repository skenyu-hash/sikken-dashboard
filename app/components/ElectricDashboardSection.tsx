"use client";
// PR #54 c3: 電気業態専用ダッシュボードセクション。
//
// 役割:
//   Dashboard.tsx の「全 17 項目 指標一覧」を、activeBusiness === 'electric'
//   の時のみ本コンポーネントに置換する。水道仕様 (17 項目) + 分電盤件数 1 行 =
//   合計 18 項目を、locksmith/road/detective と同じカード構造で表示。
//
// 構成 (ElectricForm = WaterForm 同構造 + 分電盤件数):
//   ① 新規対応・コスト — 売上 / 粗利 / 各コスト + 売上比%
//   ② 広告・効率指標   — 広告費 / 広告費率 / 入電 / CPA / 成約率
//   ③ 施工              — 工事件数 (外注 / 自社) / 工事費 / 工事取得率
//   ④ HELP              — HELP売上 / HELP件数 / HELP客単価 / HELP率
//   ⑤ 電気専用          — **分電盤件数** / 目標 / 達成率 (PR #54 で新規)
//
// データソース:
//   monthlySummary (raw 行): 既存 17 列 + switchboard_count
//   targets       : /api/targets fetch 済 (Dashboard.tsx で manToYen 適用済)
//
// 派生値:
//   粗利 (営業利益) = calc.profit 経由で resolveTotalProfit (water/electric は標準式)
//   CPA / 入電単価 / 成約率 / HELP 客単価 / HELP 率 / 工事取得率: ローカル計算

import React from "react";
import { yen, type Targets } from "../lib/calculations";
import { resolveTotalProfit } from "../lib/profit";
import { MetricBadge, type GroupType } from "./ui";
import { getGroupBorderColor } from "./dashboard/metric-groups";
import { SECTION } from "./sectionStyles";

type Props = {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
};

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const fmtCount = (v: number): string => (v > 0 ? `${v.toLocaleString()}件` : "—");
const fmtPct = (v: number): string => (v > 0 ? `${v.toFixed(1)}%` : "—");
const fmtYen = (v: number): string => (v > 0 ? yen(v) : "—");

export default function ElectricDashboardSection({ monthlySummary, targets }: Props) {
  // 売上・コスト
  const sales = numOf(monthlySummary?.total_revenue);
  const laborCost = numOf(monthlySummary?.total_labor_cost);
  const materialCost = numOf(monthlySummary?.material_cost);
  const adCost = numOf(monthlySummary?.ad_cost);
  const commission = numOf(monthlySummary?.sales_outsourcing_cost);
  const cardFee = numOf(monthlySummary?.card_processing_fee);
  // 粗利: PR #51.2 resolveTotalProfit (legacy 行は構成要素から再計算)
  const profit = resolveTotalProfit(monthlySummary);

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count);
  const totalCount = numOf(monthlySummary?.total_count);
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));
  const convRate = safeDiv(acquisitionCount, callCount) * 100;
  const adRate = safeDiv(adCost, sales) * 100;

  // 施工 — PR c93-2 で対応ベースに再定義
  //   旧: total = outsourced + internal (発注ベース、二重カウント問題)
  //   新: construction_count = 対応 1 件 = 工事 1 件 (10万円以上)、authoritative
  //   旧 outsourced_construction_count は monthly_summaries 列に残置 (UI 表示用には使わず)
  const constructionCount = numOf(monthlySummary?.construction_count);
  const internalConstructionCount = numOf(monthlySummary?.internal_construction_count);
  const constructionRate = safeDiv(constructionCount, totalCount) * 100;
  // PR c93-2 新: 自社工事比率 = 自社工事件数 ÷ 工事件数 × 100
  const internalConstructionRatio = safeDiv(internalConstructionCount, constructionCount) * 100;
  const outsourcedConstructionCost = numOf(monthlySummary?.outsourced_construction_cost);
  const internalConstructionProfit = numOf(monthlySummary?.internal_construction_profit);
  // PR c93-2: 実質工事コスト (= 外注工事費 - 自社工事利益) は廃止 (発注ベース時代の指標)

  // HELP
  const helpRevenue = numOf(monthlySummary?.help_revenue);
  const helpCount = numOf(monthlySummary?.help_count);
  const helpUnitPrice = Math.round(safeDiv(helpRevenue, helpCount));
  const helpRate = safeDiv(helpRevenue, sales) * 100;

  // 電気専用: 分電盤件数 (PR #48b で実績、PR #54 で目標)
  const switchboardCount = numOf(monthlySummary?.switchboard_count);

  // 売上比% (UI 表示用)
  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  // 客単価
  const unitPrice = Math.round(safeDiv(sales, totalCount));

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
  // PR #54 新規目標
  const targetSwitchboardCount = numOf(targets.targetSwitchboardCount);
  // ⑥ 体制 (PR c94-C-3a) — 全業態共通、車両数 + 研修生 (スナップショット)
  const vehicleCount = numOf(monthlySummary?.vehicle_count);
  const traineeCount = numOf(monthlySummary?.trainee_count);
  const targetVehicleCount = numOf(targets.targetVehicleCount);
  const targetTraineeCount = numOf(targets.targetTraineeCount);

  return (
    <section style={{ marginBottom: SECTION.MARGIN }}>
      <SectionLabel>電気業態 — フォーム連動 KPI 一覧 (分電盤件数含む)</SectionLabel>
      <div className="metrics-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SECTION.GAP, gridAutoRows: "min-content" }}>
        {/* ① 新規対応・コスト */}
        <Card title="① 新規対応・コスト・粗利" group="rev">
          <Row label="売上"        actual={fmtYen(sales)}        target={fmtYen(targetSales)}     achievement={achv(sales, targetSales)} />
          <Row label="職人費"      actual={fmtYen(laborCost)}    target="—" sub={`売上比 ${fmtPct(ratio(laborCost))}`} />
          <Row label="材料費"      actual={fmtYen(materialCost)} target="—" sub={`売上比 ${fmtPct(ratio(materialCost))}`} />
          <Row label="広告費"      actual={fmtYen(adCost)}       target={fmtYen(targetAdCost)} achievement={achv(adCost, targetAdCost, true)} sub={`売上比 ${fmtPct(ratio(adCost))}`} />
          <Row label="営業外注費"  actual={fmtYen(commission)}   target="—" sub={`売上比 ${fmtPct(ratio(commission))}`} />
          <Row label="カード手数料" actual={fmtYen(cardFee)}     target="—" sub={`売上比 ${fmtPct(ratio(cardFee))}`} />
          <Row label="粗利"        actual={fmtYen(profit)}       target={fmtYen(targetProfit)} achievement={achv(profit, targetProfit)} highlight />
        </Card>

        {/* ② 広告・効率指標 */}
        <Card title="② 広告・効率指標" group="acq">
          <Row label="広告費率"    actual={fmtPct(adRate)}        target={fmtPct(targetAdRate)} achievement={achv(adRate, targetAdRate, true)} />
          <Row label="入電件数"    actual={fmtCount(callCount)}   target={fmtCount(targetCallCount)} achievement={achv(callCount, targetCallCount)} />
          <Row label="入電単価"    actual={fmtYen(callUnitPrice)} target="—" sub="= 広告費 ÷ 入電件数" />
          <Row label="獲得件数"    actual={fmtCount(acquisitionCount)} target={fmtCount(targetCount)} achievement={achv(acquisitionCount, targetCount)} />
          <Row label="CPA"         actual={fmtYen(cpa)}           target={fmtYen(targetCpa)} achievement={achv(cpa, targetCpa, true)} sub="= 広告費 ÷ 獲得件数" />
          <Row label="成約率"      actual={fmtPct(convRate)}      target={fmtPct(targetConvRate)} achievement={achv(convRate, targetConvRate)} sub="= 獲得件数 ÷ 入電件数" />
          <Row label="客単価"      actual={fmtYen(unitPrice)}     target={fmtYen(targetUnitPrice)} achievement={achv(unitPrice, targetUnitPrice)} sub="= 売上 ÷ 対応件数" />
          <Row label="対応件数"    actual={fmtCount(totalCount)}  target={fmtCount(targetCount)} achievement={achv(totalCount, targetCount)} />
        </Card>

        {/* ③ 施工 — PR c93-2 で対応ベース再構成
            旧: 外注工事件数 + 自社工事件数 + 総工事件数 (合算) + 工事取得率 (合算ベース)
                + 外注工事費 + 自社工事利益 + 実質工事コスト (= 外注 - 自社利益)
            新: 工事件数 (対応ベース) + 自社工事件数 + 自社工事比率 (auto)
                + 工事取得率 (= 工事件数 ÷ 対応件数) + 外注工事費 + 自社工事利益
                + 実質工事コスト は廃止 (発注ベース時代の指標) */}
        <Card title="③ 施工" group="cnt">
          <Row label="工事件数"        actual={fmtCount(constructionCount)}         target="—" sub="対応1件 = 工事1件 (10万円以上)" />
          <Row label="自社工事件数"    actual={fmtCount(internalConstructionCount)} target="—" sub="うち会社内製化分 (営業マン自施工は除く)" />
          <Row label="自社工事比率"    actual={fmtPct(internalConstructionRatio)}   target="—" sub="= 自社工事件数 ÷ 工事件数 × 100" />
          <Row label="工事取得率"      actual={fmtPct(constructionRate)}            target={fmtPct(targetConstructionRate)} achievement={achv(constructionRate, targetConstructionRate)} sub="= 工事件数 ÷ 対応件数" />
          <Row label="外注工事費"      actual={fmtYen(outsourcedConstructionCost)}  target="—" />
          <Row label="自社工事利益"    actual={fmtYen(internalConstructionProfit)}  target="—" />
        </Card>

        {/* ④ HELP */}
        <Card title="④ HELP 部門" group="help">
          <Row label="HELP 売上"   actual={fmtYen(helpRevenue)}   target={fmtYen(targetHelpSales)}    achievement={achv(helpRevenue, targetHelpSales)} />
          <Row label="HELP 件数"   actual={fmtCount(helpCount)}   target={fmtCount(targetHelpCount)} achievement={achv(helpCount, targetHelpCount)} />
          <Row label="HELP 客単価" actual={fmtYen(helpUnitPrice)} target={fmtYen(targetHelpUnitPrice)} achievement={achv(helpUnitPrice, targetHelpUnitPrice)} sub="= HELP売上 ÷ HELP件数" />
          <Row label="HELP 率"     actual={fmtPct(helpRate)}      target={fmtPct(targetHelpRate)}      achievement={achv(helpRate, targetHelpRate)} sub="= HELP売上 ÷ 売上 × 100" />
        </Card>

        {/* ⑤ 電気専用 (PR #54) — PR #82: 5 sections (odd) → 最終を full-width 化 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <Card title="⑤ 電気専用" group="cnt">
            <Row label="分電盤件数"
              actual={fmtCount(switchboardCount)}
              target={fmtCount(targetSwitchboardCount)}
              achievement={achv(switchboardCount, targetSwitchboardCount)}
              highlight />
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

// ===== UI 部品 (LocksmithDashboardSection / RoadDashboardSection / DetectiveDashboardSection と同パターン) =====

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
//   Card 内のすべての行は同じ group に属する (Section 内の Card 単位で割り当て)。
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
          <col style={{ width: "22%" }} />
          <col style={{ width: "22%" }} />
          <col style={{ width: "22%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: "#fafffe" }}>
            {["指標", "実績", "目標", "達成率 / 補足"].map((h, i) => (
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
  label, actual, target, achievement, sub, highlight, group,
}: {
  label: string;
  actual: string;
  target: string;
  achievement?: { pct: number; status: "good" | "warn" | "bad" } | null;
  sub?: string;
  highlight?: boolean;
  /** PR #59 c1: 親 Card から cloneElement で注入される (直接渡す必要なし) */
  group?: GroupType;
}) {
  const td: React.CSSProperties = {
    padding: `9px ${SECTION.PADDING_H}px`, fontSize: 12, color: "#374151",
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
          // achievement.status は invert (コスト系) 考慮済みなので status から色を引く
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
