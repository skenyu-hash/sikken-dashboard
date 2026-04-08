"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateDashboard, emptyTargets, getDaysInMonth,
  type DailyEntry, type Targets, yen,
} from "../lib/calculations";

const AREAS = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type Period = "10" | "20" | "end";
const periodLabel = (p: Period) => p === "10" ? "1〜10日" : p === "20" ? "1〜20日" : "末日まで";

function defaultPeriod(day: number): Period {
  if (day <= 10) return "10";
  if (day <= 20) return "20";
  return "end";
}

type LineColor = "green" | "blue" | "cyan" | "amber";
const lineCls: Record<LineColor, string> = {
  green: "border-l-4 border-emerald-600",
  blue: "border-l-4 border-blue-500",
  cyan: "border-l-4 border-cyan-600",
  amber: "border-l-4 border-amber-600",
};

type MetricKind = "yen" | "count" | "pct";

type Metric = {
  name: string;
  actual: number;
  target: number;
  kind: MetricKind;
  ln: LineColor;
  invert?: boolean; // コスト系: 低いほど良い
  comment?: string;
};

export default function MeetingPage() {
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = now.getDate();
  const daysInMonth = getDaysInMonth(year, month);

  const [areaId, setAreaId] = useState(AREAS[0].id);
  const [period, setPeriod] = useState<Period>(defaultPeriod(today));
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [targets, setTargets] = useState<Targets>(emptyTargets());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}`)
        .then((r) => (r.ok ? r.json() : { entries: [] })),
      fetch(`/api/targets?area=${areaId}&year=${year}&month=${month}`)
        .then((r) => (r.ok ? r.json() : { targets: emptyTargets() })),
    ]).then(([e, t]) => {
      if (cancelled) return;
      setEntries(e.entries ?? []);
      setTargets({ ...emptyTargets(), ...(t.targets ?? {}) });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [areaId, year, month, period]);

  const filtered = useMemo(() => {
    if (period === "end") return entries;
    const limit = period === "10" ? 10 : 20;
    return entries.filter((e) => Number(e.date.slice(8, 10)) <= limit);
  }, [entries, period]);

  const daysElapsed = period === "10" ? 10 : period === "20" ? 20 : Math.max(1, today);
  const summaryToday = useMemo(
    () => new Date(year, month - 1, daysElapsed),
    [year, month, daysElapsed]
  );
  const summary = useMemo(
    () => calculateDashboard(filtered, year, month, summaryToday),
    [filtered, year, month, summaryToday]
  );

  const totalCallCount = filtered.reduce(
    (s, e) => s + (e.insourceCount ?? 0) + (e.outsourceCount ?? 0), 0
  );
  const adRate = summary.totalRevenue > 0 ? (summary.totalAdCost / summary.totalRevenue) * 100 : 0;
  const grossMarginRate = summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;
  const targetGmr = targets.targetSales > 0 && targets.targetProfit > 0
    ? (targets.targetProfit / targets.targetSales) * 100 : 0;
  const helpRate = summary.totalCount > 0 ? (summary.help.count / summary.totalCount) * 100 : 0;
  const cpa = summary.totalCount > 0 ? Math.round(summary.totalAdCost / summary.totalCount) : 0;
  const callUnit = totalCallCount > 0 ? Math.round(summary.totalAdCost / totalCallCount) : 0;
  const conversionRate = totalCallCount > 0 ? (summary.totalCount / totalCallCount) * 100 : 0;

  const sec1: Metric[] = [
    { name: "全体売上", actual: summary.totalRevenue, target: targets.targetSales, kind: "yen", ln: "green" },
    { name: "全体粗利", actual: summary.totalProfit, target: targets.targetProfit, kind: "yen", ln: "green" },
    { name: "粗利率", actual: grossMarginRate, target: targetGmr, kind: "pct", ln: "green" },
    { name: "獲得件数", actual: summary.totalCount, target: targets.targetCount, kind: "count", ln: "blue" },
    { name: "客単価", actual: summary.companyUnitPrice, target: targets.targetUnitPrice, kind: "yen", ln: "green" },
    { name: "対応件数", actual: summary.totalCount, target: targets.targetCount, kind: "count", ln: "blue" },
  ];
  const sec2: Metric[] = [
    { name: "HELP売上", actual: summary.help.revenue, target: targets.targetHelpSales, kind: "yen", ln: "cyan" },
    { name: "HELP件数", actual: summary.help.count, target: targets.targetHelpCount, kind: "count", ln: "cyan" },
    { name: "HELP客単価", actual: summary.help.unitPrice, target: targets.targetHelpUnitPrice, kind: "yen", ln: "cyan" },
    { name: "HELP率", actual: helpRate, target: targets.targetHelpRate, kind: "pct", ln: "cyan" },
  ];
  const sec3: Metric[] = [
    { name: "広告費", actual: summary.totalAdCost, target: targets.targetAdCost, kind: "yen", ln: "amber", invert: true },
    { name: "広告費率", actual: adRate, target: targets.targetAdRate, kind: "pct", ln: "amber", invert: true },
    { name: "入電件数", actual: totalCallCount, target: targets.targetCallCount, kind: "count", ln: "blue" },
    { name: "入電単価", actual: callUnit, target: targets.targetCallUnitPrice, kind: "yen", ln: "amber", invert: true },
    { name: "獲得単価(CPA)", actual: cpa, target: targets.targetCpa, kind: "yen", ln: "amber", invert: true },
    { name: "工事取得率", actual: summary.constructionRate, target: targets.targetConstructionRate, kind: "pct", ln: "green" },
    { name: "成約率", actual: conversionRate, target: targets.targetConversionRate, kind: "pct", ln: "green" },
  ];

  function calc(m: Metric) {
    const forecast = m.kind === "pct"
      ? m.actual
      : Math.round((m.actual / Math.max(1, daysElapsed)) * daysInMonth);
    const achievement = m.target > 0 ? (forecast / m.target) * 100 : null;
    const diff = m.target > 0 ? forecast - m.target : 0;
    const remainingDays = Math.max(0, daysInMonth - daysElapsed);
    const perDay = remainingDays > 0 && m.target > 0 && m.kind !== "pct"
      ? (m.target - m.actual) / remainingDays
      : null;
    return { forecast, achievement, diff, perDay, remainingDays };
  }

  function fmt(v: number, kind: MetricKind): string {
    if (kind === "yen") return yen(v);
    if (kind === "pct") return `${(Math.round(v * 10) / 10).toFixed(1)}%`;
    return `${Math.round(v)}件`;
  }

  function badgeCls(achievement: number | null, invert: boolean): string {
    if (achievement === null) return "bg-zinc-100 text-zinc-500";
    const r = invert ? 200 - achievement : achievement;
    if (r >= 100) return "bg-emerald-100 text-emerald-700";
    if (r >= 90) return "bg-yellow-100 text-yellow-700";
    if (r >= 80) return "bg-orange-100 text-orange-700";
    return "bg-red-100 text-red-700";
  }

  function diffCls(diff: number, invert: boolean): string {
    const ok = invert ? diff <= 0 : diff >= 0;
    return ok ? "text-emerald-600" : "text-red-500";
  }

  const activeArea = AREAS.find((a) => a.id === areaId);

  return (
    <div className="min-h-screen pb-24" style={{ background: "#f2f5f2" }}>
      {/* ============ ヘッダー ============ */}
      <header style={{ background: "linear-gradient(135deg, #059669, #047857)", padding: "16px 24px 0" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <select
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="min-h-[40px] rounded-lg border border-white/30 bg-white/10 backdrop-blur px-3 text-sm text-white"
          >
            {AREAS.map((a) => (
              <option key={a.id} value={a.id} className="text-zinc-900">{a.name}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            {(["10", "20", "end"] as Period[]).map((p) => (
              <button
                key={p} type="button" onClick={() => setPeriod(p)}
                className={`min-h-[40px] px-3 rounded-lg text-sm font-semibold border whitespace-nowrap ${
                  period === p
                    ? "bg-white text-emerald-700 border-white"
                    : "bg-transparent text-white border-white/60"
                }`}
              >
                {p === "end" ? "末日" : `${p}日`}
              </button>
            ))}
          </div>
        </div>
        <div style={{ paddingBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>10日会議シート</h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
            {year}年{month}月 ／ {activeArea?.name} ／ {periodLabel(period)}
          </p>
        </div>
      </header>

      {loading && (
        <div className="px-4 mt-4 text-xs text-zinc-500 text-center">読み込み中...</div>
      )}

      {/* ============ 上段: 2列レイアウト ============ */}
      <div className="px-4 grid grid-cols-1 md:grid-cols-2" style={{ marginTop: 20, gap: 20 }}>
        {/* 左列: 売上・粗利・件数 */}
        <Section title="売上・粗利・件数" inGrid>
          <MetricsTable
            metrics={sec1}
            calc={calc} fmt={fmt} badgeCls={badgeCls} diffCls={diffCls}
          />
        </Section>

        {/* 右列: HELP部門 + 部門別実績 */}
        <div className="flex flex-col" style={{ gap: 20 }}>
          <Section title="HELP部門" inGrid>
            <MetricsTable
              metrics={sec2}
              calc={calc} fmt={fmt} badgeCls={badgeCls} diffCls={diffCls}
            />
          </Section>
          <Section title="部門別実績" inGrid>
            <DepartmentTable summary={summary} daysElapsed={daysElapsed} daysInMonth={daysInMonth} />
          </Section>
        </div>
      </div>

      {/* ============ 下段: 広告・効率指標 全幅 ============ */}
      <div style={{ marginTop: 20 }}>
      <Section title="広告・効率指標">
        <MetricsTable
          metrics={sec3}
          calc={calc} fmt={fmt} badgeCls={badgeCls} diffCls={diffCls}
        />
      </Section>
      </div>
    </div>
  );
}

function Section({
  title, children, inGrid,
}: { title: string; children: React.ReactNode; inGrid?: boolean }) {
  const wrapperCls = inGrid ? "" : "px-4";
  return (
    <section className={wrapperCls}>
      <div
        className="rounded-xl bg-white overflow-hidden"
        style={{ border: "1px solid #d1fae5" }}
      >
        <h2 className="px-3 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 border-b border-emerald-100">
          {title}
        </h2>
        <div className="overflow-x-auto">{children}</div>
      </div>
    </section>
  );
}

type CalcFn = (m: Metric) => {
  forecast: number;
  achievement: number | null;
  diff: number;
  perDay: number | null;
  remainingDays: number;
};

function MetricsTable({
  metrics, calc, fmt, badgeCls, diffCls,
}: {
  metrics: Metric[];
  calc: CalcFn;
  fmt: (v: number, kind: MetricKind) => string;
  badgeCls: (a: number | null, invert: boolean) => string;
  diffCls: (d: number, invert: boolean) => string;
}) {
  const cell = "px-2.5 py-2";
  return (
    <table className="w-full table-fixed" style={{ fontSize: 11 }}>
      <colgroup>
        <col style={{ width: "20%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "28%" }} />
      </colgroup>
      <thead style={{ background: "#ecfdf5" }}>
        <tr className="text-[10px] text-emerald-800">
          <th className={`${cell} text-left font-semibold`}>指標</th>
          <th className={`${cell} text-right font-semibold`}>実績</th>
          <th className={`${cell} text-right font-semibold`}>着地予測</th>
          <th className={`${cell} text-right font-semibold`}>見込</th>
          <th className={`${cell} text-right font-semibold`}>目標差</th>
          <th className={`${cell} text-right font-semibold`}>1日目安</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {metrics.map((m, i) => {
          const c = calc(m);
          const noTarget = m.target <= 0;
          return (
            <tr key={i} className="border-t border-emerald-50 align-top">
              <td
                className={`${cell} whitespace-nowrap overflow-hidden text-ellipsis pl-3 ${lineCls[m.ln]}`}
                style={{ fontSize: 12, fontWeight: 700, color: "#27272a" }}
              >
                {m.name}
              </td>
              <td className={`${cell} text-right font-semibold whitespace-nowrap`}>
                {fmt(m.actual, m.kind)}
              </td>
              <td className={`${cell} text-right whitespace-nowrap text-zinc-600`}>
                {m.kind === "pct" ? "—" : fmt(c.forecast, m.kind)}
              </td>
              <td className={`${cell} text-right whitespace-nowrap`}>
                {noTarget ? (
                  <span className="text-[10px] text-zinc-400">未設定</span>
                ) : (
                  <span className={`inline-block text-[10px] font-bold rounded px-1.5 py-0.5 ${badgeCls(c.achievement, !!m.invert)}`}>
                    {c.achievement !== null ? `${c.achievement.toFixed(0)}%` : "—"}
                  </span>
                )}
              </td>
              <td className={`${cell} text-right whitespace-nowrap`}>
                {noTarget ? (
                  <span className="text-zinc-400">—</span>
                ) : (
                  <>
                    <div className={`font-semibold ${diffCls(c.diff, !!m.invert)}`}>
                      {c.diff >= 0 ? "+" : ""}{fmt(c.diff, m.kind)}
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af" }}>
                      目標: {fmt(m.target, m.kind)}
                    </div>
                  </>
                )}
              </td>
              <td className={`${cell} text-right text-[10px] text-zinc-500 whitespace-nowrap`}>
                {noTarget || c.perDay == null
                  ? "—"
                  : m.kind === "yen"
                    ? yen(c.perDay)
                    : `${Math.round(c.perDay * 10) / 10}件`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DepartmentTable({
  summary, daysElapsed, daysInMonth,
}: {
  summary: ReturnType<typeof calculateDashboard>;
  daysElapsed: number; daysInMonth: number;
}) {
  const fc = (v: number) => Math.round((v / Math.max(1, daysElapsed)) * daysInMonth);
  type Row = { name: string; rev: number; prof: number; count: number; unit: number; total?: boolean };
  const rows: Row[] = [
    { name: "自社施工", rev: summary.self.revenue, prof: summary.self.profit, count: summary.self.count, unit: summary.self.unitPrice },
    { name: "新規営業", rev: summary.newSales.revenue, prof: summary.newSales.profit, count: summary.newSales.count, unit: summary.newSales.unitPrice },
    { name: "ヘルプ", rev: summary.help.revenue, prof: summary.help.profit, count: summary.help.count, unit: summary.help.unitPrice },
  ];
  const total: Row = {
    name: "合計",
    rev: rows.reduce((s, r) => s + r.rev, 0),
    prof: rows.reduce((s, r) => s + r.prof, 0),
    count: rows.reduce((s, r) => s + r.count, 0),
    unit: 0,
    total: true,
  };
  total.unit = total.count > 0 ? Math.round(total.rev / total.count) : 0;
  rows.push(total);

  return (
    <table className="min-w-full" style={{ fontSize: 11 }}>
      <thead style={{ background: "#ecfdf5" }}>
        <tr className="text-[10px] text-emerald-800">
          <th className="text-left px-2.5 py-2 font-semibold">部門</th>
          <th className="text-right px-2.5 py-2 font-semibold">売上(実績)</th>
          <th className="text-right px-2.5 py-2 font-semibold">売上(予測)</th>
          <th className="text-right px-2.5 py-2 font-semibold">粗利(実績)</th>
          <th className="text-right px-2.5 py-2 font-semibold">粗利(予測)</th>
          <th className="text-right px-2.5 py-2 font-semibold">客単価</th>
          <th className="text-right px-2.5 py-2 font-semibold">件数</th>
          <th className="text-right px-2.5 py-2 font-semibold">粗利率</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((r) => {
          const gmr = r.rev > 0 ? (r.prof / r.rev) * 100 : 0;
          return (
            <tr key={r.name}
              className={`border-t border-emerald-50 ${r.total ? "font-bold" : ""}`}
              style={r.total ? { background: "#f0fdf4" } : undefined}
            >
              <td className="px-2.5 py-2 whitespace-nowrap">{r.name}</td>
              <td className="px-2.5 py-2 text-right whitespace-nowrap">{yen(r.rev)}</td>
              <td className="px-2.5 py-2 text-right whitespace-nowrap text-emerald-700">{yen(fc(r.rev))}</td>
              <td className="px-2.5 py-2 text-right whitespace-nowrap">{yen(r.prof)}</td>
              <td className="px-2.5 py-2 text-right whitespace-nowrap text-emerald-700">{yen(fc(r.prof))}</td>
              <td className="px-2.5 py-2 text-right whitespace-nowrap">{yen(r.unit)}</td>
              <td className="px-2.5 py-2 text-right whitespace-nowrap">{r.count}</td>
              <td className="px-2.5 py-2 text-right whitespace-nowrap">{gmr.toFixed(1)}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
