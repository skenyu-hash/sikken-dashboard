"use client";
import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, getDaysElapsed, yen,
  type DailyEntry, type DashboardSummary, type Targets, emptyTargets,
} from "../lib/calculations";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type MetricKey = "revenue" | "profit" | "profitRate" | "count" | "unitPrice" | "constructionRate" | "adRate" | "helpRate" | "convRate";

type AreaSummary = {
  area: { id: string; name: string };
  summary: DashboardSummary;
  values: Record<MetricKey, number>;
  targetValues: Partial<Record<MetricKey, number | null>>;
  profitRate: number;
  adRate: number;
  helpRate: number;
  convRate: number;
};

export default function RankingPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const daysElapsed = getDaysElapsed(now, year, month);

  const [allEntries, setAllEntries] = useState<Record<string, DailyEntry[]>>({});
  const [allTargets, setAllTargets] = useState<Record<string, Targets>>({});

  useEffect(() => {
    Promise.all(AREAS.map(async (a) => {
      const [eRes, tRes] = await Promise.all([
        fetch(`/api/entries?area=${a.id}&year=${year}&month=${month}`),
        fetch(`/api/targets?area=${a.id}&year=${year}&month=${month}`),
      ]);
      const eJson = eRes.ok ? await eRes.json() : { entries: [] };
      const tJson = tRes.ok ? await tRes.json() : { targets: emptyTargets() };
      return [a.id, eJson.entries ?? [], { ...emptyTargets(), ...tJson.targets }] as const;
    })).then((results) => {
      const em: Record<string, DailyEntry[]> = {};
      const tm: Record<string, Targets> = {};
      for (const [id, entries, targets] of results) { em[id] = entries; tm[id] = targets; }
      setAllEntries(em);
      setAllTargets(tm);
    });
  }, [year, month]);

  const areaSummaries: AreaSummary[] = useMemo(() => {
    return AREAS.map((a) => {
      const entries = allEntries[a.id] ?? [];
      const tgts = allTargets[a.id] ?? emptyTargets();
      const summary = calculateDashboard(entries, year, month, now);
      const adRate = summary.totalRevenue > 0 ? summary.totalAdCost / summary.totalRevenue * 100 : 0;
      const profitRate = summary.totalRevenue > 0 ? summary.totalProfit / summary.totalRevenue * 100 : 0;
      const callCount = entries.reduce((s, e) => s + (e.insourceCount ?? 0) + (e.outsourceCount ?? 0), 0);
      const helpRate = summary.totalCount > 0 ? summary.help.count / summary.totalCount * 100 : 0;
      const convRate = callCount > 0 ? summary.totalCount / callCount * 100 : 0;
      const values: Record<MetricKey, number> = {
        revenue: summary.totalRevenue, profit: summary.totalProfit, profitRate,
        count: summary.totalCount, unitPrice: summary.companyUnitPrice,
        constructionRate: summary.constructionRate, adRate, helpRate, convRate,
      };
      const r = (a: number, b: number) => b > 0 ? Math.round(a / b * 1000) / 10 : null;
      const targetValues: Partial<Record<MetricKey, number | null>> = {
        revenue: r(summary.totalRevenue, tgts.targetSales),
        profit: r(summary.totalProfit, tgts.targetProfit),
        profitRate: tgts.targetSales > 0 && tgts.targetProfit > 0 ? r(profitRate, tgts.targetProfit / tgts.targetSales * 100) : null,
        count: r(summary.totalCount, tgts.targetCount),
        unitPrice: r(summary.companyUnitPrice, tgts.targetUnitPrice),
        constructionRate: r(summary.constructionRate, tgts.targetConstructionRate),
        adRate: r(adRate, tgts.targetAdRate),
        helpRate: r(helpRate, tgts.targetHelpRate),
        convRate: r(convRate, tgts.targetConversionRate),
      };
      return { area: a, summary, values, targetValues, profitRate, adRate, helpRate, convRate };
    });
  }, [allEntries, allTargets, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const badge = (ratio: number | null) => {
    if (ratio === null) return <span style={{ color: "#d1d5db", fontSize: 9 }}>未設定</span>;
    const s = ratio >= 100
      ? { bg: "#d1fae5", color: "#065f46" }
      : ratio >= 80
      ? { bg: "#fef9c3", color: "#854d0e" }
      : { bg: "#fee2e2", color: "#991b1b" };
    return <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, borderRadius: 3, padding: "1px 5px", background: s.bg, color: s.color }}>{ratio.toFixed(1)}%</span>;
  };

  const sorted = (metric: MetricKey, invert = false) =>
    [...areaSummaries].sort((a, b) => invert
      ? a.values[metric] - b.values[metric]
      : b.values[metric] - a.values[metric]);

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)", padding: "16px 20px 14px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>エリアランキング</h1>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
          {year}年{month}月 ／ 経過{daysElapsed}日時点 ／ スクロールで全指標を確認
        </p>
      </div>
      <div style={{ padding: "16px 20px" }}>
        <RankingSection title="粗利率ランキング" metric="profitRate"
          ranked={sorted("profitRate")} formatVal={(v) => `${v.toFixed(1)}%`}
          subCol={{ label: "売上", fn: (a) => yen(a.values.revenue) }} />
        <RankingSection title="工事取得率ランキング" metric="constructionRate"
          ranked={sorted("constructionRate")} formatVal={(v) => `${v.toFixed(1)}%`}
          subCol={{ label: "工事件数", fn: (a) => `${Math.round(a.values.count * a.values.constructionRate / 100)}件` }} />
        <RankingSection title="HELP率ランキング" metric="helpRate"
          ranked={sorted("helpRate")} formatVal={(v) => `${v.toFixed(1)}%`}
          subCol={{ label: "HELP件数", fn: (a) => `${a.summary.help.count}件` }} />
        <RankingSection title="成約率ランキング" metric="convRate"
          ranked={sorted("convRate")} formatVal={(v) => `${v.toFixed(1)}%`}
          subCol={{ label: "件数", fn: (a) => `${a.values.count}件` }} />
        <RankingSection title="広告費率ランキング" subtitle="※ 低いほど優秀" metric="adRate"
          ranked={sorted("adRate", true)} formatVal={(v) => `${v.toFixed(1)}%`}
          subCol={{ label: "広告費", fn: (a) => yen(a.summary.totalAdCost) }} />
        <RankingSection title="客単価ランキング" metric="unitPrice"
          ranked={sorted("unitPrice")} formatVal={(v) => yen(v)}
          subCol={{ label: "件数", fn: (a) => `${a.values.count}件` }} />
        <RankingSection title="売上ランキング" subtitle="※ 規模依存指標" metric="revenue"
          ranked={sorted("revenue")} formatVal={(v) => yen(v)}
          subCol={{ label: "粗利率", fn: (a) => `${a.profitRate.toFixed(1)}%` }} />
      </div>
    </div>
  );
}

