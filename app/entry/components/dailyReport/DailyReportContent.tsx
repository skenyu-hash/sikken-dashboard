"use client";
// PR c95-C-1: 日報のコンテンツ部分 (ヘッダー + KPI 帯 + 業態 Section + HELP + アクション 4 種)。
//
// 抽出元: app/entry/components/DailyReportModal.tsx (c95-A-3) の L195-308 (render 部分) +
//   L82-176 (派生計算 + アクション callback) + L321-379 (内部 component Badge/NavButton/KpiCell/Action)。
//
// 設計原則 (c95-C-1):
//   - **純リファクタ**: 見た目・挙動を 1 ピクセルも変えない。全 style 値・layout・component 構造
//     を移植のみ。kpiCompute / helpStats / 業態 Section / buildDailyReportText は untouch。
//   - **撮影範囲完全保持** (反さん条件、Q1): containerRef は Modal 側に残し、本 Content には
//     `captureRef` props で受け取る。これにより onSaveImage が toPng で撮影する DOM 範囲は
//     リファクタ前と完全同一 (Modal の container shell = boxShadow + 白背景 + borderRadius 含む)。
//   - **モーダル/独立ページ両用**: onClose props を optional に。undefined なら「閉じる」
//     ボタン非表示 (c95-C-2 独立ページから使うとき用)。モーダル版 (DailyReportModal) は必ず渡す。

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { toPng } from "html-to-image";
import type { DailyEntry } from "../../../lib/calculations";
import type { BusinessCategory } from "../../../lib/businesses";
import { AREA_NAMES, BUSINESSES } from "../../../lib/businesses";
import EntryCalendar from "../EntryCalendar";
import HelpStaffMonthlyTable from "./HelpStaffMonthlyTable";
import WaterDailyReportSection from "./WaterDailyReportSection";
import ElectricDailyReportSection from "./ElectricDailyReportSection";
import LocksmithDailyReportSection from "./LocksmithDailyReportSection";
import RoadDailyReportSection from "./RoadDailyReportSection";
import DetectiveDailyReportSection from "./DetectiveDailyReportSection";
import { computeKpiToday, computeKpiMonthly } from "./kpiCompute";
import { aggregateHelpStaffByMonth } from "../../lib/helpStats";
import { buildDailyReportText } from "../../lib/buildDailyReportText";
import { yen, cnt, pct } from "./reportPrimitives";
import { useDailyReportData } from "./useDailyReportData";
import CollapsibleReportSection from "./CollapsibleReportSection";
// PR c96-2: 視点 / 期間 拡張
import FilterBar, { type ViewMode, type DateMode } from "./FilterBar";
import { useReportData, describeView } from "./useReportData";
import { COLOR_BRAND_DARK, COLOR_TEXT_SECONDARY } from "../../../lib/theme";

const categoryLabelOf = (c: BusinessCategory): string =>
  BUSINESSES.find((b) => b.id === c)?.label ?? c;

const HAS_HELP: Record<BusinessCategory, boolean> = {
  water: true, electric: true, locksmith: true, road: false, detective: false,
};

type Props = {
  /** 表示対象日 (YYYY-MM-DD)、外部から制御 */
  date: string;
  areaId: string;
  category: BusinessCategory;
  /** 担当者ラベル (ヘッダーバッジ用、省略時は「担当 -」) */
  staffLabel?: string;
  /** ナビ ◀▶ / カレンダー操作で date が変わる時の callback */
  onDateChange: (newDate: string) => void;
  /**
   * モーダル版のみ渡す。undefined なら「× 閉じる」ボタン + アクション「閉じる」を非表示
   * (= c95-C-2 独立ページ版で利用する想定)。
   */
  onClose?: () => void;
  /**
   * Q1 boxShadow 完全保持: 画像保存 (toPng) の撮影範囲を「モーダル container shell
   * (boxShadow + 白背景 + borderRadius 含む)」に保つため、Modal 側で useRef した
   * containerRef を受け取る。独立ページ版 (c95-C-2) は別途独自 wrapper の ref を渡す。
   * 省略時は本コンポーネント内部の ref を使う (= 中身のみ撮影、boxShadow なし)。
   */
  captureRef?: RefObject<HTMLDivElement | null>;

  // PR c96-2: 視点 + 期間 拡張 (全 optional、未指定なら既存 Modal/旧 page 互換挙動)
  /** 視点モード (会社別 / 事業別 / グループ全体)、指定あり = c96-2 拡張モード起動 */
  view?: ViewMode;
  /** view=company のときのアクティブ会社 ID */
  company?: string;
  /** 会社別 1 エリア絞り込み (空文字 = 未絞り込み)。areaId とは独立。 */
  area?: string;
  /** 日付モード */
  mode?: DateMode;
  from?: string;
  to?: string;
  /** 視点 + 期間切替 callbacks (FilterBar 内で使用)、view 指定時のみ必須 */
  onViewChange?: (v: ViewMode) => void;
  onCompanyChange?: (id: string) => void;
  onCategoryChange?: (c: BusinessCategory | "") => void;
  onAreaChange?: (a: string) => void;
  onModeChange?: (m: DateMode) => void;
  onFromChange?: (d: string) => void;
  onToChange?: (d: string) => void;
};

