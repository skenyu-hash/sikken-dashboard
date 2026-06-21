// targets テーブル 1 行 (snake_case) → Targets 型 (camelCase) の純粋マッパー。
//
// db.ts getTargets() 内に同等のインライン変換があるが、そちらは動作中の月次経路 (絶対不変)
// のため touch せず、年次 targets-bulk 用に純粋関数として独立切り出し (テスト可能化)。
// 将来 getTargets と統一する余地あり (別 PR の cleanup 候補)。
//
// 値は DB 格納値そのまま (万円フィールドは万円のまま)。円換算は呼び出し側で manToYen() を適用する
// (Dashboard 既存の fetch→manToYen→setTargets と同じ流儀)。

import type { Targets } from "./calculations";

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** targets テーブル 1 行を Targets 型へ変換する (db.ts getTargets のマッピングに一致)。 */
export function rowToTargets(r: Record<string, unknown>): Targets {
  return {
    targetSales: num(r.target_sales),
    targetProfit: num(r.target_profit),
    targetCount: num(r.target_count),
    targetCpa: num(r.target_cpa),
    targetConversionRate: num(r.target_conversion_rate),
    targetHelpSales: num(r.target_help_sales),
    targetHelpCount: num(r.target_help_count),
    targetHelpUnitPrice: num(r.target_help_unit_price),
    targetSelfSales: num(r.target_self_sales),
    targetSelfProfit: num(r.target_self_profit),
    targetSelfCount: num(r.target_self_count),
    targetNewSales: num(r.target_new_sales),
    targetNewProfit: num(r.target_new_profit),
    targetNewCount: num(r.target_new_count),
    targetAdCost: num(r.target_ad_cost),
    targetAdRate: num(r.target_ad_rate),
    targetLaborRate: num(r.target_labor_rate),
    targetMaterialRate: num(r.target_material_rate),
    targetVehicleCount: num(r.target_vehicle_count),
    targetTraineeCount: num(r.target_trainee_count),
    targetCallCount: num(r.target_call_count),
    targetConstructionRate: num(r.target_construction_rate),
    targetPassRate: num(r.target_pass_rate),
    targetUnitPrice: num(r.target_unit_price),
    targetCallUnitPrice: num(r.target_call_unit_price),
    targetHelpRate: num(r.target_help_rate),
    targetMeetingCount: num(r.target_meeting_count),
    targetMeetingRate: num(r.target_meeting_rate),
    targetSwitchboardCount: num(r.target_switchboard_count),
  };
}
