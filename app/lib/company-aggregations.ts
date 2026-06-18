import { resolveTotalProfit } from "./profit";
import type { BusinessCategory } from "./businesses";
import { emptyTargets, type Targets } from "./calculations";

// Targets の絶対値フィールド（そのまま加算できるもの）
// 率・派生値（CPA/単価）は加算せず、後で合算後の絶対値から再計算する
const SUMMABLE_TARGET_KEYS: ReadonlyArray<keyof Targets> = [
  "targetSales", "targetProfit", "targetCount",
  "targetHelpSales", "targetHelpCount",
  "targetSelfSales", "targetSelfProfit", "targetSelfCount",
  "targetNewSales", "targetNewProfit", "targetNewCount",
  "targetAdCost",
  "targetVehicleCount", "targetTraineeCount", "targetCallCount",
  "targetMeetingCount",
  "targetSwitchboardCount",
];

// 数値として加算しないメタ列（文字列・日時・ID系）
const META_KEYS = new Set([
  "id",
  "business_category",
  "year",
  "month",
  "area_id",
  "total_profit", // 別途 resolveTotalProfit() で計算するため除外
  "created_at",
  "updated_at",
]);

/**
 * 会社の全 (category, area) ペアの monthly_summary を業態別に合算する。
 *
 * total_profit は各行で resolveTotalProfit() を確定してから加算する。
 * これにより water の consultant_fee が二重控除されるのを防ぐ
 * （合算後の行は total_profit > 0 のため resolveTotalProfit が再計算をスキップする）。
 *
 * CPA・成約率などの「割り算指標」は各 Section コンポーネントが
 * 合算済みの分母・分子から動的に再計算するため、ここでは合算しない。
 */
export function aggregateSummariesByCategory(
  pairs: Array<{ category: BusinessCategory; summary: Record<string, unknown> | null }>,
): Partial<Record<BusinessCategory, Record<string, unknown>>> {
  const result: Partial<Record<BusinessCategory, Record<string, unknown>>> = {};

  for (const { category, summary } of pairs) {
    if (!summary) continue;

    if (!result[category]) {
      // 初回: シャローコピーしてメタ列を調整、粗利を事前計算して上書き
      result[category] = {
        ...summary,
        area_id: "company_aggregated",
        total_profit: resolveTotalProfit(summary),
      };
      continue;
    }

    const current = result[category]!;

    // 粗利: 各行を resolveTotalProfit() で確定して加算
    current.total_profit =
      (Number(current.total_profit) || 0) + resolveTotalProfit(summary);

    // 数値列を単純加算（メタ列・非数値はスキップ）
    for (const [key, val] of Object.entries(summary)) {
      if (META_KEYS.has(key)) continue;
      const numVal = typeof val === "number" ? val : Number(val);
      if (!Number.isFinite(numVal)) continue;
      current[key] = (Number(current[key]) || 0) + numVal;
    }
  }

  return result;
}

/**
 * 会社の全 (category, area) ペアの targets を業態別に合算する。
 *
 * 絶対値フィールド（targetSales/targetProfit 等）はそのまま加算する。
 * 派生値フィールド（targetCpa/targetUnitPrice 等）は合算後の絶対値から再計算する。
 * 率フィールドのうち分母・分子が SUMMABLE_TARGET_KEYS にあるものは合算後に再計算する。
 * 費用系（職人費率・材料費率等）は費用の目標フィールドが存在しないため 0（UI で「—」表示）。
 *
 * 呼び出し前に manToYen() を適用済みの Targets を渡すこと。
 */
export function aggregateTargetsByCategory(
  pairs: Array<{ category: BusinessCategory; targets: Targets }>,
): Partial<Record<BusinessCategory, Targets>> {
  const sums: Partial<Record<BusinessCategory, Targets>> = {};

  for (const { category, targets } of pairs) {
    if (!sums[category]) {
      sums[category] = emptyTargets();
    }
    const s = sums[category]!;
    for (const key of SUMMABLE_TARGET_KEYS) {
      (s[key] as number) += targets[key] as number;
    }
  }

  const result: Partial<Record<BusinessCategory, Targets>> = {};
  for (const [cat, s] of Object.entries(sums)) {
    const sd = s!;
    result[cat as BusinessCategory] = {
      ...sd,
      // 派生値: 合算済み絶対値から再計算
      targetCpa:
        sd.targetCount > 0 ? Math.round(sd.targetAdCost / sd.targetCount) : 0,
      targetUnitPrice:
        sd.targetCount > 0 ? Math.round(sd.targetSales / sd.targetCount) : 0,
      targetCallUnitPrice:
        sd.targetCallCount > 0 ? Math.round(sd.targetAdCost / sd.targetCallCount) : 0,
      targetHelpUnitPrice:
        sd.targetHelpCount > 0 ? Math.round(sd.targetHelpSales / sd.targetHelpCount) : 0,
      // 率: 分母・分子ともに SUMMABLE_TARGET_KEYS にある → 合算後の絶対値から再計算
      targetAdRate: sd.targetSales > 0 ? Math.round(sd.targetAdCost / sd.targetSales * 1000) / 10 : 0,
      targetConversionRate: sd.targetCallCount > 0 ? Math.round(sd.targetCount / sd.targetCallCount * 1000) / 10 : 0,
      targetHelpRate: sd.targetSales > 0 ? Math.round(sd.targetHelpSales / sd.targetSales * 1000) / 10 : 0,
      targetPassRate: sd.targetCallCount > 0 ? Math.round(sd.targetCount / sd.targetCallCount * 1000) / 10 : 0,
      // 費用・工事件数の目標フィールドなし → 計算不可
      targetLaborRate: 0,
      targetMaterialRate: 0,
      targetConstructionRate: 0,
      targetMeetingRate: 0,
    };
  }

  return result;
}
