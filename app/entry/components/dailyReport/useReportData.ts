// PR c96-2: 視点 (会社別/事業別/グループ全体) + 期間 (単日/同一月内範囲) 対応データ取得 hook。
//
// 既存 useDailyReportData (c95-C-1) は単一 (areaId, category) 前提のため touch せず、本 hook は
// 新規追加して /daily-report page 経由で利用。Modal 経路 (entry/DailyReportModal) は touch なし、
// 既存挙動を維持する。
//
// 設計:
//   - view + company + category + area から (categories[], areas[]) を派生
//     - view=group   : 全業態 × 全エリア
//     - view=business: [category] × 全エリア
//     - view=company : 会社の (category, area) 集合 (会社別の絞り込み category/area 指定があれば適用)
//   - /api/range-aggregate で集計取得 (from/to + categories + areas + group_by)
//     - 集計値の表示 = 当該期間 (mode=single なら from=to=date)
//     - 現在地 (月累計) = from=月初, to=月末 (本 PR では entries SUM 統一、不変条件 3 妥協)
//   - 業態混在判定 (= categories.length > 1) を返却、UI 側で業態固有セクション表示制御
//   - 単一 (cat, area) ケースは isSingle=true を返却、既存 SectionXxx + HelpStaffMonthlyTable 流用可
//
// 注: HELP 個人別 (HelpStaffMonthlyTable) の合算範囲拡張は c96-3 で実装予定。本 hook では
//   「単一 (cat, area) のときのみ HELP 個人別を返す」現状踏襲挙動 (合算/事業混在時は空配列)。
//
// ⚠️ 不変条件 3 (monthly_summaries 優先) との緊張:
//   本 hook は月累計 (現在地) も range-aggregate (entries 直 SUM) 経由で取得する。
//   従来 useDailyReportData は monthly_summaries 優先 (`/api/monthly-summary` 直読) のため、
//   - 過去月 (例: 2026-04 以前) を本拡張モードで閲覧すると、entries に 0 行 → monthRow=0 表示
//   - 一方 monthly_summaries には water 109 行が保存済 → 表示値の乖離
//   2026-05 以降の運用を前提とすれば実害なし。過去月閲覧時の monthly_summaries fallback は
//   c96-3 以降で検討 (番人 invariant-guard 指摘、c96-2 PR 本文参照)。

import { useEffect, useMemo, useState } from "react";
import type { BusinessCategory } from "../../../lib/businesses";
import { BUSINESSES, AREA_NAMES } from "../../../lib/businesses";
import { COMPANIES, getCompanyCategoriesAndAreas, getCompanyAssignments } from "../../../lib/companies";
import type { DailyEntry } from "../../../lib/calculations";

export type ViewMode = "company" | "business" | "group";
export type DateMode = "single" | "range";

const ALL_AREAS = ["kansai", "kanto", "nagoya", "kyushu", "kitakanto", "hokkaido", "chugoku", "shizuoka"] as const;
const ALL_CATEGORIES: BusinessCategory[] = ["water", "electric", "locksmith", "road", "detective"];

export type ReportRow = {
  business_category: string;
  area_id: string;
  total_revenue: number;
  total_profit: number;
  total_count: number;
  unit_price: number;
  ad_cost: number;
  acquisition_count: number;
  call_count: number;
  profit_rate: number;
  help_revenue: number;
  help_count: number;
  consultant_fee: number;
  vehicle_count: number;
  trainee_count: number;
};

/** Neon serverless driver は BIGINT / NUMERIC を string で返す (JS の number 範囲超過防止)。
 *  本 normalize で全数値フィールドを number 化し、NaN は 0 にフォールバック。
 *  これがないと `Math.round("125000".toLocaleString())` 等で NaN 表示 / `.toFixed()` クラッシュが起きる
 *  (PR #150 本番障害の根本原因、b66883c 後ロールバック)。 */
function normalizeRow(raw: unknown): ReportRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const numOr0 = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    business_category: typeof r.business_category === "string" ? r.business_category : "",
    area_id: typeof r.area_id === "string" ? r.area_id : "",
    total_revenue: numOr0(r.total_revenue),
    total_profit: numOr0(r.total_profit),
    total_count: numOr0(r.total_count),
    unit_price: numOr0(r.unit_price),
    ad_cost: numOr0(r.ad_cost),
    acquisition_count: numOr0(r.acquisition_count),
    call_count: numOr0(r.call_count),
    profit_rate: numOr0(r.profit_rate),
    help_revenue: numOr0(r.help_revenue),
    help_count: numOr0(r.help_count),
    consultant_fee: numOr0(r.consultant_fee),
    vehicle_count: numOr0(r.vehicle_count),
    trainee_count: numOr0(r.trainee_count),
  };
}

