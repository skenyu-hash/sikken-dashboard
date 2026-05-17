-- ================================================================
-- PR #51.3: water/kansai/2026-05 の total_profit 整合性バックフィル
-- ================================================================
-- 実行日: 2026-05-18
-- 実行者: Web Claude 承認 + Claude Code 実行 (本番 Neon に適用済)
-- 対象: monthly_summaries の 1 行 (area_id='kansai', business_category='water',
--       year=2026, month=5)
--
-- 背景:
--   PR #51.2 Phase 1 調査で発覚:
--     対象行は /import-monthly 経由で投入されたため total_profit=0 のまま保存。
--     しかし構成要素 (total_labor_cost / material_cost / ad_cost /
--     sales_outsourcing_cost) は正しく入っており、再計算可能。
--   PR #51.2 で client-side フォールバックを実装済 (画面表示は ¥14,712,578)。
--   本 PR で DB 値も同じ正規値に揃え、データ整合性を回復する。
--
-- 単一行スコープ:
--   全業態の影響範囲確認 SQL (PR #51.2 調査時) では本行のみが該当:
--     total_profit=0 かつ total_revenue>0 の legacy 行 = 1 行 (water/kansai/2026-05)
--
-- 安全策:
--   - BEGIN/COMMIT トランザクション
--   - WHERE 句に複合 PK + total_profit=0 安全弁 (冪等、再実行で 0 行)
--   - UPDATE 後の検証 SELECT 必須
--   - 新カラム (outsourced_*, internal_*) は触らない (事業判断保留、別 PR で検討)
--
-- 期待値 (Step 1 dry-run で検証済):
--   total_profit = 35443020 - 6408500 - 3256865 - 6193244 - 4871833 - 0
--                = 14712578
--   profit_rate  = ROUND(14712578 / 35443020 * 100, 1) = 41.5
--
-- ユーザー体験への影響:
--   なし。PR #51.2 のフォールバックで既に ¥14,712,578 が表示されているため、
--   DB 値の修正後も画面表示は変化しない (フォールバック値 = DB 値)。
--
-- 実行ログ (本番 Neon):
--   BEGIN
--   UPDATE 1
--   updated row count = 1
--   検証 SELECT: total_profit=14712578 / profit_rate=41.5
--   COMMIT
-- ================================================================

BEGIN;

UPDATE monthly_summaries
SET
  total_profit = total_revenue - total_labor_cost - material_cost - ad_cost - sales_outsourcing_cost - card_processing_fee,
  profit_rate = ROUND(
    ((total_revenue - total_labor_cost - material_cost - ad_cost - sales_outsourcing_cost - card_processing_fee)::numeric
      / NULLIF(total_revenue, 0)) * 100,
    1
  )
WHERE area_id='kansai' AND business_category='water' AND year=2026 AND month=5
  AND total_profit = 0;  -- 安全弁: 既に正しい値の行は触らない (冪等)

-- 影響行数確認
SELECT 'updated row count' AS info, COUNT(*) AS n
FROM monthly_summaries
WHERE area_id='kansai' AND business_category='water' AND year=2026 AND month=5
  AND total_profit = 14712578;

-- 検証 SELECT
SELECT area_id, business_category, year, month, as_of_day,
       total_revenue, total_profit, profit_rate
FROM monthly_summaries
WHERE area_id='kansai' AND business_category='water' AND year=2026 AND month=5;

COMMIT;
