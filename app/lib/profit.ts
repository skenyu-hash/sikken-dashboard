// PR #51.2 hotfix: monthly_summaries.total_profit が 0 のままになっている
// legacy 行 (PR #38 以前 / /import-monthly 経由で profit 計算なしに保存) を
// ダッシュボード表示時に構成要素から再計算するフォールバック関数。
//
// 設計:
//   - DB の total_profit > 0 ならそれを採用 (正しく計算保存されたデータを尊重)
//   - DB の total_profit = 0 かつ revenue > 0 のときのみ構成要素から再計算
//   - 業態 (business_category) 別に粗利の構成要素が異なる:
//       water/electric/road/detective: revenue - total_labor_cost - material_cost
//         - ad_cost - sales_outsourcing_cost - card_processing_fee
//       locksmith: revenue - locksmith_construction_cost - material_cost
//         - ad_cost - locksmith_commission_fee
//         (PR #51 で工事費・手数料を専用カラムに切替、locksmith handleSave 側で
//          category-aware に total_profit を保存しているが、legacy 行は 0 の可能性)
//   - business_category は summary row 自体から読む (caller 側で渡す必要なし)
//
// 影響範囲 (Phase 1 hotfix では): Dashboard.tsx / /meeting / /trends / /breakeven
// API 側 SQL 集計 (cross-matrix / export) は別途検討 (PR #51.3 候補)
//
// PR c95-B-4a: water 業態の 2026/5 以降に 7.7% コンサル費控除を追加。
//   monthlyAggregation (c95-B-2) / day-level (c95-B-3) と同じ semantics で
//   read fallback 経路でも控除後値を返すよう揃える。
//   設計判断 (number-verifier 検証済):
//     1. SummaryLike に year/month を optional 追加。月境界 (yyyymm >= 202605)
//        は consultantFee() helper 内ガードを利用 (二重保護)。
//     2. dbProfit > 0 早期 return はそのまま。c95-B-2 で aggregation 経由保存
//        された行は既に控除後値が入っている前提。
//     3. /import-monthly 経由で water 5月以降を Excel 投入すると、控除前 profit
//        が DB に書かれ dbProfit > 0 早期 return がそれをそのまま返す → 約 7.7%
//        over-report が発生する潜在問題あり (KNOWN_ISSUES.md #8 参照)。
//        対応は c95-B-5 で検討。本 PR では legacy 0 値行 fallback 経路のみカバー。

type SummaryLike = {
  total_profit?: number | string | null;
  total_revenue?: number | string | null;
  business_category?: string | null;
  total_labor_cost?: number | string | null;
  material_cost?: number | string | null;
  ad_cost?: number | string | null;
  sales_outsourcing_cost?: number | string | null;
  card_processing_fee?: number | string | null;
  locksmith_construction_cost?: number | string | null;
  locksmith_commission_fee?: number | string | null;
  // PR c95-B-4a: water control 7.7% 控除の月境界判定に使用 (yyyymm >= 202605)。
  //   monthly_summaries は year/month NOT NULL カラム持ち + API は SELECT * のため
  //   実運用 caller は自動で値が乗る。テスト等で省略された場合は consultantFee()
  //   helper 内で yyyymm=0 < 202605 → 控除 0 にフォールバック (= 既存挙動維持)。
  year?: number | string | null;
  month?: number | string | null;
};

import { consultantFee, toYyyyMm } from "./consultantFee";

const numOf = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * monthly_summaries 行から total_profit を解決する。
 * legacy 行 (total_profit=0) は構成要素から再計算する category-aware フォールバック付き。
 *
 * @param summary monthly_summaries 1 行 (null/undefined OK、業態は row 自体から推定)
 * @returns total_profit (DB 値が 0 でも非ゼロを返し得る)
 */
export function resolveTotalProfit(summary: SummaryLike | null | undefined): number {
  if (!summary) return 0;
  const dbProfit = numOf(summary.total_profit);
  if (dbProfit > 0) return dbProfit;
  const revenue = numOf(summary.total_revenue);
  if (revenue <= 0) return 0;
  const category = typeof summary.business_category === "string" ? summary.business_category : "water";
  let derived: number;
  if (category === "locksmith") {
    // PR #51 schema: 工事費 / 手数料 を専用カラムへ
    derived = revenue
      - numOf(summary.locksmith_construction_cost)
      - numOf(summary.material_cost)
      - numOf(summary.ad_cost)
      - numOf(summary.locksmith_commission_fee);
  } else {
    // water / electric / road / detective: 既存 calc.profit 式 (f30) と同等
    // (detective は ad_cost のみ非ゼロで他は 0 → revenue - ad と一致)
    // (road は sales_outsourcing_cost = 手数料 で扱う、material/labor は 0)
    //
    // PR c93-1 整合性確認: 本式は internal_construction_profit を加算しない f30 ベース。
    //   c93-1 で aggregation 側から内製化ボーナス加算 (+ sum_internal_construction_profit)
    //   を撤去した後の monthly_summaries.total_profit と同じ semantics となる
    //   (= legacy 行 total_profit=0 フォールバック時も新仕様と整合)。
    //   c93-1 では本関数を touch せず、上記コメントだけ更新。関数名 resolveTotalProfit は
    //   命名と実体に若干 gap があるが (実体は profit=f30 を返す)、rename は別 PR で検討。
    derived = revenue
      - numOf(summary.total_labor_cost)
      - numOf(summary.material_cost)
      - numOf(summary.ad_cost)
      - numOf(summary.sales_outsourcing_cost)
      - numOf(summary.card_processing_fee);
  }
  // PR c95-B-4a: water + 2026/5 以降のみ 7.7% コンサル費を末尾控除。
  //   consultantFee() helper が二重ガード (rate > 0 / yyyymm >= 202605 / revenue > 0)
  //   を持つため、year/month 欠落・過去月は控除 0 で既存挙動を保つ。
  //   SUM(日次) / 月次 SQL aggregation と整数粒度で一致させるため Math.round で揃える
  //   (monthlyAggregation 側は ROUND(...)::BIGINT)。
  if (category === "water") {
    const yyyymm = toYyyyMm(numOf(summary.year), numOf(summary.month));
    derived -= consultantFee("water", revenue, yyyymm);
  }
  return Math.max(0, Math.round(derived));
}
