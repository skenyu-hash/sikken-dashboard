// 年次 (YTD) 集計 純関数 lib (year-view スライス1)
//
// 役割: monthly_summaries の「同一 (業態×エリア) の複数月行」を年単位で合算し、
//       経営ダッシュボードの年次 (YTD) ビューに渡す YTD 行 + 目標 (ペース/年間) を生成する。
//       READ ONLY。DB 書き込みは一切しない。
//
// 既存 company-aggregations.ts (エリア横断合算) を「月横断合算」に焼き直したもの。
// ただし Gemini 独立レビュー (2026-06-20) で発見した 4 つの致命的盲点を構造的に封殺している:
//
//   1. 損失消去 (Loss Erasure): resolveTotalProfit() は末尾 Math.max(0,..) で各月を 0 底打ちする。
//      月別 resolveTotalProfit を合算すると赤字月が消え粗利が水増しされる
//      (5月 -50万 + 6月 +80万 → 真 +30万 が +80万 に化ける)。
//      → 本 lib は「売上・各コストを先に年間合算 → 粗利は最後に 1 回だけ導出 (clamp なし)」。
//        赤字月が正しく相殺され、YTD が赤字なら真の負値を返す (経営の誠実性、0 底打ちしない)。
//
//   2. 率の合算爆弾: profit_rate/ad_rate/cpa 等の率カラムを合算すると 15%+20%=35% になる。
//      → 率・派生値 (DERIVED_KEYS) は合算対象から除外し、合算後の総額から再計算する。
//
//   3. スナップショット重複: vehicle_count/trainee_count/as_of_day は時点スナップショット。
//      8 か月合算すると車 10 台 → 80 台。→ SNAPSHOT_KEYS は最新月 (MAX month) の値を採用。
//
//   4. 4月以前データ混入: 2026/4 以前は絶対不変 (定義の違う凍結データ)。
//      → YTD_MIN_YYYYMM=202605 で実績・目標とも yyyymm 整数比較でガード (JS Date 不使用)。
//
// 件数の業態非対称 (PR #177 教訓) も踏襲: total_count が 0 の業態 (鍵/ロード/探偵) は
//   acquisition_count を「実効件数」として採用する per-row fallback を入れる。

import type { BusinessCategory } from "./businesses";
import { emptyTargets, type Targets } from "./calculations";

/**
 * 年次集計に含める最古の年月 (year*100+month)。202605 = 2026 年 5 月。
 * これ未満 (= 2026/4 以前の絶対不変データ) は実績・目標とも合算に入れない。
 * calculations.ts の MOM_COMPARE_MIN_YYYYMM / consultantFee.ts の
 * CONSULTANT_FEE_APPLIED_FROM_YYYYMM と同値だが、年次ビュー固有のガードとして独立管理する。
 */
export const YTD_MIN_YYYYMM = 202605;

const numOf = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// 合算しないメタ列 (文字列・ID・日時・業態・年月)
const META_KEYS = new Set([
  "id", "area_id", "business_category", "year", "month", "created_at", "updated_at",
]);

// 時点スナップショット列。合算せず最新月 (MAX month) の値を採用する。
const SNAPSHOT_KEYS = ["vehicle_count", "trainee_count", "as_of_day"] as const;

// 派生値 (率・単価・粗利)。合算せず、合算後の総額から再計算する。
const DERIVED_KEYS = new Set([
  "total_profit", "profit_rate", "ad_rate", "cpa",
  "conv_rate", "unit_price", "call_unit_price", "help_unit_price",
]);

/** YTD 行 (monthly_summaries と同じキー名で揃え、Section コンポーネントが直接読める形)。 */
export type YtdActuals = Record<string, number | string>;

/**
 * 同一 (業態) の複数月 monthly_summary 行を業態別に年次 (YTD) 合算する。
 *
 * @param rows 各要素 = { category, summary: monthly_summaries 1 行 (1 エリア×1 月) }。
 *             同一業態の複数エリア・複数月を平坦に渡してよい (業態キーで束ねて合算する)。
 * @returns 業態 → YTD 行。各行は売上・コスト・件数を年間合算し、粗利と率を総額から再計算済み。
 */
