"use client";
// グループ全体ビュー: 事業別モードでエリアタブ「グループ全体」選択時の表示。
//
// 構成:
// 1) トップバナー（黒緑グラデ）: グループ売上目標 / 粗利目標 / 平均粗利率目標
// 2) エリア別目標値テーブル（readonly + 合計行）
// 3) 業態別クロス比較表（業態×指標、グループ計列を強調）
//
// データ取得: /api/targets を全 (5業態 × 8エリア) について Promise.all で並列取得。
// API 拡張は最小限の方針のため、business_category 別 fetch を5回並列実行する。

import { useEffect, useMemo, useState } from "react";
import { emptyTargets, type Targets } from "../../lib/calculations";
import { BUSINESSES, AREA_NAMES, type BusinessCategory } from "../../lib/businesses";
import { TARGETS_METRICS, formatYen, formatCount, formatByUnit, type MetricKey } from "./TargetsMatrix";

type Area = { id: string; name: string };

type Props = {
  areas: Area[]; // 表示中の事業に紐付くエリア（合計行用）
  category: BusinessCategory; // 現在選択中の業態（表示は全業態だが context で使用）
  year: number;
  month: number;
};

type ByCategoryByArea = Record<string, Record<string, Targets>>;

const ALL_BUSINESSES = BUSINESSES;
const ALL_AREA_IDS = Object.keys(AREA_NAMES);

