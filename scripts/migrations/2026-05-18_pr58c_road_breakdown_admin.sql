-- ================================================================
-- PR #58c: ロード業態 入電 7 内訳 + 保険売上 + 販管費 DB 化 (Phase B 完結、PR #58b 同型)
-- ================================================================
-- 実行日: 2026-05-18
-- 仕様: Phase B 残課題の最終ピース (ロード業態)、PR #58b 同型
--
-- 注意: road_*_count = 獲得件数 (PR #52)、road_*_call_count = 入電件数 (本 PR、PR #58c)
-- 特に保険関連の 3 列は概念が異なるので注意:
--   road_insurance_count       = 保険会社経由の獲得件数 (既存、PR #52)
--   road_insurance_call_count  = 保険会社経由の入電件数 (新規、本 PR)
--   road_insurance_revenue     = 保険業務由来の売上 (新規、本 PR、保険でカバーされる業務)
--
-- 背景:
--   PR #52 でロード業態 7 獲得チャネルを DB 化したが、入電 7 内訳・保険売上 2 分割・販管費は
--   localState のみで編集モード復元なし & ダッシュボード/会議で「(UI のみ)」表示のまま。
--   本 PR で 10 列追加し、ロード業態の Phase B 残課題を完全解消する。
--
-- 設計方針 (PR #58b と完全同型):
--   - 入電 7 列 INTEGER NOT NULL DEFAULT 0
--   - 保険売上 2 列 BIGINT NOT NULL DEFAULT 0 (売上スケール、total_revenue と整合)
--   - 販管費 1 列 INTEGER NOT NULL DEFAULT 0 (円単位、万円換算なし)
--   - ロード以外の業態では常に 0
--   - 入電 7 内訳の合計は call_count に sync (RoadForm 内で計算)
--   - 保険売上 + 無保険売上 = total_revenue は強制しない (splitMismatch warning のみ、記録優先)
--   - 営業利益式は変更しない (sales - adCost - sales_outsourcing_cost のまま、販管費は記録のみ)
--     → 営業利益への販管費反映は将来 PR で別途検討

BEGIN;

-- 入電 7 内訳 (広告 / リピート / 紹介 / 再訪 / Wellnest / SEO / 保険)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_ad_call_count        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_repeat_call_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_referral_call_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_revisit_call_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_wellnest_call_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_seo_call_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_insurance_call_count INTEGER NOT NULL DEFAULT 0;

-- 保険売上 2 分割 (売上スケール、BIGINT)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_insurance_revenue     BIGINT NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_non_insurance_revenue BIGINT NOT NULL DEFAULT 0;

-- 販管費 (円単位、万円換算なし)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_selling_admin_cost INTEGER NOT NULL DEFAULT 0;

-- 検証クエリ
SELECT 'monthly_summaries_columns' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'monthly_summaries';
-- 期待: PR #58b 後 65 列 + 10 = 75 列

SELECT 'new_columns' AS label, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'monthly_summaries'
  AND column_name IN (
    'road_ad_call_count', 'road_repeat_call_count', 'road_referral_call_count',
    'road_revisit_call_count', 'road_wellnest_call_count', 'road_seo_call_count',
    'road_insurance_call_count',
    'road_insurance_revenue', 'road_non_insurance_revenue',
    'road_selling_admin_cost'
  )
ORDER BY column_name;
-- 期待: 10 行

SELECT 'existing_data_preserved' AS label, COUNT(*) AS row_count FROM monthly_summaries;

COMMIT;