export function aggregateYearlyActuals(
  rows: Array<{ category: BusinessCategory; summary: Record<string, unknown> | null }>,
): Partial<Record<BusinessCategory, YtdActuals>> {
  type Acc = {
    sums: Record<string, number>;
    effectiveCount: number; // total_count || acquisition_count の per-row 和 (PR #177)
    maxMonth: number;
    snapshot: Record<string, number>;
    year: number;
  };
  const acc: Partial<Record<BusinessCategory, Acc>> = {};

  for (const { category, summary } of rows) {
    if (!summary) continue;
    // ===== 4月以前ガード (整数比較のみ、JS Date 不使用) =====
    const yyyymm = numOf(summary.year) * 100 + numOf(summary.month);
    if (yyyymm < YTD_MIN_YYYYMM) continue;

    let a = acc[category];
    if (!a) {
      a = acc[category] = { sums: {}, effectiveCount: 0, maxMonth: -1, snapshot: {}, year: numOf(summary.year) };
    }

    // ===== 絶対値の合算 (率・スナップショット・メタは除外) =====
    for (const [key, val] of Object.entries(summary)) {
      if (META_KEYS.has(key) || DERIVED_KEYS.has(key) || (SNAPSHOT_KEYS as readonly string[]).includes(key)) continue;
      const nv = numOf(val);
      if (!Number.isFinite(nv)) continue;
      a.sums[key] = (a.sums[key] ?? 0) + nv;
    }

    // ===== 実効件数: total_count が 0 の業態は acquisition_count で数える (PR #177) =====
    a.effectiveCount += numOf(summary.total_count) || numOf(summary.acquisition_count);

    // ===== スナップショット: 最新月 (MAX month) の値で上書き =====
    const m = numOf(summary.month);
    if (m >= a.maxMonth) {
      a.maxMonth = m;
      for (const k of SNAPSHOT_KEYS) a.snapshot[k] = numOf(summary[k]);
    }
  }

  const result: Partial<Record<BusinessCategory, YtdActuals>> = {};
  for (const cat of Object.keys(acc) as BusinessCategory[]) {
    const a = acc[cat]!;
    const s = a.sums;
    const g = (k: string) => s[k] ?? 0;

    const revenue = g("total_revenue");
    const adCost = g("ad_cost");
    const acqCount = g("acquisition_count");
    const callCount = g("call_count");
    const helpRevenue = g("help_revenue");
    const helpCount = g("help_count");
    const count = a.effectiveCount;

    // ===== 粗利: 合算後に 1 回だけ category-aware で導出 (clamp なし = 赤字は真の負値) =====
    let profit: number;
    if (cat === "locksmith") {
      profit = revenue
        - g("locksmith_construction_cost") - g("material_cost")
        - g("ad_cost") - g("locksmith_commission_fee");
    } else if (cat === "water") {
      // water のみ手入力コンサル費を控除 (合算済 consultant_fee を 1 回だけ引く = 二重控除なし)
      profit = revenue
        - g("total_labor_cost") - g("material_cost") - g("ad_cost")
        - g("sales_outsourcing_cost") - g("card_processing_fee") - g("consultant_fee");
    } else {
      // electric / road / detective: コンサル費なし
      profit = revenue
        - g("total_labor_cost") - g("material_cost") - g("ad_cost")
        - g("sales_outsourcing_cost") - g("card_processing_fee");
    }
    profit = Math.round(profit); // Math.max を掛けない

    // ===== 率の再計算 (monthlyAggregation.ts の権威定義に一致) =====
    const pct = (a1: number, b: number) => (b > 0 ? Math.round((a1 / b) * 100 * 10) / 10 : 0);
    const intDiv = (a1: number, b: number) => (b > 0 ? Math.round(a1 / b) : 0);

    result[cat] = {
      ...s,
      total_count: count,                       // 実効件数で上書き
      total_profit: profit,
      profit_rate: revenue > 0 ? Math.round((profit / revenue) * 100 * 10) / 10 : 0, // 赤字なら負
      ad_rate: pct(adCost, revenue),
      cpa: intDiv(adCost, acqCount),
      conv_rate: pct(acqCount, callCount),
      unit_price: intDiv(revenue, count),
      call_unit_price: intDiv(adCost, callCount),
      help_unit_price: intDiv(helpRevenue, helpCount),
      vehicle_count: a.snapshot.vehicle_count ?? 0,
      trainee_count: a.snapshot.trainee_count ?? 0,
      as_of_day: a.snapshot.as_of_day ?? 0,
      business_category: cat,
      area_id: "ytd_aggregated",
      year: a.year,
      month: a.maxMonth, // YTD の最新月 (as-of 月)
    };
  }
  return result;
}

// ============ 年次目標 (ペース比 + 年間絶対額) ============