function RankingSection({ title, subtitle, metric, ranked, formatVal, subCol }: {
  title: string; subtitle?: string; metric: MetricKey;
  ranked: AreaSummary[]; formatVal: (v: number) => string;
  subCol: { label: string; fn: (a: AreaSummary) => string };
}) {
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const maxVal = ranked[0]?.values[metric] ?? 1;
  const medals = ["🥇", "🥈", "🥉"];
  const borderColors = ["#fbbf24", "#94a3b8", "#d97706"];
  const valColors = ["#d97706", "#475569", "#d97706"];

  const badge = (ratio: number | null) => {
    if (ratio === null) return <span style={{ color: "#d1d5db", fontSize: 9 }}>未設定</span>;
    const s = ratio >= 100
      ? { bg: "#d1fae5", color: "#065f46" }
      : ratio >= 80
      ? { bg: "#fef9c3", color: "#854d0e" }
      : { bg: "#fee2e2", color: "#991b1b" };
    return <span style={{ display: "inline-block", fontSize: 9, fontWeight: 700, borderRadius: 3, padding: "1px 5px", background: s.bg, color: s.color }}>{ratio.toFixed(1)}%</span>;
  };

  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
        {title}
        {subtitle && <span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{subtitle}</span>}
        <div style={{ flex: 1, height: 1, background: "#d1fae5" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        {top3.map((item, i) => {
          const barWidth = maxVal > 0 ? (item.values[metric] / maxVal) * 100 : 0;
          return (
            <div key={item.area.id} style={{ background: "#fff", borderRadius: 10,
              border: `${i === 0 ? 2 : 1.5}px solid ${borderColors[i]}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{medals[i]}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: borderColors[i] }}>{i + 1}位</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#111", marginBottom: 4 }}>{item.area.name}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: valColors[i], marginBottom: 6 }}>
                {formatVal(item.values[metric])}
              </div>
              <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, marginBottom: 6 }}>
                <div style={{ height: 4, borderRadius: 2, background: borderColors[i], width: `${barWidth}%` }} />
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {badge(item.targetValues[metric] ?? null)}
                <span>{subCol.label} {subCol.fn(item)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #d1fae5", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "8%" }} /><col style={{ width: "12%" }} />
            <col style={{ width: "14%" }} /><col style={{ width: "20%" }} />
            <col style={{ width: "12%" }} /><col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#ecfdf5" }}>
              {["順位", "エリア", "実績", "相対比率", "目標比", subCol.label].map((h, i) => (
                <th key={h} style={{
                  padding: "7px 10px", fontSize: 9, fontWeight: 700, color: "#6b7280",
                  textTransform: "uppercase" as const, letterSpacing: "0.06em",
                  borderBottom: "1px solid #d1fae5",
                  textAlign: i <= 1 || i === 0 ? (i === 0 ? "center" : "left") : "right",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rest.map((item, i) => {
              const rank = i + 4;
              const barWidth = maxVal > 0 ? (item.values[metric] / maxVal) * 100 : 0;
              const isLow = rank >= 7;
              return (
                <tr key={item.area.id} style={{ borderBottom: "1px solid #f0faf0" }}>
                  <td style={{ padding: "9px 10px", textAlign: "center" }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: "50%", margin: "0 auto",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 800,
                      background: isLow ? "#fee2e2" : rank <= 5 ? "#d1fae5" : "#fef9c3",
                      color: isLow ? "#991b1b" : rank <= 5 ? "#065f46" : "#854d0e",
                    }}>{rank}</div>
                  </td>
                  <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, color: "#111" }}>{item.area.name}</td>
                  <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, color: "#111", textAlign: "right" }}>
                    {formatVal(item.values[metric])}
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <div style={{ height: 5, background: "#f3f4f6", borderRadius: 3 }}>
                      <div style={{
                        height: 5, borderRadius: 3, width: `${barWidth}%`,
                        background: isLow ? "#dc2626" : rank <= 5 ? "#059669" : "#d97706",
                      }} />
                    </div>
                  </td>
                  <td style={{ padding: "9px 10px", textAlign: "right" }}>{badge(item.targetValues[metric] ?? null)}</td>
                  <td style={{ padding: "9px 10px", fontSize: 11, color: "#6b7280", textAlign: "right" }}>{subCol.fn(item)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
