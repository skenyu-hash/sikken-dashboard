"use client";
// PR #53 c3: 探偵業態専用ダッシュボードセクション。
//
// 役割:
//   Dashboard.tsx の「全 17 項目 指標一覧」を、activeBusiness === 'detective'
//   の時のみ本コンポーネントに置換する。DetectiveForm の入力項目と 1:1 対応
//   した 4 セクション表示。④ 面談プロセスが探偵専用 (面談ファネル可視化)。
//
// 構成 (DetectiveForm と同構造):
//   ① 新規対応 — 売上 / 広告費 / 粗利 (営業利益)
//                 (販管費 は UI のみのため表示せず)
//   ② 入電 — 総入電件数 / 入電単価 (4 内訳は "— UI のみ、Phase B 予定")
//   ③ 獲得 — 6 内訳 "— UI のみ、Phase B" / 総獲得件数(=アポ獲得数) / 客単価
//   ④ 面談プロセス (探偵専用、PR #53 で 2 内訳を DB 化):
//     - アポ獲得数 (= acquisition_count) / 目標 (target_count) / 達成率
//     - アポ獲得率 (calc) / 目標 (target_conversion_rate、ラベル「アポ獲得率目標」流用)
//     - 面談事前キャンセル数 (PR #53 新 DB 列、target なし) + キャンセル率 (calc)
//     - 面談数 (PR #53 新 DB 列) / 目標 (target_meeting_count) / 達成率
//     - 面談率 (calc) / 目標 (target_meeting_rate)
//     - 成約件数 (= total_count via outsourced_response_count) / 目標 (target_count 流用)
//     - 成約率 (calc)
//
// データソース:
//   monthlySummary (raw 行): detective_*_count を直接読む
//   targets       : /api/targets fetch 済 (Dashboard.tsx で manToYen 適用済)
//
// 派生値:
//   粗利 (営業利益) = 売上 − 広告費       (DetectiveForm と同式、他コスト 0)
//   CPA           = 広告費 ÷ 総獲得件数
//   アポ獲得率    = 総獲得件数 ÷ 総入電件数 × 100  (= calc.conv_rate と同式)
//   キャンセル率  = 面談事前キャンセル数 ÷ 総獲得件数 × 100
//   面談率        = 面談数 ÷ 総獲得件数 × 100
//   成約率        = 成約件数 ÷ 面談数 × 100

import { yen, type Targets } from "../lib/calculations";

type Props = {
  monthlySummary: Record<string, unknown> | null;
  targets: Targets;
};

const numOf = (v: unknown): number => (typeof v === "number" ? v : v != null ? Number(v) || 0 : 0);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);
const fmtCount = (v: number): string => (v > 0 ? `${v.toLocaleString()}件` : "—");
const fmtPct = (v: number): string => (v > 0 ? `${v.toFixed(1)}%` : "—");
const fmtYen = (v: number): string => (v > 0 ? yen(v) : "—");

