"use client";
// PR c95-A-3: 日報モーダル (DailyReportModal)。モック docs/mocks/daily_report_kansai_0530.html 準拠。
//
// 引数: (date, areaId, category) → 月単位の /api/entries + /api/monthly-summary を fetch。
//   ◀▶ 日付ナビ / カレンダーで date 変更時に再描画 (月境界跨ぎは entries 再 fetch)。
//
// 構成:
//   header (深緑 #2e8b62、業態/エリア/担当バッジ、× 閉じる)
//   KPI 帯 (4 セル、粗利のみ 3 段で当日粗利率)
//   業態別 Section (Water/Electric/Locksmith/Road/Detective)
//   ⑤ HELP セクション (水道/電気/鍵のみ、HelpStaffMonthlyTable)
//   アクション 4 種 (閉じる / 画像で保存 [PNG, G10] / テキストコピー / LINE・メール OS share intent [G11])

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { DailyEntry } from "../../lib/calculations";
import type { BusinessCategory } from "../../lib/businesses";
import { AREA_NAMES, BUSINESSES } from "../../lib/businesses";
import EntryCalendar from "./EntryCalendar";
import HelpStaffMonthlyTable from "./dailyReport/HelpStaffMonthlyTable";
import WaterDailyReportSection from "./dailyReport/WaterDailyReportSection";
import ElectricDailyReportSection from "./dailyReport/ElectricDailyReportSection";
import LocksmithDailyReportSection from "./dailyReport/LocksmithDailyReportSection";
import RoadDailyReportSection from "./dailyReport/RoadDailyReportSection";
import DetectiveDailyReportSection from "./dailyReport/DetectiveDailyReportSection";
import { computeKpiToday, computeKpiMonthly } from "./dailyReport/kpiCompute";
import { aggregateHelpStaffByMonth } from "../lib/helpStats";
import { buildDailyReportText } from "../lib/buildDailyReportText";
import { yen, cnt, pct } from "./dailyReport/reportPrimitives";

const categoryLabelOf = (c: BusinessCategory): string =>
  BUSINESSES.find((b) => b.id === c)?.label ?? c;

const HAS_HELP: Record<BusinessCategory, boolean> = {
  water: true, electric: true, locksmith: true, road: false, detective: false,
};

type Props = {
  /** 表示対象日 (YYYY-MM-DD) */
  date: string;
  areaId: string;
  category: BusinessCategory;
  /** 担当者ラベル (ヘッダーバッジ用、省略時は「担当 -」) */
  staffLabel?: string;
  onClose: () => void;
};

