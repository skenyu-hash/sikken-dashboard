"use client";
// エリア別ビュー: 縦軸=エリア(N行) + 合計行(参考、readonly)、横軸=指標。
//
// PR #49a (Phase 1) で大幅刷新:
//   - 編集対象メトリクスを 6 → 14 項目に拡張 (会議ページの 16 項目に対応)
//   - 単位種別を yen / count から 4 種に拡張:
//       yen_man: DB が万円単位で保存 (×10000 で表示) — 売上 / 粗利 / 広告費 / HELP売上 等
//       yen_raw: DB が円単位で保存 (×変換なし)       — 客単価 / CPA / HELP客単価 等
//       count  : 件数                                 — 獲得件数 / 入電件数 / HELP件数
//       percent: 割合 0-100 (×変換なし)              — 広告費率 / 成約率 / 工事取得率 / HELP率
//   - 後方互換: 旧 unit "yen" は yen_man のエイリアスとして保持 (TARGETS_METRICS 経由
//     で参照する GroupView / CompanyView を壊さないため)
//   - state 管理は useTargetsState フックに分離。本コンポーネントは presentational。
//   - 1 マトリクスを 3 セクションに分割するため metrics prop を必須化。

import { emptyTargets, type Targets } from "../../lib/calculations";
import type { AreaTargets } from "../lib/useTargetsState";
import type { BusinessCategory } from "../../lib/businesses";

type Area = { id: string; name: string };

// 編集対象 16 メトリクス。Targets 型のキーに対応。
type MetricKey =
  // ① 売上・粗利・件数 (4)
  | "targetSales"
  | "targetProfit"
  | "targetCount"
  | "targetUnitPrice"
  // ② 広告・効率指標 (6)
  | "targetAdCost"
  | "targetAdRate"
  | "targetCallCount"
  | "targetCpa"
  | "targetConstructionRate"
  | "targetConversionRate"
  // ③ HELP 部門 (4)
  | "targetHelpSales"
  | "targetHelpCount"
  | "targetHelpUnitPrice"
  | "targetHelpRate"
  // ④ 面談ファネル (探偵専用、PR #53)
  | "targetMeetingCount"
  | "targetMeetingRate"
  // ⑤ 電気専用 (PR #54)
  | "targetSwitchboardCount";

// 単位種別。
//   yen_man: DB が万円単位で保存 (lib/calculations.manToYen が ×10000 する対象)
//   yen_raw: DB が円単位で保存 (manToYen 対象外、客単価 / CPA など)
//   count  : 件数
//   percent: 割合 0-100
// 後方互換: "yen" は yen_man のエイリアス。
type MetricUnit = "yen_man" | "yen_raw" | "count" | "percent" | "yen";

type MetricDef = {
  key: MetricKey;
  label: string;
  unit: MetricUnit;
};

// セクション 1: 売上・粗利・件数
const SALES_METRICS: MetricDef[] = [
  { key: "targetSales",     label: "売上目標",     unit: "yen_man" },
  { key: "targetProfit",    label: "粗利目標",     unit: "yen_man" },
  { key: "targetCount",     label: "獲得件数目標", unit: "count" },
  { key: "targetUnitPrice", label: "客単価目標",   unit: "yen_raw" },
];

// セクション 2: 広告・効率指標
const ADS_METRICS: MetricDef[] = [
  { key: "targetAdCost",           label: "広告費目標",     unit: "yen_man" },
  { key: "targetAdRate",           label: "広告費率目標",   unit: "percent" },
  { key: "targetCallCount",        label: "入電件数目標",   unit: "count" },
  { key: "targetCpa",              label: "CPA目標",        unit: "yen_raw" },
  { key: "targetConstructionRate", label: "工事取得率目標", unit: "percent" },
  { key: "targetConversionRate",   label: "成約率目標",     unit: "percent" },
];

// セクション 3: HELP 部門
const HELP_METRICS: MetricDef[] = [
  { key: "targetHelpSales",     label: "HELP売上目標",   unit: "yen_man" },
  { key: "targetHelpCount",     label: "HELP件数目標",   unit: "count" },
  { key: "targetHelpUnitPrice", label: "HELP客単価目標", unit: "yen_raw" },
  { key: "targetHelpRate",      label: "HELP率目標",     unit: "percent" },
];

