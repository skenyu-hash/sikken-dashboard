import { resolveTotalProfit } from "./profit";
import type { BusinessCategory } from "./businesses";

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
