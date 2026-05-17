-- ================================================================
-- PR #53: 探偵業態 Phase B (面談ファネル DB 化)
-- ================================================================
-- 実行日: 2026-05-18
-- 仕様: 探偵業態 4 レイヤー連動 + 面談ファネル可視化 (Web Claude 案 C 採用)
--
-- 背景:
--   PR #48b で DetectiveForm を実装したが、面談プロセスセクションの
--   meetingCount / cancelCount は UI のみ (DB 保存対象外) だった。
--   本 PR で 2 列を専用カラムに永続化し、編集モード復元 + 面談ファネル
--   可視化を実現する。
--
--   さらに targets テーブルに面談数目標 + 面談率目標を追加し、
--   /targets 探偵タブで業態固有目標として入力可能にする。
--
-- 設計方針 (PR #51/#52 と同パターン):
--   - 全カラム NOT NULL DEFAULT 0
--   - 探偵以外の業態では常に 0
--   - 流用: アポ獲得数 = acquisition_count (既存)、アポ獲得率目標 =
--     target_conversion_rate (UI ラベルで「アポ獲得率目標」表示)
--   - 入電 4 内訳 / 獲得 6 内訳 / 販管費は引き続き UI only (Phase B 後続)
--
-- 影響:
--   既存データ: 影響なし (DEFAULT 0)
--   既存 API: pick エイリアス追加のみで後方互換完全維持

BEGIN;

-- monthly_summaries: 探偵業態 面談ファネル 2 列
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_meeting_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_cancel_count  INTEGER NOT NULL DEFAULT 0;

-- targets: 面談数目標 + 面談率目標 (探偵専用、他業態では 0 で保存)
ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_meeting_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE targets ADD COLUMN IF NOT EXISTS target_meeting_rate  NUMERIC NOT NULL DEFAULT 0;

-- 検証クエリ
SELECT 'monthly_summaries_columns' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'monthly_summaries';
-- 期待: 52 (PR #52 後) + 2 (本 PR) = 54

SELECT 'targets_columns' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'targets';

SELECT 'new_monthly_columns' AS label, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'monthly_summaries'
  AND column_name IN ('detective_meeting_count', 'detective_cancel_count')
ORDER BY column_name;

SELECT 'new_targets_columns' AS label, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'targets'
  AND column_name IN ('target_meeting_count', 'target_meeting_rate')
ORDER BY column_name;

SELECT 'existing_data_preserved' AS label, COUNT(*) AS monthly_rows FROM monthly_summaries;
SELECT 'existing_targets_preserved' AS label, COUNT(*) AS targets_rows FROM targets;

COMMIT;