export default function TargetsGroupView({ year, month, category }: Props) {
  const [data, setData] = useState<ByCategoryByArea>({});
  const [loading, setLoading] = useState(true);
  const categoryLabel = useMemo(
    () => BUSINESSES.find((b) => b.id === category)?.label ?? "",
    [category]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 全 5業態 × 全 8エリア の targets を並列取得
    const tasks: Array<Promise<readonly [string, string, Targets]>> = [];
    for (const biz of ALL_BUSINESSES) {
      for (const aId of biz.areas) {
        tasks.push(
          fetch(`/api/targets?area=${aId}&year=${year}&month=${month}&category=${biz.id}`)
            .then((r) => (r.ok ? r.json() : { targets: emptyTargets() }))
            .then(
              (j) =>
                [biz.id, aId, { ...emptyTargets(), ...(j.targets ?? {}) }] as const
            )
        );
      }
    }
    Promise.all(tasks).then((entries) => {
      if (cancelled) return;
      const map: ByCategoryByArea = {};
      for (const [bizId, aId, t] of entries) {
        if (!map[bizId]) map[bizId] = {};
        map[bizId][aId] = t;
      }
      setData(map);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  // トップバナー用: 選択業態のグループ全体合計（業態タブに追従）
  const groupTotals = useMemo(() => {
    let sales = 0,
      profit = 0;
    const byArea = data[category];
    if (byArea) {
      for (const aId of Object.keys(byArea)) {
        sales += Number(byArea[aId].targetSales ?? 0);
        profit += Number(byArea[aId].targetProfit ?? 0);
      }
    }
    const margin = sales > 0 ? Math.round((profit / sales) * 1000) / 10 : 0;
    return { sales, profit, margin };
  }, [data, category]);

  // エリア別テーブル用: 選択業態の全エリア値（業態タブに追従）
  const areaSummary = useMemo(() => {
    const result: Record<string, Record<MetricKey, number>> = {};
    const byArea = data[category] ?? {};
    for (const aId of ALL_AREA_IDS) {
      const row: Record<MetricKey, number> = {
        targetSales: 0, targetProfit: 0, targetAdCost: 0,
        targetCount: 0, targetHelpSales: 0, targetHelpCount: 0,
      };
      const t = byArea[aId];
      if (t) {
        for (const m of TARGETS_METRICS) row[m.key] += Number(t[m.key] ?? 0);
      }
      result[aId] = row;
    }
    return result;
  }, [data, category]);

  // 業態別クロス: 業態×指標、グループ計列含む
  const cross = useMemo(() => {
    const result: Record<string, Record<MetricKey, number>> = {};
    for (const biz of ALL_BUSINESSES) {
      const row: Record<MetricKey, number> = {
        targetSales: 0, targetProfit: 0, targetAdCost: 0,
        targetCount: 0, targetHelpSales: 0, targetHelpCount: 0,
      };
      const byArea = data[biz.id] ?? {};
      for (const aId of Object.keys(byArea)) {
        for (const m of TARGETS_METRICS) row[m.key] += Number(byArea[aId][m.key] ?? 0);
      }
      result[biz.id] = row;
    }
    // グループ計
    const totalRow: Record<MetricKey, number> = {
      targetSales: 0, targetProfit: 0, targetAdCost: 0,
      targetCount: 0, targetHelpSales: 0, targetHelpCount: 0,
    };
    for (const biz of ALL_BUSINESSES) {
      for (const m of TARGETS_METRICS) totalRow[m.key] += result[biz.id][m.key];
    }
    return { byBiz: result, total: totalRow };
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
        グループ全体の目標を集計中...
      </div>
    );
  }

  return (
    <div>
      {/* トップバナー */}
      <div
        style={{
          background: "linear-gradient(135deg, #064e3b, #1B5E3F)",
          color: "#fff",
          borderRadius: 12,
          padding: "20px 24px",
          marginBottom: 16,
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, marginBottom: 12, letterSpacing: "0.06em" }}>
          {categoryLabel} グループ目標 ({year}年{month}月)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <BannerKpi label={`${categoryLabel} 売上目標`} value={formatYen(groupTotals.sales)} />
          <BannerKpi label={`${categoryLabel} 粗利目標`} value={formatYen(groupTotals.profit)} />
          <BannerKpi
            label="平均粗利率目標"
            value={groupTotals.sales > 0 ? `${groupTotals.margin.toFixed(1)}%` : "—"}
          />
        </div>
      </div>

      {/* エリア別目標値テーブル（readonly） */}
      <div
        style={{
          background: "#fff", borderRadius: 10, border: "1px solid #d1fae5",
          marginBottom: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            background: "#ecfdf5", padding: "8px 14px", borderBottom: "1px solid #d1fae5",
            fontSize: 11, fontWeight: 700, color: "#065f46",
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}
        >
          {categoryLabel} エリア別目標値（参照のみ）
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "#fafffe" }}>
                <th style={th()}>エリア</th>
                {TARGETS_METRICS.map((m) => (
                  <th key={m.key} style={th("right")}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_AREA_IDS.map((aId) => {
                const row = areaSummary[aId];
                const hasAny = TARGETS_METRICS.some((m) => row[m.key] > 0);
                return (
                  <tr key={aId}>
                    <td style={tdLabel()}>{AREA_NAMES[aId]}</td>
                    {TARGETS_METRICS.map((m) => (
                      <td key={m.key} style={tdValue(!hasAny)}>
                        {formatByUnit(m.unit, row[m.key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {/* 業態合計（選択業態のみ） */}
              <tr style={{ background: "#ecfdf5" }}>
                <td style={{ ...tdLabel(), fontWeight: 800, color: "#065f46", borderTop: "2px solid #d1fae5" }}>
                  {categoryLabel} 計
                </td>
                {TARGETS_METRICS.map((m) => {
                  const total = ALL_AREA_IDS.reduce((s, aId) => s + areaSummary[aId][m.key], 0);
                  return (
                    <td
                      key={m.key}
                      style={{
                        ...tdValue(false),
                        fontWeight: 800, color: "#065f46",
                        borderTop: "2px solid #d1fae5",
                      }}
                    >
                      {formatByUnit(m.unit, total)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 業態別クロス比較表 */}
      <div
        style={{
          background: "#fff", borderRadius: 10, border: "1px solid #d1fae5",
          overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            background: "#ecfdf5", padding: "8px 14px", borderBottom: "1px solid #d1fae5",
            fontSize: 11, fontWeight: 700, color: "#065f46",
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}
        >
          業態別クロス比較（参照のみ）
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "#fafffe" }}>
                <th style={th()}>指標</th>
                {ALL_BUSINESSES.map((b) => (
                  <th key={b.id} style={th("right")}>{b.label}</th>
                ))}
                <th style={{ ...th("right"), background: "#d1fae5", color: "#065f46" }}>
                  グループ計
                </th>
              </tr>
            </thead>
            <tbody>
              {TARGETS_METRICS.map((m) => (
                <tr key={m.key}>
                  <td style={tdLabel()}>{m.label}</td>
                  {ALL_BUSINESSES.map((b) => (
                    <td key={b.id} style={tdValue(cross.byBiz[b.id][m.key] === 0)}>
                      {formatByUnit(m.unit, cross.byBiz[b.id][m.key])}
                    </td>
                  ))}
                  <td
                    style={{
                      ...tdValue(false),
                      background: "#ecfdf5",
                      fontWeight: 800, color: "#065f46",
                    }}
                  >
                    {formatByUnit(m.unit, cross.total[m.key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BannerKpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function th(align: "left" | "right" = "left"): React.CSSProperties {
  return {
    padding: "8px 12px", fontSize: 11, fontWeight: 700,
    color: "#065f46", textAlign: align, borderBottom: "1px solid #d1fae5",
    whiteSpace: "nowrap",
  };
}
function tdLabel(): React.CSSProperties {
  return {
    padding: "8px 12px", fontSize: 13, fontWeight: 700, color: "#111",
    borderBottom: "1px solid #f5faf5", whiteSpace: "nowrap",
  };
}
function tdValue(empty: boolean): React.CSSProperties {
  return {
    padding: "8px 12px", fontSize: 12,
    fontWeight: empty ? 500 : 600,
    color: empty ? "#d1d5db" : "#111",
    textAlign: "right", borderBottom: "1px solid #f5faf5", whiteSpace: "nowrap",
  };
}

// formatYen は意図的に未使用（formatByUnit 経由で参照）
void formatYen;
void formatCount;