// そのまま加算できる目標の絶対値フィールド (company-aggregations.ts と同一方針)。
// 率・派生値 (targetCpa/targetAdRate 等) は加算せず、合算後に再計算する。
const SUMMABLE_TARGET_KEYS: ReadonlyArray<keyof Targets> = [
  "targetSales", "targetProfit", "targetCount",
  "targetHelpSales", "targetHelpCount",
  "targetSelfSales", "targetSelfProfit", "targetSelfCount",
  "targetNewSales", "targetNewProfit", "targetNewCount",
  "targetAdCost",
  "targetVehicleCount", "targetTraineeCount", "targetCallCount",
  "targetMeetingCount", "targetSwitchboardCount",
];

/** 合算済み目標の絶対値から派生値 (CPA/単価/率) を再計算する。 */
function recomputeTargetDerived(t: Targets): Targets {
  return {
    ...t,
    targetCpa: t.targetCount > 0 ? Math.round(t.targetAdCost / t.targetCount) : 0,
    targetUnitPrice: t.targetCount > 0 ? Math.round(t.targetSales / t.targetCount) : 0,
    targetCallUnitPrice: t.targetCallCount > 0 ? Math.round(t.targetAdCost / t.targetCallCount) : 0,
    targetHelpUnitPrice: t.targetHelpCount > 0 ? Math.round(t.targetHelpSales / t.targetHelpCount) : 0,
    targetAdRate: t.targetSales > 0 ? Math.round((t.targetAdCost / t.targetSales) * 1000) / 10 : 0,
    targetConversionRate: t.targetCallCount > 0 ? Math.round((t.targetCount / t.targetCallCount) * 1000) / 10 : 0,
    targetHelpRate: t.targetSales > 0 ? Math.round((t.targetHelpSales / t.targetSales) * 1000) / 10 : 0,
    targetPassRate: t.targetCallCount > 0 ? Math.round((t.targetCount / t.targetCallCount) * 1000) / 10 : 0,
    // 費用・工事系の目標フィールドは存在しないため計算不可 (UI で「—」)
    targetLaborRate: 0, targetMaterialRate: 0, targetConstructionRate: 0, targetMeetingRate: 0,
  };
}

export type YearlyTargets = {
  /** 達成ペース比の分母: 経過済み月 100% + 当月を asOfDay/daysInMonth で日割り按分。 */
  pacing: Targets;
  /** 年間目標の絶対額: YTD 有効月 (>=202605) の 100% 合算 (参考表示用)。 */
  fullYear: Targets;
};

/**
 * 年次目標を「達成ペース比 (当月日割り按分)」と「年間絶対額」の 2 系統で算出する。
 *
 * ミッドマンス・ノコギリ (当月の満額目標 vs 数日分の実績で達成率が暴落する現象) を、
 * 当月目標を asOfDay/daysInMonth で日割り按分することで構造的に解消する。
 *
 * @param rows 目標の月別配列。targets は manToYen 済み (円単位) を渡すこと。
 * @param opts viewYear (閲覧年) / currentYear / currentMonth / asOfDay / daysInMonth。
 */
export function aggregateYearlyTargets(
  rows: Array<{ year: number; month: number; targets: Targets }>,
  opts: { viewYear: number; currentYear: number; currentMonth: number; asOfDay: number; daysInMonth: number },
): YearlyTargets {
  const { viewYear, currentYear, currentMonth, asOfDay, daysInMonth } = opts;
  // 過去年を見るときは 12 月まで全て経過済み。当年は当月まで。
  const elapsedCap = viewYear < currentYear ? 12 : currentMonth;
  const frac = daysInMonth > 0 ? Math.min(1, Math.max(0, asOfDay / daysInMonth)) : 0;

  const fullYear = emptyTargets();
  const pacing = emptyTargets();

  for (const { year, month, targets } of rows) {
    // 4月以前ガード (整数比較)
    if (year * 100 + month < YTD_MIN_YYYYMM) continue;

    for (const k of SUMMABLE_TARGET_KEYS) {
      (fullYear[k] as number) += targets[k] as number;
    }
    if (month < elapsedCap) {
      // 経過済みの月: 100%
      for (const k of SUMMABLE_TARGET_KEYS) (pacing[k] as number) += targets[k] as number;
    } else if (month === elapsedCap) {
      // 進行中の当月: 日割り按分
      for (const k of SUMMABLE_TARGET_KEYS) (pacing[k] as number) += (targets[k] as number) * frac;
    }
    // month > elapsedCap (未来月): ペースには入れない
  }

  return { pacing: recomputeTargetDerived(pacing), fullYear: recomputeTargetDerived(fullYear) };
}