// セクション 4: 面談ファネル (探偵専用、PR #53)
//   アポ獲得率目標は既存 targetConversionRate (= 成約率目標) を流用するため
//   本セクションには含めない。targetMeetingCount / targetMeetingRate のみ新規。
const MEETING_METRICS: MetricDef[] = [
  { key: "targetMeetingCount", label: "面談数目標", unit: "count" },
  { key: "targetMeetingRate",  label: "面談率目標", unit: "percent" },
];

// セクション 5: 電気専用 (PR #54)
//   分電盤件数目標 (実績は PR #48b で switchboard_count 列に保存済)
const ELECTRIC_METRICS: MetricDef[] = [
  { key: "targetSwitchboardCount", label: "分電盤件数目標", unit: "count" },
];

const ALL_METRICS: MetricDef[] = [...SALES_METRICS, ...ADS_METRICS, ...HELP_METRICS, ...MEETING_METRICS, ...ELECTRIC_METRICS];

// 既存呼び出し元 (page.tsx setAllAreasSameValue / exportCsv、GroupView、CompanyView) は
// この name で import している。意味は「全 14 項目」だが既存変数名で公開。
const METRICS = ALL_METRICS;

// ===== 表示 formatter =====
//
// yen_man: DB は万円単位 (例: 1000 → ¥10,000,000)。/meeting は manToYen() で ×10000 換算。
// yen_raw: DB は円単位 (例: 30000 → ¥30,000)。manToYen 非適用。
// count  : そのまま件数表示。
// percent: 小数点 1 桁の % 表示 (例: 30 → 30.0%)。
function formatYen(v: number): string {
  // 後方互換: 「yen」既存呼び出しは万円単位前提のため ×10000。
  // 新規 yen_raw は formatYenRaw を使う。
  if (!v || v <= 0) return "—";
  return `¥${Math.round(v * 10000).toLocaleString()}`;
}
function formatYenRaw(v: number): string {
  if (!v || v <= 0) return "—";
  return `¥${Math.round(v).toLocaleString()}`;
}
function formatCount(v: number): string {
  if (!v || v <= 0) return "—";
  return v.toLocaleString();
}
function formatPercent(v: number): string {
  if (!v || v <= 0) return "—";
  return `${v.toFixed(1)}%`;
}
function formatByUnit(unit: MetricUnit, v: number): string {
  switch (unit) {
    case "yen_man":
    case "yen":      return formatYen(v);
    case "yen_raw":  return formatYenRaw(v);
    case "count":    return formatCount(v);
    case "percent":  return formatPercent(v);
  }
}

type Props = {
  areas: Area[];
  /** 表示・編集対象のメトリクスサブセット (SALES_METRICS / ADS_METRICS / HELP_METRICS など) */
  metrics: MetricDef[];
  areaTargets: AreaTargets;
  setCell: (areaId: string, key: keyof Targets, raw: string) => void;
  canEdit: boolean;
  flashCells: Set<string>;
};