// テストから直接呼べるよう export (純関数、API レスポンス型ガード)
export { normalizeRow };

export type ReportData = {
  /** 期間内集計 (mode=single なら当日、mode=range なら期間 SUM)、merged row 1 件 */
  rangeRow: ReportRow | null;
  /** 月累計 (現在地)、merged row 1 件。range が単日でも月初〜月末で取得。 */
  monthRow: ReportRow | null;
  /** 単一 (cat, area) view (= 業態固有セクションを表示できるか) */
  isSingle: boolean;
  /** 単一 view 時の (category, area)、それ以外は null */
  singleCategory: BusinessCategory | null;
  singleArea: string | null;
  /** view から派生した実集計対象 categories / areas (UI 表示用) */
  effectiveCategories: BusinessCategory[];
  effectiveAreas: string[];
  /** 単一 view + HELP 対応業態のとき、当月 entries (HELP 個人別テーブル用) */
  entries: DailyEntry[];
  loading: boolean;
};

/**
 * 視点 + 期間に応じたデータ取得。
 *
 * @param view  視点モード
 * @param company  会社 ID (view=company 時のみ意味あり)
 * @param category  業態 (view=business 時のアクティブ、または会社別 1 業態絞り込み)
 * @param area      エリア (会社別 1 エリア絞り込み、空文字なら未絞り込み)
 * @param mode  日付モード
 * @param date  単日 (mode=single)
 * @param from / to  期間 (mode=range、同一月内必須)
 */
/**
 * @param enabled  false なら hook は何もしない (空データ + loading=false)。
 *   Modal 経路 (= 拡張モード未使用) で本 hook が呼ばれた場合に無駄な fetch を回避するためのスイッチ。
 */