export default function DetectiveDashboardSection({ monthlySummary, targets }: Props) {
  // 売上・コスト
  const sales = numOf(monthlySummary?.total_revenue);
  const adCost = numOf(monthlySummary?.ad_cost);
  const profit = sales - adCost; // 探偵: 売上 - 広告費 = 営業利益

  // 入電 / 獲得
  const callCount = numOf(monthlySummary?.call_count);
  const acquisitionCount = numOf(monthlySummary?.acquisition_count); // = アポ獲得数
  const callUnitPrice = Math.round(safeDiv(adCost, callCount));
  const cpa = Math.round(safeDiv(adCost, acquisitionCount));

  // 面談ファネル (PR #53 で DB 化)
  const meetingCount = numOf(monthlySummary?.detective_meeting_count);
  const cancelCount = numOf(monthlySummary?.detective_cancel_count);
  const closeCount = numOf(monthlySummary?.total_count); // = 成約件数

  const appointmentRate = safeDiv(acquisitionCount, callCount) * 100;
  const cancelRate = safeDiv(cancelCount, acquisitionCount) * 100;
  const meetingRate = safeDiv(meetingCount, acquisitionCount) * 100;
  const closeRate = safeDiv(closeCount, meetingCount) * 100;

  // 売上比%
  const ratio = (cost: number) => (sales > 0 ? (cost / sales) * 100 : 0);

  // 目標値 (Dashboard.tsx で manToYen 済、yen 系は再変換不要)
  const targetSales = numOf(targets.targetSales);
  const targetAdCost = numOf(targets.targetAdCost);
  const targetCount = numOf(targets.targetCount); // 成約件数目標
  const targetUnitPrice = numOf(targets.targetUnitPrice);
  const targetCpa = numOf(targets.targetCpa);
  const targetConvRate = numOf(targets.targetConversionRate); // 探偵では アポ獲得率目標
  const targetCallCount = numOf(targets.targetCallCount);
  // PR #53 新規目標
  const targetMeetingCount = numOf(targets.targetMeetingCount);
  const targetMeetingRate = numOf(targets.targetMeetingRate);

  return (
    <section style={{ marginBottom: 16 }}>
      <SectionLabel>探偵業態 — フォーム連動 KPI 一覧 (面談ファネル含む)</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* ① 新規対応 */}
        <Card title="① 新規対応 (売上・コスト・営業利益)">
          <Row label="売上"   actual={fmtYen(sales)}    target={fmtYen(targetSales)}   achievement={achv(sales, targetSales)} />
          <Row label="広告費 (探偵LP)" actual={fmtYen(adCost)} target={fmtYen(targetAdCost)} achievement={achv(adCost, targetAdCost, true)} sub={`売上比 ${fmtPct(ratio(adCost))}`} />
          <Row label="販管費" actual="— (UI のみ、Phase 4 予定)" target="—" />
          <Row label="営業利益" actual={fmtYen(profit)}    target="—" sub="= 売上 − 広告費" highlight />
        </Card>

        {/* ② 入電 */}
        <Card title="② 入電">
          <Row label="電のみ 入電"     actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="メールのみ 入電" actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="LINEのみ 入電"   actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="間違い電話"      actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="入電数" actual={fmtCount(callCount)}        target={fmtCount(targetCallCount)} achievement={achv(callCount, targetCallCount)} />
          <Row label="入電単価"   actual={fmtYen(callUnitPrice)}    target="—" sub="= 広告費 ÷ 入電数" />
        </Card>

        {/* ③ 獲得 (6 内訳は UI のみ) */}
        <Card title="③ 獲得 (6 内訳)">
          <Row label="電話 × 浮気"   actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="電話 × その他" actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="メール × 浮気" actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="メール × その他" actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="LINE × 浮気"   actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="LINE × その他" actual="— (UI のみ、Phase B 後続予定)" target="—" />
          <Row label="合計獲得件数 (面談予定数 / アポ獲得数)"
            actual={fmtCount(acquisitionCount)}
            target={fmtCount(targetCount)}
            achievement={achv(acquisitionCount, targetCount)} highlight />
          <Row label="客単価" actual={fmtYen(Math.round(safeDiv(sales, closeCount)))} target={fmtYen(targetUnitPrice)} sub="= 売上 ÷ 成約件数" />
          <Row label="CPA"    actual={fmtYen(cpa)} target={fmtYen(targetCpa)} achievement={achv(cpa, targetCpa, true)} sub="= 広告費 ÷ 合計獲得件数" />
        </Card>

        {/* ④ 面談プロセス (探偵専用、PR #53 で面談数 / キャンセル数 DB 化) */}
        <Card title="④ 面談プロセス (探偵専用ファネル)">
          <Row label="アポ獲得率"
            actual={fmtPct(appointmentRate)}
            target={fmtPct(targetConvRate)}
            achievement={achv(appointmentRate, targetConvRate)}
            sub="= 合計獲得件数 ÷ 入電数 × 100" />
          <Row label="面談事前キャンセル数"
            actual={fmtCount(cancelCount)}
            target="—" />
          <Row label="キャンセル率"
            actual={fmtPct(cancelRate)}
            target="—"
            sub="= 面談事前キャンセル数 ÷ 合計獲得件数 × 100" />
          <Row label="面談数"
            actual={fmtCount(meetingCount)}
            target={fmtCount(targetMeetingCount)}
            achievement={achv(meetingCount, targetMeetingCount)} highlight />
          <Row label="面談率"
            actual={fmtPct(meetingRate)}
            target={fmtPct(targetMeetingRate)}
            achievement={achv(meetingRate, targetMeetingRate)}
            sub="= 面談数 ÷ 合計獲得件数 × 100" />
          <Row label="成約件数"
            actual={fmtCount(closeCount)}
            target="—" />
          <Row label="成約率"
            actual={fmtPct(closeRate)}
            target="—"
            sub="= 成約件数 ÷ 面談数 × 100" />
        </Card>
      </div>
    </section>
  );
}

// ===== UI 部品 (LocksmithDashboardSection / RoadDashboardSection と同パターン) =====

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#065f46",
      textTransform: "uppercase", letterSpacing: "0.07em",
      marginBottom: 8, paddingLeft: 4,
    }}>{children}</div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
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
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({
  label, actual, target, achievement, sub, highlight,
}: {
  label: string;
  actual: string;
  target: string;
  achievement?: { pct: number; status: "good" | "warn" | "bad" } | null;
  sub?: string;
  highlight?: boolean;
}) {
  const td: React.CSSProperties = {
    padding: "9px 12px", fontSize: 12, color: "#374151",
    borderBottom: "1px solid #f5faf5", whiteSpace: "nowrap",
  };
  const bg = highlight ? "#f0fdf4" : "transparent";

  const achColor =
    !achievement ? "#9ca3af" :
    achievement.status === "good" ? "#065f46" :
    achievement.status === "warn" ? "#854d0e" : "#991b1b";
  const achBg =
    !achievement ? "transparent" :
    achievement.status === "good" ? "#d1fae5" :
    achievement.status === "warn" ? "#fef9c3" : "#fee2e2";

  return (
    <tr style={{ background: bg }}>
      <td style={{ ...td, textAlign: "left", fontWeight: highlight ? 800 : 700, color: highlight ? "#065f46" : "#111" }}>
        {label}
      </td>
      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: highlight ? "#065f46" : "#111" }}>{actual}</td>
      <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>{target}</td>
      <td style={{ ...td, textAlign: "right" }}>
        {achievement ? (
          <span style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 4,
            fontSize: 11, fontWeight: 700, color: achColor, background: achBg,
          }}>{achievement.pct.toFixed(1)}%</span>
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
