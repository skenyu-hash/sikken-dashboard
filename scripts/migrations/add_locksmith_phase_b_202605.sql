-- SIKKEN Dashboard 鍵業態 Phase B 列追加
-- 生成日: 2026-05-18
-- 仕様: PR #51 鍵業態 DB + フォーム保存 + 業態別ダッシュボード
--
-- 背景:
--   PR #48b で LocksmithForm は実装したが、業態固有の内訳・コスト項目は
--   UI のみ (DB 保存対象外) だった:
--     - 獲得 4 内訳 (車LP+メール / インハウス / リピート / 再訪問)
--     - 工事費 (PR #48b では total_labor_cost に流用保存)
--     - 手数料 (PR #48b では sales_outsourcing_cost に流用保存)
--   本 PR で鍵専用カラムを追加し、内訳の永続化 + コストの専用カラム化を行う。
--
-- 設計方針:
--   - 全カラム NOT NULL DEFAULT 0 (既存行は 0 で自動補完)
--   - 鍵以外の業態では常に 0 で保存される (他業態への影響なし)
--   - 工事費/手数料は新カラム使用に切替、calc.profit は handleSave 側で
--     category-aware に独自計算 (論点 1 案 A)
--   - 入電内訳 (車LP+メール 入電 / インハウス 入電) は本 PR では未対応
--     (Phase B 後続で必要なら追加検討)
--
-- 影響:
--   既存データ: 影響なし (DEFAULT 0、locksmith データは全て 0 状態を確認済)
--   既存 API: pick() エイリアス追加のみ、後方互換完全維持

BEGIN;

-- 鍵業態 獲得 4 内訳 (件数)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS locksmith_car_lp_email_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS locksmith_inhouse_count      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS locksmith_repeat_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS locksmith_revisit_count      INTEGER NOT NULL DEFAULT 0;

-- 鍵業態 コスト 2 項目 (円)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS locksmith_construction_cost  NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS locksmith_commission_fee     NUMERIC NOT NULL DEFAULT 0;

-- 検証クエリ (適用後の確認)
SELECT 'after_migration' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'monthly_summaries';
-- 期待: 39 (PR #48b 後) + 6 (本 PR) = 45

SELECT 'new_columns' AS label, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'monthly_summaries'
  AND column_name IN (
    'locksmith_car_lp_email_count', 'locksmith_inhouse_count',
    'locksmith_repeat_count', 'locksmith_revisit_count',
    'locksmith_construction_cost', 'locksmith_commission_fee'
  )
ORDER BY column_name;
-- 期待: 6 行

SELECT 'existing_data_preserved' AS label, COUNT(*) AS row_count FROM monthly_summaries;

COMMIT;
