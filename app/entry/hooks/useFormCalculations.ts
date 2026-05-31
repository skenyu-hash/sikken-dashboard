// useFormCalculations: 仕様書 §4.2 / §4.3 の auto 11 項目をリアクティブ計算。
//
// 計算式は仕様書に厳密一致。0 除算は safeDiv で防止 (0 を返す)。
// 入力値が空文字 ("") の場合は 0 とみなす。

import { useMemo } from "react";
import type { EntryFormState, AutoCalcResult, InputValue } from "../types";
import { sumHelpSales, sumHelpCount } from "../lib/helpStaffUtils";

const num = (v: InputValue): number => (v === "" ? 0 : v);
const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

export function useFormCalculations(state: EntryFormState): AutoCalcResult {
  return useMemo(() => {
    // 入力値の数値化
    const f2 = num(state.outsourced_sales_revenue);
    const f3 = num(state.internal_staff_revenue);
    const f5 = num(state.outsourced_response_count);
    const f6 = num(state.internal_staff_response_count);
    const f11 = num(state.total_labor_cost);
    const f12 = num(state.material_cost);
    const f13 = num(state.sales_outsourcing_cost);
    const f14 = num(state.card_processing_fee);
    const f15 = num(state.ad_cost);
    const f16 = num(state.call_count);
    const f18 = num(state.acquisition_count);
    // PR c93-2: ④ 施工セクションを対応ベースに再構成。
    //   旧: f21 = f22 + f23 (総工事件数 = outsourced + internal 発注ベース合算)
    //       f26 = f24 - f25 (実質工事コスト = outsourced_cost - internal_profit)
    //   新: construction_count (対応ベース 1 入力) + internal_construction_ratio (auto)
    //   f22 (outsourced_construction_count) は state 残置のみ、useFormCalculations では未使用。
    //   f24 / f25 は state 残置 (cost / profit 入力フィールドとして UI 継続) だが本関数では
    //   f26 廃止に伴い未参照、profit.ts / monthlyAggregation で別途集計される。
    const f_construction_count = num(state.construction_count); // 新規入力 (対応ベース)
    const f_internal_construction_count = num(state.internal_construction_count); // 意味変更
    // PR c95-A-2: HELP は help_staff 配列の SUM。f27 = Σ help_count、f28 = Σ help_sales。
    //   旧 state.help_count / state.help_revenue スカラーは撤去。helpStaffUtils に集約。
    const f27 = sumHelpCount(state.help_staff);
    const f28 = sumHelpSales(state.help_staff);

    // ① 新規対応 (auto 3)
    const f1 = f2 + f3; // 全体売上
    const f4 = f5 + f6; // 合計対応件数
    const f7 = safeDiv(f1, f4); // 客単価

    // ③ 広告費 (auto 3)
    const f17 = safeDiv(f15, f16); // 入電単価
    const f19 = safeDiv(f15, f18); // CPA
    const f20 = safeDiv(f18, f16) * 100; // 成約率

    // ④ 施工 (auto 1) — PR c93-2 で 2 → 1 縮減
    //   旧 f21 (総工事件数) / f26 (実質工事コスト) は対応ベース移行で廃止。
    //   新 auto: 自社工事比率 = 内製化件数 ÷ 工事件数 × 100。
    //   分母 0 のとき 0 にフォールバック (NaN / Infinity 防止)。
    const f_internal_construction_ratio = f_construction_count > 0
      ? (f_internal_construction_count / f_construction_count) * 100
      : 0;

    // ⑤ HELP (auto 1)
    const f29 = safeDiv(f28, f27); // HELP単価

    // ⑥ 粗利 (auto 1) — PR c93-1 で 2 → 1 に縮減
    //   旧 f31 = f30 + f25 (合計粗利 / 内製化ボーナス加算) は二重計上のため廃止。
    //   各社統計表で既に自社施工分を粗利に織り込み済 → bonus 加算は実態と乖離していた。
    //   f25 (internal_construction_profit / 自社工事利益) は入力 / 集計対象として残すが、
    //   粗利には加算しない (把握用、c93-2 で再設計予定)。
    const f30 = f1 - f12 - f11 - f15 - f13 - f14; // 粗利

    return {
      total_revenue: f1,
      total_response_count: f4,
      unit_price: f7,
      call_unit_price: f17,
      cpa: f19,
      conv_rate: f20,
      // PR c93-2: 旧 total_construction_count (f21) / actual_construction_cost (f26) は廃止、
      //   新 internal_construction_ratio (自社工事比率) のみ
      internal_construction_ratio: f_internal_construction_ratio,
      help_unit_price: f29,
      profit: f30,
    };
  }, [state]);
}