export default function TargetsMatrix({ areas, metrics, areaTargets, setCell, canEdit, flashCells }: Props) {
  // 合計行 (参考、readonly)
  const totals: Record<string, number> = {};
  for (const m of metrics) totals[m.key] = 0;
  for (const a of areas) {
    const at = areaTargets[a.id];
    if (!at) continue;
    for (const m of metrics) totals[m.key] += Number(at[m.key as keyof Targets] ?? 0);
  }

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #d1fae5",
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr style={{ background: "#ecfdf5" }}>
              <th
                style={{
                  padding: "8px 12px", fontSize: 11, fontWeight: 700,
                  color: "#065f46", textAlign: "left", borderBottom: "1px solid #d1fae5",
                  whiteSpace: "nowrap",
                }}
              >
                エリア
              </th>
              {metrics.map((m) => (
                <th
                  key={m.key}
                  style={{
                    padding: "8px 12px", fontSize: 11, fontWeight: 700,
                    color: "#065f46", textAlign: "right", borderBottom: "1px solid #d1fae5",
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((a) => {
              const at = areaTargets[a.id] ?? emptyTargets();
              const isFlashing = flashCells.has(`${a.id}::__row__`);
              return (
                <tr
                  key={a.id}
                  style={{
                    background: isFlashing ? "#d1fae5" : "transparent",
                    transition: "background 0.4s ease",
                  }}
                >
                  <td
                    style={{
                      padding: "8px 12px", fontSize: 13, fontWeight: 700, color: "#111",
                      borderBottom: "1px solid #f5faf5", whiteSpace: "nowrap",
                    }}
                  >
                    {a.name}
                  </td>
                  {metrics.map((m) => {
                    const v = Number(at[m.key as keyof Targets] ?? 0);
                    return (
                      <td
                        key={m.key}
                        style={{
                          padding: "6px 8px", borderBottom: "1px solid #f5faf5",
                          textAlign: "right",
                        }}
                      >
                        {canEdit ? (
                          <input
                            type="number"
                            step={m.unit === "percent" ? "0.1" : "1"}
                            value={v || ""}
                            placeholder="0"
                            onChange={(e) => setCell(a.id, m.key as keyof Targets, e.target.value)}
                            style={{
                              width: "100%", maxWidth: 130, height: 30,
                              border: "1px solid #d1fae5", borderRadius: 6,
                              padding: "0 8px", fontSize: 12, fontWeight: 600,
                              textAlign: "right", color: "#111", background: "#fff",
                              outline: "none",
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#111" }}>
                            {formatByUnit(m.unit, v)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* 合計行 (参考、readonly) */}
            <tr style={{ background: "#fafffe" }}>
              <td
                style={{
                  padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#065f46",
                  borderTop: "2px solid #d1fae5", whiteSpace: "nowrap",
                }}
              >
                合計（参考）
              </td>
              {metrics.map((m) => (
                <td
                  key={m.key}
                  style={{
                    padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#065f46",
                    borderTop: "2px solid #d1fae5", textAlign: "right", whiteSpace: "nowrap",
                  }}
                >
                  {formatByUnit(m.unit, totals[m.key])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 集計用: 全 MetricKey を 0 で初期化した Record を返す。
// PR #49a 以前は呼び出し元が 6 キーをハードコードしていたが、14 キーに拡張する
// と毎回書き換えが必要になるため共通化。
function emptyMetricRow(): Record<MetricKey, number> {
  const row = {} as Record<MetricKey, number>;
  for (const m of METRICS) row[m.key] = 0;
  return row;
}

// PR #49b: 業態別に表示するメトリクスサブセットを返す。
// 反さん仕様 (memory #15, 5/17 確定 + PR #53 追加):
//   - 水道 / 電気 : 全 14 項目を表示 (電気の分電盤件数 target は Phase 4)
//   - 鍵         : 工事取得率を ADS から除外 (鍵に施工概念なし)
//   - ロード     : 工事取得率を除外 + HELP セクション全体を非表示
//   - 探偵       : 工事取得率を除外 + HELP 非表示 + 面談ファネル追加 (PR #53)
//                  + 「成約率目標」ラベルは「アポ獲得率目標」として読替
//
// 各セクションが null を返した場合、呼び出し元 (TargetsSections) は
// レンダリング自体をスキップする。
function getMetricsForCategory(category: BusinessCategory): {
  sales: MetricDef[];
  ads: MetricDef[];
  help: MetricDef[] | null;
  meeting: MetricDef[] | null;
  electric: MetricDef[] | null;
} {
  const hideConstructionRate = category === "locksmith" || category === "road" || category === "detective";
  const hideHelp = category === "road" || category === "detective";
  const showMeeting = category === "detective";
  const showElectric = category === "electric";

  // 探偵の ADS では targetConversionRate のラベルを「アポ獲得率目標」に読替
  let ads = ADS_METRICS;
  if (hideConstructionRate) ads = ads.filter((m) => m.key !== "targetConstructionRate");
  if (category === "detective") {
    ads = ads.map((m) => m.key === "targetConversionRate"
      ? { ...m, label: "アポ獲得率目標" }
      : m);
  }

  return {
    sales: SALES_METRICS,
    ads,
    help: hideHelp ? null : HELP_METRICS,
    meeting: showMeeting ? MEETING_METRICS : null,
    electric: showElectric ? ELECTRIC_METRICS : null,
  };
}

// 業態別のフラットなメトリクス一覧 (グループビュー / CSV エクスポート / 一括設定で使用)
function getAllMetricsForCategory(category: BusinessCategory): MetricDef[] {
  const { sales, ads, help, meeting, electric } = getMetricsForCategory(category);
  return [...sales, ...ads, ...(help ?? []), ...(meeting ?? []), ...(electric ?? [])];
}

export {
  METRICS as TARGETS_METRICS,
  SALES_METRICS, ADS_METRICS, HELP_METRICS, MEETING_METRICS, ELECTRIC_METRICS,
  formatYen, formatYenRaw, formatCount, formatPercent, formatByUnit,
  emptyMetricRow,
  getMetricsForCategory, getAllMetricsForCategory,
};
export type { MetricKey, MetricDef, MetricUnit };
