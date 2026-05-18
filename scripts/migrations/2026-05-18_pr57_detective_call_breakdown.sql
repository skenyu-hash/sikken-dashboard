-- ================================================================
-- PR #57: 探偵業態 入電 4 内訳の DB 化 (Phase B 残課題、案 A 完結)
-- ================================================================
-- 実行日: 2026-05-18
-- 仕様: Phase B 残課題のうち最も経営判断価値が高い探偵入電内訳を永続化
--
-- 背景:
--   PR #48b / PR #53 で面談数 / キャンセル数は DB 化したが、入電 4 内訳は
--   依然 DetectiveForm 内 localState (UI のみ) で、編集モードで復元されず、
--   ダッシュボード/会議で「(UI のみ、Phase B 後続予定)」表示のままだった。
--   本 PR で 4 列追加し、入電チャネル別の経営判断 (どのチャネルが多いか) を
--   ダッシュボード/会議で即座に把握可能にする。
--
-- 設計方針 (PR #51-54 と同パターン):
--   - 全 4 カラム INTEGER NOT NULL DEFAULT 0
--   - 探偵以外の業態では常に 0 で保存
--   - 既存 detective_meeting_count / detective_cancel_count と同 prefix
--   - call_count (合計入電数) は引き続き sync 維持

BEGIN;

ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_phone_only_call_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_mail_only_call_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_line_only_call_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS detective_wrong_call_count      INTEGER NOT NULL DEFAULT 0;

-- 検証クエリ
SELECT 'monthly_summaries_columns' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'monthly_summaries';
-- 期待: PR #54 後 54 列 (detective_meeting/cancel 追加済) + 4 = 58 列

SELECT 'new_columns' AS label, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'monthly_summaries'
  AND column_name IN (
    'detective_phone_only_call_count', 'detective_mail_only_call_count',
    'detective_line_only_call_count', 'detective_wrong_call_count'
  )
ORDER BY column_name;
-- 期待: 4 行

SELECT 'existing_data_preserved' AS label, COUNT(*) AS row_count FROM monthly_summaries;

COMMIT;
