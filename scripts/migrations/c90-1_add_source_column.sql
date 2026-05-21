-- PR c90-1: monthly_summaries に書き込み出所追跡列を追加
-- 実行: Neon Console から手動 (psql) 適用
-- 冪等: IF NOT EXISTS で複数回実行しても安全

BEGIN;

ALTER TABLE monthly_summaries
  ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'unknown';

ALTER TABLE monthly_summaries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 検証クエリ (COMMIT 前に SELECT で内容確認)
SELECT
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'monthly_summaries'
  AND column_name IN ('source', 'updated_at')
ORDER BY column_name;

-- 既存行は 'unknown' / NOW() で埋まる。
-- 今後の書き込みで source は 'entries_aggregation' (差分経路) または
-- 'file_import' (累積経路) に更新される。

COMMIT;
