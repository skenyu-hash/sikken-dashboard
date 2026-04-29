"use client";

import { useMemo, useState, useEffect } from "react";
import {
  calculateBreakeven, calculateDashboard, calculateDriver,
  type DailyEntry, type DriverInputs, type FixedCosts, yen,
} from "../lib/calculations";
import { useRole } from "../components/RoleProvider";

const DEFAULT: DriverInputs = {
  adCost: 1_000_000,
  cpa: 15_000,
  closingRate: 50,
  lightRatio: 30, constRatio: 50, helpRatio: 20,
  lightUnit: 30_000, constUnit: 200_000, helpUnit: 80_000,
  lightMargin: 60, constMargin: 35, helpMargin: 50,
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  background: "#ecfdf5", padding: "8px 14px",
  fontSize: 11, fontWeight: 700, color: "#065f46",
  textTransform: "uppercase", letterSpacing: "0.07em",
  borderBottom: "1px solid #d1fae5",
};
const CARD_STYLE: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #d1fae5", overflow: "hidden",
};

export default function DriverPage() {
  const role = useRole();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [d, setD] = useState<DriverInputs>(DEFAULT);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [fixed, setFixed] = useState<FixedCosts>({ laborCost: 0, rent: 0, other: 0 });

  useEffect(() => {
    const ids = ["kansai", "kanto", "nagoya", "kyushu", "kitakanto", "hokkaido", "chugoku", "shizuoka"];
    Promise.all(
      ids.map((id) =>
        fetch(`/api/entries?area=${id}&year=${year}&month=${month}`)
          .then((r) => (r.ok ? r.json() : { entries: [] }))
      )
    ).then((rs: { entries: DailyEntry[] }[]) => {
      const all = rs.flatMap((r) => r.entries ?? []);
      setEntries(all);
      let adCost = 0, count = 0, helpCount = 0, constructionCount = 0;
      for (const e of all) {
        adCost += e.adCost ?? 0;
        count += e.totalCount;
        helpCount += e.helpCount ?? 0;
        constructionCount += e.constructionCount;
      }
      const lightCount = Math.max(0, count - constructionCount - helpCount);
      const total = Math.max(1, count);
      setD((prev) => ({
        ...prev,
        adCost: adCost > 0 ? adCost : prev.adCost,
        lightRatio: Math.round((lightCount / total) * 100),
        constRatio: Math.round((constructionCount / total) * 100),
        helpRatio: Math.round((helpCount / total) * 100),
      }));
    });
    fetch(`/api/fixed-costs?area=kansai&year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : { fixedCosts: { laborCost: 0, rent: 0, other: 0 } }))
      .then((j: { fixedCosts: FixedCosts }) => setFixed(j.fixedCosts));
  }, [year, month]);

  const result = useMemo(() => calculateDriver(d), [d]);
  const summary = useMemo(
    () => calculateDashboard(entries, year, month, now),
    [entries, year, month] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const be = useMemo(() => calculateBreakeven(fixed, summary), [fixed, summary]);
  const diff = result.grossProfit - be.fixedTotal;
  const mixTotal = d.lightRatio + d.constRatio + d.helpRatio;

  if (role && role !== "executive") {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#9ca3af" }}>
        このページは役員のみアクセス可能です
      </div>
    );
  }

  function update<K extends keyof DriverInputs>(k: K, v: number) {
    setD((prev) => ({ ...prev, [k]: v }));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2" }}>
      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)", padding: "16px 24px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>利益ドライバーモデル</h1>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
          スライダー操作でリアルタイム試算 ／ {year}年{month}月
        </p>
      </div>

      {/* ボディ: 2列 */}
      <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* 左: パラメータ */}
        <div style={CARD_STYLE}>
          <div style={SECTION_TITLE_STYLE}>パラメータ設定</div>
          <div style={{ padding: 12 }}>
            <SliderGroup title="広告・集客">
              <Slider label="広告費" value={d.adCost} min={0} max={5_000_000} step={50_000}
                format={yen} onChange={(v) => update("adCost", v)} />
              <Slider label="CPA(獲得単価)" value={d.cpa} min={5_000} max={50_000} step={500}
                format={yen} onChange={(v) => update("cpa", v)} />
              <Slider label="成約率" value={d.closingRate} min={0} max={100} step={1}
                format={(v) => `${v}%`} onChange={(v) => update("closingRate", v)} />
            </SliderGroup>

            <SliderGroup title={`案件ミックス (合計: ${mixTotal}%)`} warn={mixTotal !== 100}>
              <Slider label="軽作業比率" value={d.lightRatio} min={0} max={100} step={1}
                format={(v) => `${v}%`} onChange={(v) => update("lightRatio", v)} />
              <Slider label="工事率" value={d.constRatio} min={0} max={100} step={1}
                format={(v) => `${v}%`} onChange={(v) => update("constRatio", v)} />
              <Slider label="HELP率" value={d.helpRatio} min={0} max={100} step={1}
                format={(v) => `${v}%`} onChange={(v) => update("helpRatio", v)} />
            </SliderGroup>

            <SliderGroup title="単価">
              <Slider label="軽作業単価" value={d.lightUnit} min={10_000} max={500_000} step={5_000}
                format={yen} onChange={(v) => update("lightUnit", v)} />
              <Slider label="工事単価" value={d.constUnit} min={10_000} max={500_000} step={5_000}
                format={yen} onChange={(v) => update("constUnit", v)} />
              <Slider label="HELP単価" value={d.helpUnit} min={10_000} max={500_000} step={5_000}
                format={yen} onChange={(v) => update("helpUnit", v)} />
            </SliderGroup>

            <SliderGroup title="粗利率">
              <Slider label="軽作業粗利率" value={d.lightMargin} min={0} max={100} step={1}
                format={(v) => `${v}%`} onChange={(v) => update("lightMargin", v)} />
              <Slider label="工事粗利率" value={d.constMargin} min={0} max={100} step={1}
                format={(v) => `${v}%`} onChange={(v) => update("constMargin", v)} />
              <Slider label="HELP粗利率" value={d.helpMargin} min={0} max={100} step={1}
                format={(v) => `${v}%`} onChange={(v) => update("helpMargin", v)} />
            </SliderGroup>
          </div>
        </div>

        {/* 右: 試算結果 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={CARD_STYLE}>
            <div style={SECTION_TITLE_STYLE}>試算結果</div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}>
                <BigCard label="予測売上" value={yen(result.revenue)} />
                <BigCard label="予測粗利" value={yen(result.grossProfit)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <MiniCard label="予測件数" value={`${result.deals} 件`} />
                <MiniCard label="平均客単価" value={yen(result.avgUnit)} />
                <MiniCard label="平均粗利率" value={`${result.avgMargin.toFixed(1)}%`} />
              </div>
              <div
                style={{
                  borderRadius: 8, padding: "12px 14px",
                  background: diff >= 0 ? "#d1fae5" : "#fee2e2",
                  color: diff >= 0 ? "#064e3b" : "#7f1d1d",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.8 }}>
                  損益分岐との差分
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
                  {diff >= 0 ? "+" : ""}{yen(diff)}
                </div>
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                  固定費 {yen(be.fixedTotal)} ／ 予測広告費 {yen(requiredAdCost(d, be.fixedTotal))} で達成
                </div>
              </div>
            </div>
          </div>

          <div style={CARD_STYLE}>
            <div style={SECTION_TITLE_STYLE}>シミュレーション vs 実績</div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "28%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#f8fdf8" }}>
                  {["指標", "シミュ", "実績", "差分"].map((h) => (
                    <th key={h} style={{
                      padding: "6px 8px", fontSize: 9, fontWeight: 700, color: "#9ca3af",
                      textTransform: "uppercase", letterSpacing: "0.06em",
                      borderBottom: "1px solid #f0faf0",
                      textAlign: h === "指標" ? "left" : "right",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <DiffRow label="売上" sim={result.revenue} actual={summary.totalRevenue} kind="yen" />
                <DiffRow label="粗利" sim={result.grossProfit} actual={summary.totalProfit} kind="yen" />
                <DiffRow label="件数" sim={result.deals} actual={summary.totalCount} kind="count" />
                <DiffRow label="客単価" sim={result.avgUnit} actual={summary.companyUnitPrice} kind="yen" />
                <DiffRow label="粗利率" sim={result.avgMargin} actual={summary.grossMargin} kind="pct" />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SliderGroup({
  title, warn, children,
}: { title: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#f8fdf8", borderRadius: 8, padding: 10, marginBottom: 10,
      border: warn ? "1px solid #fef9c3" : "1px solid transparent",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: warn ? "#713f12" : "#065f46",
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Slider({
  label, value, min, max, step, format, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "#374151" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>{format(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#059669" }}
      />
    </div>
  );
}

function BigCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#ecfdf5", borderRadius: 8, padding: "10px 14px",
      borderLeft: "3px solid #059669",
    }}>
      <div style={{ fontSize: 10, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#059669", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#f8fdf8", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#111", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function requiredAdCost(d: DriverInputs, fixedTotal: number): number {
  const lr = d.lightRatio / 100, cr = d.constRatio / 100, hr = d.helpRatio / 100;
  const profitPerDeal =
    lr * d.lightUnit * (d.lightMargin / 100) +
    cr * d.constUnit * (d.constMargin / 100) +
    hr * d.helpUnit * (d.helpMargin / 100);
  if (profitPerDeal <= 0 || d.closingRate <= 0) return 0;
  const dealsNeeded = fixedTotal / profitPerDeal;
  const leadsNeeded = dealsNeeded / (d.closingRate / 100);
  return Math.round(leadsNeeded * d.cpa);
}

function DiffRow({
  label, sim, actual, kind,
}: { label: string; sim: number; actual: number; kind: "yen" | "count" | "pct" }) {
  const fmt = (v: number) =>
    kind === "yen" ? yen(v) : kind === "pct" ? `${v.toFixed(1)}%` : `${v}件`;
  const diff = sim - actual;
  const color = diff > 0 ? "#059669" : diff < 0 ? "#dc2626" : "#9ca3af";
  return (
    <tr style={{ borderBottom: "1px solid #f5faf5" }}>
      <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 700, color: "#111" }}>{label}</td>
      <td style={{ padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{fmt(sim)}</td>
      <td style={{ padding: "6px 8px", fontSize: 11, textAlign: "right" }}>{fmt(actual)}</td>
      <td style={{ padding: "6px 8px", fontSize: 11, fontWeight: 700, textAlign: "right", color }}>
        {diff > 0 ? "+" : ""}{fmt(diff)}
      </td>
    </tr>
  );
}