export function useReportData(
  view: ViewMode,
  company: string,
  category: BusinessCategory,
  area: string,
  mode: DateMode,
  date: string,
  from: string,
  to: string,
  enabled: boolean = true,
): ReportData {
  // 視点 → (categories[], areas[]) 派生
  const { effectiveCategories, effectiveAreas, isSingle, singleCategory, singleArea } = useMemo(() => {
    if (view === "group") {
      return {
        effectiveCategories: ALL_CATEGORIES,
        effectiveAreas: Array.from(ALL_AREAS),
        isSingle: false,
        singleCategory: null,
        singleArea: null,
      };
    }
    if (view === "business") {
      // 事業別: 1 業態 + その業態の全エリア (BUSINESSES.areas)
      const b = BUSINESSES.find((bb) => bb.id === category);
      const areas = b ? b.areas : Array.from(ALL_AREAS);
      const isS = areas.length === 1;
      return {
        effectiveCategories: [category],
        effectiveAreas: areas,
        isSingle: isS,
        singleCategory: isS ? category : null,
        singleArea: isS ? areas[0] : null,
      };
    }
    // view === "company"
    const assignments = getCompanyAssignments(company);
    let pairs = assignments;
    if (category) pairs = pairs.filter((p) => p.category === category);
    if (area) pairs = pairs.filter((p) => p.areaId === area);
    const cats = Array.from(new Set(pairs.map((p) => p.category)));
    const areas = Array.from(new Set(pairs.map((p) => p.areaId)));
    const isS = pairs.length === 1;
    return {
      effectiveCategories: cats.length > 0 ? cats : ALL_CATEGORIES,
      effectiveAreas: areas.length > 0 ? areas : Array.from(ALL_AREAS),
      isSingle: isS,
      singleCategory: isS ? pairs[0].category : null,
      singleArea: isS ? pairs[0].areaId : null,
    };
  }, [view, company, category, area]);

  // 期間内集計の from/to (mode=single なら from=to=date)
  const queryFrom = mode === "single" ? date : from;
  const queryTo = mode === "single" ? date : to;

  // 月累計 (現在地) の from/to: queryFrom の月の月初〜月末
  const monthFromTo = useMemo(() => {
    if (!queryFrom) return { mFrom: "", mTo: "" };
    const y = Number(queryFrom.slice(0, 4));
    const m = Number(queryFrom.slice(5, 7));
    const lastDay = new Date(y, m, 0).getDate();
    const mFrom = `${queryFrom.slice(0, 7)}-01`;
    const mTo = `${queryFrom.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
    return { mFrom, mTo };
  }, [queryFrom]);

  const [rangeRow, setRangeRow] = useState<ReportRow | null>(null);
  const [monthRow, setMonthRow] = useState<ReportRow | null>(null);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setRangeRow(null);
      setMonthRow(null);
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const catsParam = effectiveCategories.length === ALL_CATEGORIES.length ? "all" : effectiveCategories.join(",");
    const areasParam = effectiveAreas.length === ALL_AREAS.length ? "all" : effectiveAreas.join(",");

    const fetchRange = fetch(
      `/api/range-aggregate?from=${queryFrom}&to=${queryTo}&categories=${catsParam}&areas=${areasParam}&group_by=none`,
    ).then((r) => (r.ok ? r.json() : { rows: [] }));

    const fetchMonth = fetch(
      `/api/range-aggregate?from=${monthFromTo.mFrom}&to=${monthFromTo.mTo}&categories=${catsParam}&areas=${areasParam}&group_by=none`,
    ).then((r) => (r.ok ? r.json() : { rows: [] }));

    // PR c96-3: HELP 個人別を視点別集約に拡張。
    //   HELP 対応業態 (water/electric/locksmith) × effectiveAreas を並列 fetch、連結して 1 つの entries 配列に。
    //   呼び出し側 (DailyReportContent) で aggregateHelpStaffByMonth で staff_name SUM。
    //   最大 11 ペア (water 8 + electric 2 + locksmith 1) なので並列 fetch OK。
    //   ロード/探偵 (HAS_HELP=false) は対象外、effectiveCategories に含まれていても skip。
    //   反さん指示: HELP 個人別は常に月累計 (期間モードでも選択月の月初〜月末)。
    const HELP_CATS = new Set(["water", "electric", "locksmith"]);
    const yearStr = queryFrom.slice(0, 4);
    const monthNum = Number(queryFrom.slice(5, 7));
    const helpPairs: Array<{ cat: BusinessCategory; area: string }> = [];
    for (const c of effectiveCategories) {
      if (!HELP_CATS.has(c)) continue;
      for (const a of effectiveAreas) {
        // BUSINESSES の各 category.areas を厳密フィルタしないと存在しないペアも fetch される。
        // BUSINESSES から該当 area のみ fetch 対象に
        const b = BUSINESSES.find((bb) => bb.id === c);
        if (b && b.areas.includes(a)) {
          helpPairs.push({ cat: c, area: a });
        }
      }
    }
    const fetchEntries: Promise<{ entries: DailyEntry[] }> = helpPairs.length === 0
      ? Promise.resolve({ entries: [] })
      : Promise.all(
          helpPairs.map((p) =>
            fetch(`/api/entries?area=${p.area}&year=${yearStr}&month=${monthNum}&category=${p.cat}`)
              .then((r) => (r.ok ? r.json() : { entries: [] }))
              .catch(() => ({ entries: [] })),
          ),
        ).then((results) => ({
          entries: results.flatMap((r) => (Array.isArray(r.entries) ? r.entries : [])),
        }));

    Promise.all([fetchRange, fetchMonth, fetchEntries]).then(([rg, mo, ent]) => {
      if (cancelled) return;
      // PR c96-2-hotfix: API レスポンスは Neon driver の string 型を含む → normalize で number 化
      //   (b66883c rollback の根本原因: profit_rate string → `.toFixed()` クラッシュ)
      setRangeRow(normalizeRow(rg.rows?.[0]));
      setMonthRow(normalizeRow(mo.rows?.[0]));
      setEntries(ent.entries ?? []);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setRangeRow(null);
      setMonthRow(null);
      setEntries([]);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [enabled, queryFrom, queryTo, monthFromTo.mFrom, monthFromTo.mTo, effectiveCategories, effectiveAreas, isSingle, singleCategory, singleArea]);

  return {
    rangeRow,
    monthRow,
    isSingle,
    singleCategory,
    singleArea,
    effectiveCategories,
    effectiveAreas,
    entries,
    loading,
  };
}

/** 視点表示用ラベル (UI ヘッダー / バッジ用)。 */
export function describeView(
  view: ViewMode,
  company: string,
  category: BusinessCategory,
  area: string,
): string {
  if (view === "group") return "グループ全体";
  if (view === "business") {
    const b = BUSINESSES.find((bb) => bb.id === category);
    return b ? `${b.label}事業` : "事業別";
  }
  // company
  const sel = getCompanyCategoriesAndAreas(company);
  const companyMeta = COMPANIES.find((c) => c.id === company);
  const companyLabel = companyMeta?.name ?? company; // companies.ts の name を引く
  let suffix = "";
  if (category && area) suffix = ` / ${category} × ${AREA_NAMES[area] ?? area}`;
  else if (category) suffix = ` / ${category}`;
  else if (area) suffix = ` / ${AREA_NAMES[area] ?? area}`;
  else if (sel.categories.length === 0) suffix = " (担当なし)";
  return `${companyLabel}${suffix}`;
}
