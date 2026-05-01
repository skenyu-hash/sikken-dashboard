"use client";
// 会社別ビュー（readonly）。
// 各会社が持つ (category, areaId) ペアの targets を集計表示。
// 編集は事業別ビューで実施するルール（confirm 3 受領通り）。
//
// COMPANIES（app/lib/companies.ts）は7社定義済（mavericks/toplevel/rexia/
// dunk/ulua/grits/sikken）。

import { useEffect, useMemo, useState } from "react";
import { COMPANIES } from "../../lib/companies";
import { AREA_NAMES, BUSINESSES, type BusinessCategory } from "../../lib/businesses";
import { emptyTargets, type Targets } from "../../lib/calculations";
import { TARGETS_METRICS, formatByUnit, type MetricKey } from "./TargetsMatrix";

type Props = {
  activeCompanyId: string;
  year: number;
  month: number;
  onChangeBusinessRequest?: (category: BusinessCategory, areaId: string) => void;
};

type CompanyAreaTargets = Record<string, Targets>; // key: `${category}::${areaId}`

function pairKey(category: string, areaId: string): string {
  return `${category}::${areaId}`;
}

function bizLabel(id: string): string {
  return BUSINESSES.find((b) => b.id === id)?.label ?? id;
}

export default function TargetsCompanyView({ activeCompanyId, year, month, onChangeBusinessRequest }: Props) {
  const company = useMemo(
    () => COMPANIES.find((c) => c.id === activeCompanyId),
    [activeCompanyId]
  );
  const [pairs, setPairs] = useState<CompanyAreaTargets>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company) {
      setPairs({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      company.areas.map(async (p) => {
        const res = await fetch(
          `/api/targets?area=${p.areaId}&year=${year}&month=${month}&category=${p.category}`
        );
        const j = res.ok ? await res.json() : { targets: emptyTargets() };
        return [pairKey(p.category, p.areaId), { ...emptyTargets(), ...(j.targets ?? {}) }] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const map: CompanyAreaTargets = {};
      for (const [k, t] of entries) map[k] = t;
      setPairs(map);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [company, year, month]);

  // 会社合計
  const totals = useMemo(() => {
    const t: Record<MetricKey, number> = {
      targetSales: 0, targetProfit: 0, targetAdCost: 0,
      targetCount: 0, targetHelpSales: 0, targetHelpCount: 0,
    };
    for (const k of Object.keys(pairs)) {
      for (const m of TARGETS_METRICS) t[m.key] += Number(pairs[k][m.key] ?? 0);
    }
    return t;
  }, [pairs]);

  if (!company) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
        会社が選択されていません
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
        {company.name} の目標を集計中...
      </div>
    );
  }

  return (
    <div>
      {/* 会社サマリーバナー */}
      <div
        style={{
          background: "linear-gradient(135deg, #1B5E3F, #047857)",
          color: "#fff",
          borderRadius: 12,
          padding: "18px 24px",
          marginBottom: 16,
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.75, marginBottom: 12, letterSpacing: "0.06em" }}>
          {company.name} ({year}年{month}月) — 参照のみ・編集は事業別ビューで
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <BannerKpi label="売上目標合計" value={`¥${totals.targetSales.toLocaleString()}`} />
          <BannerKpi label="粗利目標合計" value={`¥${totals.targetProfit.toLocaleString()}`} />
          <BannerKpi
            label="平均粗利率目標"
            value={
              totals.targetSales > 0
                ? `${((totals.targetProfit / totals.targetSales) * 100).toFixed(1)}%`
                : "—"
            }
          />
        </div>
      </div>

      {/* 事業×エリア別の readonly テーブル */}
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
          {company.name} — 事業×エリア別目標値
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "#fafffe" }}>
                <th style={th()}>事業</th>
                <th style={th()}>エリア</th>
                {TARGETS_METRICS.map((m) => (
                  <th key={m.key} style={th("right")}>{m.label}</th>
                ))}
                <th style={th("center")}>編集</th>
              </tr>
            </thead>
            <tbody>
              {company.areas.map((p) => {
                const key = pairKey(p.category, p.areaId);
                const t = pairs[key] ?? emptyTargets();
                return (
                  <tr key={key}>
                    <td style={tdLabel()}>{bizLabel(p.category)}</td>
                    <td style={tdLabel()}>{AREA_NAMES[p.areaId] ?? p.areaId}</td>
                    {TARGETS_METRICS.map((m) => {
                      const v = Number(t[m.key] ?? 0);
                      return (
                        <td key={m.key} style={tdValue(v === 0)}>
                          {formatByUnit(m.unit, v)}
                        </td>
                      );
                    })}
                    <td style={{ ...tdValue(false), textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeBusinessRequest?.(p.category as BusinessCategory, p.areaId)
                        }
                        style={{
                          fontSize: 10, padding: "4px 10px", borderRadius: 6,
                          background: "#FFFFFF", border: "1px solid #1B5E3F",
                          color: "#1B5E3F", cursor: "pointer", fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        事業別で編集 →
                      </button>
                    </td>
                  </tr>
                );
              })}
              {/* 会社合計 */}
              <tr style={{ background: "#ecfdf5" }}>
                <td
                  colSpan={2}
                  style={{
                    ...tdLabel(), fontWeight: 800, color: "#065f46",
                    borderTop: "2px solid #d1fae5",
                  }}
                >
                  会社合計
                </td>
                {TARGETS_METRICS.map((m) => (
                  <td
                    key={m.key}
                    style={{
                      ...tdValue(false),
                      fontWeight: 800, color: "#065f46",
                      borderTop: "2px solid #d1fae5",
                    }}
                  >
                    {formatByUnit(m.unit, totals[m.key])}
                  </td>
                ))}
                <td style={{ borderTop: "2px solid #d1fae5" }} />
              </tr>
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
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function th(align: "left" | "right" | "center" = "left"): React.CSSProperties {
  return {
    padding: "8px 12px", fontSize: 11, fontWeight: 700,
    color: "#065f46", textAlign: align, borderBottom: "1px solid #d1fae5",
    whiteSpace: "nowrap",
  };
}
function tdLabel(): React.CSSProperties {
  return {
    padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#111",
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
