-- ================================================================
-- PR #58b: 探偵業態 獲得 6 内訳 + 販管費 DB 化 (Phase B 残課題、PR #57 同型)
-- ================================================================
-- 実行日: 2026-05-18
-- 仕様: Phase B 残課題の最終ピース、案 A 採用 (Web Claude 5/18 承認)
--
-- 背景:
--   PR #48b で DetectiveForm 6 獲得内訳 (3 媒体 × 2 カテゴリ) と 販管費は UI のみだった。
--   PR #57 で入電 4 内訳を DB 化したが、獲得・販管費は依然 localState 保持で
--   編集モード復元なし & ダッシュボード/会議で「(UI のみ)」表示のまま。
--   本 PR で 7 列追加し、探偵業態の Phase B 残課題を完全解消する。
--
-- 設計方針 (PR #57 と完全同型):
--   - 獲得 6 列 INTEGER NOT NULL DEFAULT 0
--   - 販管費 1 列 INTEGER NOT NULL DEFAULT 0 (円単位、万円換算なし)
--   - 探偵以外の業態では常に 0
--   - 獲得 6 内訳の合計は acquisition_count に sync (DetectiveForm 内で計算)
--   - 営業利益式は変更しない (sales - adCost のまま、販管費は記録のみ)
--     → 営業利益への販管費反映は将来 PR で別途検討

BEGIN;

-- 獲得 6 内訳 (3 媒体 × 2 カテゴリ)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_phone_uwaki_acquisition_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_phone_other_acquisition_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_mail_uwaki_acquisition_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_mail_other_acquisition_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_line_uwaki_acquisition_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_line_other_acquisition_count  INTEGER NOT NULL DEFAULT 0;

-- 販管費 (円単位、万円換算なし)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_selling_admin_cost INTEGER NOT NULL DEFAULT 0;

-- 検証クエリ
SELECT 'monthly_summaries_columns' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'monthly_summaries';
-- 期待: PR #57 後 58 列 + 7 = 65 列

SELECT 'new_columns' AS label, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'monthly_summaries'
  AND column_name IN (
    'detective_phone_uwaki_acquisition_count', 'detective_phone_other_acquisition_count',
    'detective_mail_uwaki_acquisition_count',  'detective_mail_other_acquisition_count',
    'detective_line_uwaki_acquisition_count',  'detective_line_other_acquisition_count',
    'detective_selling_admin_cost'
  )
ORDER BY column_name;
-- 期待: 7 行

SELECT 'existing_data_preserved' AS label, COUNT(*) AS row_count FROM monthly_summaries;

COMMIT;
