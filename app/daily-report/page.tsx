"use client";
// PR c96-2: /daily-report 2 軸拡張 — 3 視点 (会社別 / 事業別 / グループ全体) + 期間 (単日 / 同一月内範囲)。
//
// c96-1 で確立した companies.ts (会社マップ) + theme.ts (色定数) + /api/range-aggregate (READ ONLY 集計 API)
// を利用して、フロント側に 3 視点切替 + 期間モード + フィルター帯を導入する。
//
// 既存 c95-C-2 page.tsx (date/area/category 1 軸のみ + URL 同期) を拡張:
//   - 視点 state: view = "company" | "business" | "group" (default "company")
//   - 視点別 state: company (view=company 時) / category (view=business or 会社別単一業態時) / area (会社別単一エリア時)
//   - モード state: mode = "single" | "range" (default "single")
//   - 日付 state: date (mode=single) / from + to (mode=range、同一月内ガード必須)
//
// URL クエリ仕様 (反さん確定、c96-2):
//   ?view=company|business|group (default company)
//   ?company=<CompanyId>     (view=company 時のアクティブ会社、default = 7 社目 + unassigned の最初)
//   ?category=<BusinessCategory>  (view=business 時 or 会社別 1 業態絞り込み時)
//   ?area=<areaId>           (会社別 1 エリア絞り込み時)
//   ?mode=single|range       (default single)
//   ?date=YYYY-MM-DD         (mode=single)
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD  (mode=range、同一月内必須)
//
// 後方互換: 旧 URL (?area=&category=&date=) は view=company にフォールバックして読む (デフォルト挙動)。
//
// 設計原則:
//   - c95-C-2 のラッパー設計 (Suspense + useSearchParams + captureRef) を踏襲
//   - 視点切替時に他 state は保持 (= URL 上で 8 キー全て独立)。整合性チェック (例: company が
//     カバーしない category を選んだ場合) は FilterBar 側で UI 制御
//   - 期間モード時の月またぎは page 側でガード (from/to が同一年月にならない場合は from の月で to を補正 + ガード表示)

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BusinessCategory } from "../lib/businesses";
import { COMPANIES } from "../lib/companies";
import DailyReportContent from "../entry/components/dailyReport/DailyReportContent";

const VALID_CATEGORIES: BusinessCategory[] = ["water", "electric", "locksmith", "road", "detective"];
const VALID_AREAS = ["kansai", "kanto", "nagoya", "kyushu", "kitakanto", "hokkaido", "chugoku", "shizuoka"];
const VALID_VIEWS = ["company", "business", "group"] as const;
type ViewMode = typeof VALID_VIEWS[number];
const VALID_MODES = ["single", "range"] as const;
type DateMode = typeof VALID_MODES[number];

const todayISO = (): string => new Date().toISOString().slice(0, 10);

const isValidDate = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());

const sameMonth = (a: string, b: string): boolean =>
  a.slice(0, 7) === b.slice(0, 7);

// Suspense boundary で useSearchParams を wrap (Next.js 16 要件、c95-C-2 と同パターン)
export default function DailyReportPage() {
  return (
    <Suspense fallback={<div style={pageStyle}>読み込み中...</div>}>
      <DailyReportPageContent />
    </Suspense>
  );
}

function DailyReportPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL クエリ初期化
  const urlView = (searchParams.get("view") ?? "") as ViewMode;
  const urlCompany = searchParams.get("company") ?? "";
  const urlArea = searchParams.get("area");
  const urlCategory = searchParams.get("category");
  const urlMode = (searchParams.get("mode") ?? "") as DateMode;
  const urlDate = searchParams.get("date");
  const urlFrom = searchParams.get("from");
  const urlTo = searchParams.get("to");

  // 既定値 (URL 未指定時)
  const view: ViewMode = VALID_VIEWS.includes(urlView) ? urlView : "company";
  const defaultCompany = COMPANIES[0]?.id ?? "mavericks"; // 7 社目 = SIKKEN、未割当があれば 8 件目
  const company: string = COMPANIES.some((c) => c.id === urlCompany) ? urlCompany : defaultCompany;
  const areaId = (urlArea && VALID_AREAS.includes(urlArea)) ? urlArea : "kansai";
  const category: BusinessCategory = (urlCategory && VALID_CATEGORIES.includes(urlCategory as BusinessCategory))
    ? urlCategory as BusinessCategory
    : "water";
  const mode: DateMode = VALID_MODES.includes(urlMode) ? urlMode : "single";
  const initialDate = (urlDate && isValidDate(urlDate)) ? urlDate : todayISO();
  const initialFrom = (urlFrom && isValidDate(urlFrom)) ? urlFrom : initialDate;
  const initialTo = (urlTo && isValidDate(urlTo) && sameMonth(initialFrom, urlTo)) ? urlTo : initialFrom;

  // state (URL 追従)
  const [date, setDate] = useState(initialDate);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);

  // URL → state 同期 (戻る/進むボタン対応、c95-C-2 と同パターンで mode の追加対応)
  useEffect(() => {
    const u = searchParams.get("date");
    if (u && isValidDate(u) && u !== date) setDate(u);
    const f = searchParams.get("from");
    if (f && isValidDate(f) && f !== from) setFrom(f);
    const t = searchParams.get("to");
    if (t && isValidDate(t) && t !== to) setTo(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 同一月内ガード: from を変更したとき to が別月なら from の月末 (= from と同日) に補正
  // FilterBar からは setFrom/setTo を経由するので、ここで補正ロジックを集約しておく。
  const updateUrl = useCallback((patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.replace(`/daily-report?${params.toString()}`);
  }, [searchParams, router]);

  // 単日 (date) 変更 (◀▶ / カレンダー)
  const handleDateChange = useCallback((newDate: string) => {
    if (!isValidDate(newDate)) return;
    setDate(newDate);
    updateUrl({ date: newDate });
  }, [updateUrl]);

  // 視点切替 (会社別 / 事業別 / グループ全体)
  const handleViewChange = useCallback((newView: ViewMode) => {
    updateUrl({ view: newView });
  }, [updateUrl]);

  // 会社切替 (view=company 時)
  const handleCompanyChange = useCallback((newCompanyId: string) => {
    updateUrl({ company: newCompanyId });
  }, [updateUrl]);

  // 業態切替 (view=business or 会社別 1 業態絞り込み)
  const handleCategoryChange = useCallback((newCategory: BusinessCategory | "") => {
    updateUrl({ category: newCategory || null });
  }, [updateUrl]);

  // エリア切替 (会社別 1 エリア絞り込み)
  const handleAreaChange = useCallback((newArea: string) => {
    updateUrl({ area: newArea || null });
  }, [updateUrl]);

  // モード切替 (単日 / 期間)
  const handleModeChange = useCallback((newMode: DateMode) => {
    updateUrl({ mode: newMode });
  }, [updateUrl]);

  // 期間 from 変更
  const handleFromChange = useCallback((newFrom: string) => {
    if (!isValidDate(newFrom)) return;
    setFrom(newFrom);
    // to が別月なら from の同日に補正
    const correctedTo = sameMonth(newFrom, to) ? to : newFrom;
    if (correctedTo !== to) setTo(correctedTo);
    updateUrl({ from: newFrom, to: correctedTo });
  }, [to, updateUrl]);

  // 期間 to 変更
  const handleToChange = useCallback((newTo: string) => {
    if (!isValidDate(newTo)) return;
    if (!sameMonth(from, newTo)) return; // 月またぎ拒否、UI からのバリデーション
    setTo(newTo);
    updateUrl({ to: newTo });
  }, [from, updateUrl]);

  // 撮影 ref (boxShadow + 白背景 + borderRadius 含む wrapper を撮影)
  const captureRef = useRef<HTMLDivElement>(null);

  return (
    <div style={pageStyle}>
      <div style={wrapperStyle} ref={captureRef}>
        <DailyReportContent
          /* 視点系 */
          view={view}
          company={company}
          /* 既存 (互換) */
          date={date}
          areaId={areaId}
          category={category}
          /* c96-2 拡張: 会社別 1 エリア絞り込み state */
          area={urlArea ?? ""}
          /* 期間モード */
          mode={mode}
          from={from}
          to={to}
          /* 単日 callback (既存) */
          onDateChange={handleDateChange}
          /* 視点系 callback (c96-2 新規) */
          onViewChange={handleViewChange}
          onCompanyChange={handleCompanyChange}
          onCategoryChange={handleCategoryChange}
          onAreaChange={handleAreaChange}
          onModeChange={handleModeChange}
          onFromChange={handleFromChange}
          onToChange={handleToChange}
          captureRef={captureRef}
        />
      </div>
    </div>
  );
}

// モーダルの containerStyle と verbatim 同一 (撮影画像がモーダル版と完全同等)
const wrapperStyle: React.CSSProperties = {
  background: "#f3f6f4", color: "#1c2b25",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif',
  WebkitFontSmoothing: "antialiased",
  width: "100%", maxWidth: 1100,
  borderRadius: 12, overflow: "hidden",
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  margin: "0 auto",
};

const pageStyle: React.CSSProperties = {
  background: "#f2f5f2",
  minHeight: "100vh",
  padding: "24px 16px",
};
