-- SIKKEN Dashboard 電気業態向け 分電盤件数 列追加
-- 生成日: 2026-05-16
-- 仕様: PR #48b v3 業態別フォーム実装
--
-- 背景:
--   電気業態でのみ意味を持つ「分電盤件数」を monthly_summaries に追加。
--   他業態 (水道/鍵/ロード/探偵) では常に 0。
--   業態別フォーム (PR #48b) で電気 ElectricForm のみ入力欄を表示する。
--
-- 設計方針:
--   - 単一列追加のシンプル拡張 (PR #38 の 15 列追加と同パターン)
--   - 既存業態別 JSONB 化はせず、列追加で対応 (将来 Phase B で再検討)
--   - NULL 許容ではなく NOT NULL DEFAULT 0 (既存行は 0 で自動補完)
--
-- 影響:
--   既存データ: 影響なし (DEFAULT 0 で過去行も自動補完)
--   既存 API: pick("switchboard_count") 追加のみ、後方互換完全維持

BEGIN;

-- 電気業態 分電盤件数 (1列)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS switchboard_count INTEGER NOT NULL DEFAULT 0;

-- 検証クエリ (適用後の確認)
SELECT 'after_migration' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'monthly_summaries';
-- 期待: 38 (PR #38 後) + 1 (本 PR) = 39

SELECT 'new_column' AS label, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'monthly_summaries'
  AND column_name = 'switchboard_count';
-- 期待: 1 行 (integer, default 0, NOT NULL)

SELECT 'existing_data_preserved' AS label, COUNT(*) AS row_count FROM monthly_summaries;
-- 期待: 移行前と同じ行数

COMMIT;
