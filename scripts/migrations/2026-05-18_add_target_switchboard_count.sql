-- ================================================================
-- PR #54: 電気業態 分電盤件数目標カラム追加
-- ================================================================
-- 実行日: 2026-05-18
-- 仕様: 電気業態 4 レイヤー連動 (Web Claude 承認、3 点 OK)
--
-- 背景:
--   PR #48b で monthly_summaries.switchboard_count (実績) は追加済だが、
--   targets テーブルには対応する目標カラムが未存在。
--   本 PR で 1 列追加し、/targets 電気タブで分電盤件数目標を入力可能に、
--   ElectricDashboardSection で達成率比較を可能にする。
--
-- 設計方針:
--   - INTEGER NOT NULL DEFAULT 0 (他業態では常に 0 で保存)
--   - 既存データに影響なし (DEFAULT 0)
--
-- スコープ:
--   monthly_summaries.switchboard_count: 既存 (PR #48b で追加済、本 PR では無変更)
--   targets.target_switchboard_count   : **本 PR で追加 (1 列のみ)**

BEGIN;

ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_switchboard_count INTEGER NOT NULL DEFAULT 0;

-- 検証クエリ
SELECT 'targets_columns' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'targets';

SELECT 'new_column' AS label, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'targets' AND column_name = 'target_switchboard_count';

SELECT 'existing_targets_preserved' AS label, COUNT(*) AS row_count FROM targets;

COMMIT;
