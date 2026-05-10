-- SIKKEN Dashboard 新フォーム用 monthly_summaries 列追加
-- 生成日: 2026-05-11
-- 仕様書: docs/specs/spec-form-redesign.md §B-2-1 (水道フォーム31フィールド)
--
-- 設計方針 (A2 + B1 + C3):
--   A2: auto 計算項目は DB 保存せずクライアント側計算のみ
--   B1: 既存4列 (ad_cost / call_count / call_unit_price / conv_rate) は
--       リネームせず pick() ヘルパーでエイリアス対応
--   C3: 粗利 f30/f31 は DB 保存せず計算のみ
--
-- 追加列: 15個 (全て NULL 許容、DEFAULT 0、冪等)
--
-- 影響:
--   既存データ: 影響なし (DEFAULT 0 で過去行も自動補完)
--   既存 API: pick() 拡張のため後方互換完全維持

BEGIN;

-- ① 新規対応 (7列)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS outsourced_sales_revenue NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS internal_staff_revenue NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS outsourced_response_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS internal_staff_response_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS repeat_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS revisit_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0;

-- ② コスト (4列)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS total_labor_cost NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS material_cost NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS sales_outsourcing_cost NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS card_processing_fee NUMERIC NOT NULL DEFAULT 0;

-- ④ 施工 (4列)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS outsourced_construction_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS internal_construction_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS outsourced_construction_cost NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS internal_construction_profit NUMERIC NOT NULL DEFAULT 0;

-- 検証クエリ (適用後の確認)
SELECT 'after_migration' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'monthly_summaries';
-- 期待: 23 (既存) + 15 (新規) = 38

SELECT 'new_columns' AS label, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'monthly_summaries'
  AND column_name IN (
    'outsourced_sales_revenue', 'internal_staff_revenue',
    'outsourced_response_count', 'internal_staff_response_count',
    'repeat_count', 'revisit_count', 'review_count',
    'total_labor_cost', 'material_cost', 'sales_outsourcing_cost', 'card_processing_fee',
    'outsourced_construction_count', 'internal_construction_count',
    'outsourced_construction_cost', 'internal_construction_profit'
  )
ORDER BY column_name;
-- 期待: 15 行

SELECT 'existing_data_preserved' AS label, COUNT(*) AS row_count FROM monthly_summaries;
-- 期待: 移行前と同じ行数 (現在 135 + テスト時に追加された行数)

COMMIT;