export default function DailyReportContent(props: Props) {
  const {
    date, areaId, category, staffLabel, onDateChange, onClose, captureRef,
    view, company, area, mode, from, to,
    onViewChange, onCompanyChange, onCategoryChange, onAreaChange,
    onModeChange, onFromChange, onToChange,
  } = props;

  // c96-2: view 指定あり = 新拡張モード起動。view 未指定 = 既存 Modal/旧 page 互換挙動。
  const isExtendedMode = view !== undefined && onViewChange !== undefined;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));

  const { entries, summary, loading, hasDataDays } = useDailyReportData(areaId, year, month, category);

  // 当日 entry (抽出元: DailyReportModal L82-86)
  const todayEntry = useMemo<DailyEntry | null>(
    () => entries.find((e) => e.date === date) ?? null,
    [entries, date],
  );

  // KPI 計算 (業態別、抽出元: DailyReportModal L88-90)
  const kpiToday = computeKpiToday(category, todayEntry);
  const kpiMonthly = computeKpiMonthly(summary);

  // 月累計 HELP 担当者別 (抽出元: L92-96)
  const helpStaffMonthly = useMemo(
    () => aggregateHelpStaffByMonth(entries, year, month, day),
    [entries, year, month, day],
  );
  const hasHelp = HAS_HELP[category];

  // 会社参照値 (抽出元: L99-107)
  const companyReference = useMemo(() => {
    if (!summary) return null;
    return {
      totalRevenue: Number(summary.total_revenue ?? 0),
      totalCount: Number(summary.total_count ?? 0),
      constructionCount: Number(summary.construction_count ?? 0),
    };
  }, [summary]);

  // カレンダー開閉 (抽出元: L59)
  const [showCalendar, setShowCalendar] = useState(false);
  // アクション msg (抽出元: L60)
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  // 撮影 ref: 外部から渡されたら使う、なければ自前 ref (c95-C-2 独立ページから使う想定の fallback)
  const localRef = useRef<HTMLDivElement>(null);
  const effectiveCaptureRef = captureRef ?? localRef;

  // 日付ナビ ◀▶ (抽出元: L117-121、setInternalDate → onDateChange に置換)
  const navigate = useCallback((deltaDays: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + deltaDays);
    onDateChange(d.toISOString().slice(0, 10));
  }, [date, onDateChange]);

  // アクション: 画像で保存 (抽出元: L123-139、撮影対象は effectiveCaptureRef = Modal 側 container)
  const onSaveImage = useCallback(async () => {
    if (!effectiveCaptureRef.current) return;
    try {
      const dataUrl = await toPng(effectiveCaptureRef.current, { pixelRatio: 2, backgroundColor: "#f3f6f4" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `daily_report_${date}_${areaId}_${category}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setActionMsg("📷 画像を保存しました");
    } catch (e) {
      setActionMsg(`画像保存失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
    setTimeout(() => setActionMsg(null), 2500);
  }, [date, areaId, category, effectiveCaptureRef]);

  // アクション: テキストコピー (抽出元: L141-159)
  const onCopyText = useCallback(async () => {
    const text = buildDailyReportText({
      date,
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
  }, [date, areaId, category, hasHelp, kpiToday, kpiMonthly, helpStaffMonthly, companyReference]);

  // アクション: LINE・メール (c95-A-3 hotfix の 3 段 fallback、PR #128 でマージ済の現行ロジック)
  // 抽出元: L162-198 (PR #128 hotfix 適用後の DailyReportModal)
  const onShare = useCallback(async () => {
    const text = buildDailyReportText({
      date,
      areaName: AREA_NAMES[areaId] ?? areaId,
      categoryLabel: categoryLabelOf(category),
      hasHelp,
      kpi: { today: kpiToday, monthly: kpiMonthly },
      helpStaffMonthly,
      companyReference: companyReference ?? undefined,
    });
    const subject = `日報 ${date} ${AREA_NAMES[areaId] ?? areaId} ${categoryLabelOf(category)}`;

    // (1) Web Share API
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: subject, text });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    // (2) LINE URL scheme
    const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(`${subject}\n\n${text}`)}`;
    const opened = window.open(lineUrl, "_blank");
    if (opened) return;
    // (3) mailto: 最終 fallback
    const mailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    window.location.href = mailUrl;
  }, [date, areaId, category, hasHelp, kpiToday, kpiMonthly, helpStaffMonthly, companyReference]);

  // captureRef を fallback (localRef) で使うとき、ref に直接コンテナ DOM を付ける必要がある。
  // Modal 経由なら captureRef は Modal 側で container shell に bind 済み。
  // 本 component の最上位 div の ref は localRef を fallback として使う (= 独立ページ版の保険)。
  // Modal 経由のとき localRef は無視される (effectiveCaptureRef === captureRef)。

  // PR c96-2: 拡張モード = view 指定あり時、上部に FilterBar + 視点バッジ表示。
  //   既存ヘッダー (categoryLabel/areaId/date ナビ) はそのまま表示するが、
  //   isSingle=false (合算/事業混在) のときは業態固有セクションを非表示にしプレースホルダーを出す。
  //   c96-3 で完成形 (合算セクション + HELP 個人別合算範囲) に拡張予定。
  const extData = useReportData(
    view ?? "company",
    company ?? "",
    category,
    isExtendedMode ? area ?? "" : "",
    mode ?? "single",
    date,
    from ?? date,
    to ?? date,
    isExtendedMode, // PR c96-2: Modal 経路 (isExtendedMode=false) は fetch 抑制 (冗長リクエスト回避、番人指摘)
  );

  return (
    <div ref={captureRef ? undefined : localRef}>
      {/* PR c96-2: 視点 + 期間 フィルター帯 (拡張モードのみ) */}
      {isExtendedMode && view && company && mode && from && to &&
       onViewChange && onCompanyChange && onCategoryChange && onAreaChange &&
       onModeChange && onFromChange && onToChange && (
        <FilterBar
          view={view}
          company={company}
          category={category}
          area={area ?? ""}
          mode={mode}
          date={date}
          from={from}
          to={to}
          onViewChange={onViewChange}
          onCompanyChange={onCompanyChange}
          onCategoryChange={onCategoryChange}
          onAreaChange={onAreaChange}
          onModeChange={onModeChange}
          onDateChange={onDateChange}
          onFromChange={onFromChange}
          onToChange={onToChange}
        />
      )}

      {/* ヘッダー (抽出元: L195-240) */}
      <div style={{ background: "#2e8b62", color: "#fff", padding: "20px 36px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: 0.5 }}>📋 日報</span>
          {isExtendedMode ? (
            <Badge>{describeView(view ?? "company", company ?? "", category, area ?? "")}</Badge>
          ) : (
            <>
              <Badge>{categoryLabelOf(category)}</Badge>
              <Badge>{AREA_NAMES[areaId] ?? areaId}エリア</Badge>
            </>
          )}
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
            >📅 {date}</button>
            <NavButton onClick={() => navigate(1)}>▶</NavButton>
          </div>
          {onClose && (
            <span
              onClick={onClose}
              style={{
                marginLeft: "auto", width: 32, height: 32, borderRadius: 9,
                background: "rgba(255,255,255,0.18)", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 17, cursor: "pointer",
              }}
            >×</span>
          )}
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
                onDateChange(ymd);
                setShowCalendar(false);
              }}
              isLoading={loading}
            />
          </div>
        )}
      </div>

      {/* KPI 帯 (抽出元: L242-261)
          PR c96-2: 拡張モード時は useReportData (range-aggregate 経由) の値で上書き。
            range = 選択期間 SUM (mode=single なら単日)、month = 月累計 (現在地)。 */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
        background: "#2e8b62", padding: "18px 36px 24px",
      }}>
        {isExtendedMode ? (
          <>
            <KpiCell k="売上"
              todayValue={extData.rangeRow ? yen(extData.rangeRow.total_revenue) : "—"}
              nowValue={extData.monthRow ? yen(extData.monthRow.total_revenue) : "—"} />
            <KpiCell k="粗利"
              todayValue={extData.rangeRow ? yen(extData.rangeRow.total_profit) : "—"}
              nowValue={extData.monthRow ? yen(extData.monthRow.total_profit) : "—"}
              extraLabel="粗利率"
              extraValue={extData.rangeRow ? pct(extData.rangeRow.profit_rate) : "—"} />
            <KpiCell k="対応件数"
              todayValue={extData.rangeRow ? cnt(extData.rangeRow.total_count) : "—"}
              nowValue={extData.monthRow ? cnt(extData.monthRow.total_count) : "—"} />
            <KpiCell k="客単価"
              todayValue={extData.rangeRow && extData.rangeRow.unit_price > 0 ? yen(extData.rangeRow.unit_price) : "—"}
              nowValue={extData.monthRow && extData.monthRow.unit_price > 0 ? yen(extData.monthRow.unit_price) : "—"} />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* PR c96-2: 拡張モード + 業態混在/合算時のプレースホルダー (詳細内訳セクションは
          単一 (cat, area) のみ既存セクションを流用、合算/期間モードは c96-3 で完成形に拡張予定) */}
      {isExtendedMode && !extData.isSingle && (
        <div style={{
          margin: "16px 36px", padding: "16px 24px",
          background: COLOR_BRAND_DARK + "10", border: `1px dashed ${COLOR_BRAND_DARK}40`,
          borderRadius: 8, color: COLOR_TEXT_SECONDARY, fontSize: 12.5, lineHeight: 1.7,
        }}>
          <div style={{ fontWeight: 700, color: COLOR_BRAND_DARK, marginBottom: 6 }}>合算ダッシュボード</div>
          対象: {extData.effectiveCategories.length} 業態 × {extData.effectiveAreas.length} エリア
          {mode === "range" && from && to && ` ／ 期間 ${from} 〜 ${to}`}
          <br />
          詳細内訳 (新規対応・コスト・施工等の業態固有項目) は単一業態 × 単一エリア選択時のみ表示します
          (合算時は KPI 4 枚のみ、詳細セクションは c96-3 で完成形に拡張予定)。
          {extData.loading && <span style={{ marginLeft: 8, color: COLOR_BRAND_DARK }}>読み込み中...</span>}
        </div>
      )}

      {/* 業態別 Section (抽出元: L263-277、PR c95-C-3 で CollapsibleReportSection ラップ)
          PC mode: <CollapsibleReportSection> が <><div title 旧と verbatim/>{children}</> で展開、DOM 構造完全同一
          Mobile mode: toggle button + 折りたたみ */}
      <CollapsibleReportSection
        title={`${categoryLabelOf(category)}業態 — 今日の内訳`}
        summary={kpiToday ? yen(kpiToday.sales) : undefined}
        defaultOpenMobile={true}
      >
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#8a9c95" }}>読み込み中...</div>
        ) : todayEntry === null ? (
          <div style={{
            padding: "16px 36px", margin: "0 36px",
            background: "#f9fafb", border: "1px dashed #d1d5db", borderRadius: 12,
            textAlign: "center", color: "#6b7280", fontSize: 13,
          }}>{date} のデータなし</div>
        ) : (
          renderSection(category, todayEntry)
        )}
      </CollapsibleReportSection>

      {/* ⑤ HELP セクション (抽出元: L279-296、PR c95-C-3 で CollapsibleReportSection ラップ) */}
      {hasHelp && !loading && (
        <CollapsibleReportSection
          title={
            <>
              ⑤ HELP 統計
              <span style={{ fontWeight: 500, fontSize: 11, color: "#8a9c95", marginLeft: 8 }}>
                水道・電気・鍵のみ / 担当者別 ・ 月初〜{month}/{day} 累積
              </span>
            </>
          }
          summary={helpStaffMonthly.length > 0 ? `${helpStaffMonthly.length}名` : undefined}
          defaultOpenMobile={true}
        >
          <div style={{ padding: "6px 36px 0" }}>
            <HelpStaffMonthlyTable
              helpStaffMonthly={helpStaffMonthly}
              companyReference={companyReference}
              periodLabel={`${month}/1〜${month}/${day}`}
            />
          </div>
        </CollapsibleReportSection>
      )}

      {/* アクション (抽出元: L298-305) — onClose があれば「閉じる」表示、なければ 3 種のみ */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "18px 36px 28px", alignItems: "center" }}>
        {actionMsg && <span style={{ marginRight: "auto", fontSize: 12, color: "#0e6b4f", fontWeight: 600 }}>{actionMsg}</span>}
        {onClose && <Action onClick={onClose} bg="#eef2f0" fg="#5d7a70">閉じる</Action>}
        <Action onClick={onSaveImage} bg="#3d8bd4" fg="#fff">🖼 画像で保存</Action>
        <Action onClick={onCopyText} bg="#2f9e6e" fg="#fff">📋 テキストでコピー</Action>
        <Action onClick={onShare} bg="#06C755" fg="#fff">📨 LINE・メール</Action>
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

// 内部 component (抽出元: DailyReportModal L321-378、style 値・構造完全同一)
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