export default function DailyReportModal({ date, areaId, category, staffLabel, onClose }: Props) {
  const [internalDate, setInternalDate] = useState(date);
  useEffect(() => { setInternalDate(date); }, [date]);

  const year = Number(internalDate.slice(0, 4));
  const month = Number(internalDate.slice(5, 7));
  const day = Number(internalDate.slice(8, 10));

  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // 月境界を跨ぐと entries と summary を再 fetch (year/month 単位で memo)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}&category=${category}`)
        .then((r) => r.ok ? r.json() : { entries: [] }),
      fetch(`/api/monthly-summary?area=${areaId}&year=${year}&month=${month}&category=${category}`)
        .then((r) => r.ok ? r.json() : { summary: null }),
    ]).then(([entriesRes, summaryRes]) => {
      if (cancelled) return;
      setEntries(entriesRes.entries ?? []);
      setSummary(summaryRes.summary ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [areaId, year, month, category]);

  // 当日 entry
  const todayEntry = useMemo<DailyEntry | null>(
    () => entries.find((e) => e.date === internalDate) ?? null,
    [entries, internalDate],
  );

  // KPI 計算 (業態別)
  const kpiToday = computeKpiToday(category, todayEntry);
  const kpiMonthly = computeKpiMonthly(summary);

  // 月累計 HELP 担当者別 (helpStats.aggregateHelpStaffByMonth、選択日までフィルタ)
  const helpStaffMonthly = useMemo(
    () => aggregateHelpStaffByMonth(entries, year, month, day),
    [entries, year, month, day],
  );
  const hasHelp = HAS_HELP[category];

  // 会社参照値 (HELP の引継率・売上高率分母)
  const companyReference = useMemo(() => {
    if (!summary) return null;
    return {
      totalRevenue: Number(summary.total_revenue ?? 0),
      totalCount: Number(summary.total_count ?? 0),
      constructionCount: Number(summary.construction_count ?? 0),
    };
  }, [summary]);

  // カレンダー用 hasDataDays
  const hasDataDays = useMemo(() => {
    const s = new Set<number>();
    for (const e of entries) s.add(Number(e.date.slice(8, 10)));
    return s;
  }, [entries]);

  // 日付ナビ ◀▶
  const navigate = useCallback((deltaDays: number) => {
    const d = new Date(`${internalDate}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    setInternalDate(d.toISOString().slice(0, 10));
  }, [internalDate]);

  // アクション: 画像で保存 (PNG, G10)
  const onSaveImage = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      const dataUrl = await toPng(containerRef.current, { pixelRatio: 2, backgroundColor: "#f3f6f4" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `daily_report_${internalDate}_${areaId}_${category}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setActionMsg("📷 画像を保存しました");
    } catch (e) {
      setActionMsg(`画像保存失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
    setTimeout(() => setActionMsg(null), 2500);
  }, [internalDate, areaId, category]);

  // アクション: テキストコピー (buildDailyReportText + clipboard)
  const onCopyText = useCallback(async () => {
    const text = buildDailyReportText({
      date: internalDate,
      areaName: AREA_NAMES[areaId] ?? areaId,
      categoryLabel: categoryLabelOf(category),
      hasHelp,
      kpi: { today: kpiToday, monthly: kpiMonthly },
      helpStaffMonthly,
      companyReference: companyReference ?? undefined,
    });
    try {
      await navigator.clipboard.writeText(text);
      setActionMsg("📋 テキストをコピーしました");
    } catch {
      setActionMsg("コピー失敗 (ブラウザが clipboard 不対応の可能性)");
    }
    setTimeout(() => setActionMsg(null), 2500);
  }, [internalDate, areaId, category, hasHelp, kpiToday, kpiMonthly, helpStaffMonthly, companyReference]);

  // アクション: LINE・メール (OS share intent、G11)
  const onShare = useCallback(() => {
    const text = buildDailyReportText({
      date: internalDate,
      areaName: AREA_NAMES[areaId] ?? areaId,
      categoryLabel: categoryLabelOf(category),
      hasHelp,
      kpi: { today: kpiToday, monthly: kpiMonthly },
      helpStaffMonthly,
      companyReference: companyReference ?? undefined,
    });
    const subject = `日報 ${internalDate} ${AREA_NAMES[areaId] ?? areaId} ${categoryLabelOf(category)}`;
    // mailto: でメーラ起動 (LINE もモバイル OS の share インテントに乗ることが多い)
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = url;
  }, [internalDate, areaId, category, hasHelp, kpiToday, kpiMonthly, helpStaffMonthly, companyReference]);

  // モック準拠スタイル
  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    overflowY: "auto", padding: 24,
  };
  const containerStyle: React.CSSProperties = {
    background: "#f3f6f4", color: "#1c2b25",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif',
    WebkitFontSmoothing: "antialiased",
    width: "100%", maxWidth: 1100, borderRadius: 12, overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={containerStyle} ref={containerRef}>
        {/* ヘッダー */}
        <div style={{ background: "#2e8b62", color: "#fff", padding: "20px 36px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: 0.5 }}>📋 日報</span>
            <Badge>{categoryLabelOf(category)}</Badge>
            <Badge>{AREA_NAMES[areaId] ?? areaId}エリア</Badge>
            <Badge>{staffLabel ?? "担当 -"}</Badge>
            {/* 日付ナビ ◀▶ + カレンダートグル */}
            <div style={{ marginLeft: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <NavButton onClick={() => navigate(-1)}>◀</NavButton>
              <button
                onClick={() => setShowCalendar((s) => !s)}
                style={{
                  padding: "5px 13px", borderRadius: 8, background: "rgba(255,255,255,0.18)",
                  color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                }}
              >📅 {internalDate}</button>
              <NavButton onClick={() => navigate(1)}>▶</NavButton>
            </div>
            <span
              onClick={onClose}
              style={{
                marginLeft: "auto", width: 32, height: 32, borderRadius: 9,
                background: "rgba(255,255,255,0.18)", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 17, cursor: "pointer",
              }}
            >×</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, opacity: 0.85 }}>
            {year}年{month}月{day}日 ・ 今日の実績と現在地
          </div>
          {showCalendar && (
            <div style={{ marginTop: 10, padding: 8, background: "rgba(255,255,255,0.95)", borderRadius: 8 }}>
              <EntryCalendar
                year={year} month={month} day={day}
                hasDataDays={hasDataDays}
                onChange={(y, m, d) => {
                  const ymd = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  setInternalDate(ymd);
                  setShowCalendar(false);
                }}
                isLoading={loading}
              />
            </div>
          )}
        </div>

        {/* KPI 帯 */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
          background: "#2e8b62", padding: "18px 36px 24px",
        }}>
          <KpiCell k="売上" todayValue={kpiToday ? yen(kpiToday.sales) : "—"} nowValue={yen(kpiMonthly.sales)} />
          <KpiCell
            k="粗利"
            todayValue={kpiToday ? yen(kpiToday.profit) : "—"}
            nowValue={yen(kpiMonthly.profit)}
            extraLabel="粗利率"
            extraValue={kpiToday ? pct(kpiToday.profitRate) : "—"}
          />
          <KpiCell k="対応件数" todayValue={kpiToday ? cnt(kpiToday.count) : "—"} nowValue={cnt(kpiMonthly.count)} />
          <KpiCell
            k="客単価"
            todayValue={kpiToday ? yen(kpiToday.unitPrice) : "—"}
            nowValue={kpiMonthly.unitPrice > 0 ? yen(kpiMonthly.unitPrice) : "—"}
          />
        </div>

        {/* 業態別 Section */}
        <div style={{ padding: "18px 36px 6px", fontSize: 14, fontWeight: 700, color: "#2a3d36" }}>
          {categoryLabelOf(category)}業態 — 今日の内訳
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#8a9c95" }}>読み込み中...</div>
        ) : todayEntry === null ? (
          <div style={{
            padding: "16px 36px", margin: "0 36px",
            background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 12,
            textAlign: "center", color: "#6b7280", fontSize: 13,
          }}>{internalDate} のデータなし</div>
        ) : (
          renderSection(category, todayEntry)
        )}

        {/* ⑤ HELP セクション (水道/電気/鍵のみ) */}
        {hasHelp && !loading && (
          <>
            <div style={{ padding: "18px 36px 6px", fontSize: 14, fontWeight: 700, color: "#2a3d36" }}>
              ⑤ HELP 統計
              <span style={{ fontWeight: 500, fontSize: 11, color: "#8a9c95", marginLeft: 8 }}>
                水道・電気・鍵のみ / 担当者別 ・ 月初〜{month}/{day} 累積
              </span>
            </div>
            <div style={{ padding: "6px 36px 0" }}>
              <HelpStaffMonthlyTable
                helpStaffMonthly={helpStaffMonthly}
                companyReference={companyReference}
                periodLabel={`${month}/1〜${month}/${day}`}
              />
            </div>
          </>
        )}

        {/* アクション 4 種 */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "18px 36px 28px", alignItems: "center" }}>
          {actionMsg && <span style={{ marginRight: "auto", fontSize: 12, color: "#0e6b4f", fontWeight: 600 }}>{actionMsg}</span>}
          <Action onClick={onClose} bg="#eef2f0" fg="#5d7a70">閉じる</Action>
          <Action onClick={onSaveImage} bg="#3d8bd4" fg="#fff">🖼 画像で保存</Action>
          <Action onClick={onCopyText} bg="#2f9e6e" fg="#fff">📋 テキストでコピー</Action>
          <Action onClick={onShare} bg="#06C755" fg="#fff">📨 LINE・メール</Action>
        </div>
      </div>
    </div>
  );
}

function renderSection(category: BusinessCategory, e: DailyEntry) {
  switch (category) {
    case "water":     return <WaterDailyReportSection todayEntry={e} />;
    case "electric":  return <ElectricDailyReportSection todayEntry={e} />;
    case "locksmith": return <LocksmithDailyReportSection todayEntry={e} />;
    case "road":      return <RoadDailyReportSection todayEntry={e} />;
    case "detective": return <DetectiveDailyReportSection todayEntry={e} />;
  }
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      background: "rgba(255,255,255,0.18)", padding: "5px 13px",
      borderRadius: 8, fontWeight: 600, fontSize: 13,
    }}>{children}</span>
  );
}
function NavButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.18)",
        color: "#fff", border: "none", cursor: "pointer", fontSize: 14,
      }}
    >{children}</button>
  );
}
function KpiCell({
  k, todayValue, nowValue, extraLabel, extraValue,
}: {
  k: string; todayValue: string; nowValue: string; extraLabel?: string; extraValue?: string;
}) {
  return (
    <div style={{ padding: "0 24px", borderRight: "1px solid rgba(255,255,255,0.18)" }}>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.8)", marginBottom: 7 }}>{k}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 1 }}>今日</div>
      <div style={{
        fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        letterSpacing: -0.3, lineHeight: 1.15, color: "#fff",
      }}>{todayValue}</div>
      <div style={{
        marginTop: 9, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,0.22)",
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
      }}>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)" }}>現在地</span>
        <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{nowValue}</span>
      </div>
      {extraLabel && extraValue && (
        <div style={{ paddingTop: 3, marginTop: 3, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.7)" }}>{extraLabel}</span>
          <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{extraValue}</span>
        </div>
      )}
    </div>
  );
}
function Action({ children, onClick, bg, fg }: { children: React.ReactNode; onClick: () => void; bg: string; fg: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "11px 22px", border: "none", borderRadius: 10,
        fontSize: 13, fontWeight: 700, cursor: "pointer", background: bg, color: fg,
      }}
    >{children}</button>
  );
}
