-- PR c95-D-1 (slice 1): water 業態のコンサル費 手入力フィールドを monthly_summaries に追加。
--
-- 背景:
--   c95-B シリーズで「売上 × 7.7%」の自動計算を実装したが、本来の要件は「実額の手入力」
--   と判明。c95-D で手入力ベースに切替。本マイグレは slice 1 のスキーマ拡張のみで、
--   既存 monthly_summaries の挙動・粗利計算には一切影響しない。
--
-- 仕様:
--   - monthly_summaries.consultant_fee NUMERIC NOT NULL DEFAULT 0
--   - 既存全行 (4 月以前 109 行 + 5 月以降 7 行) は DEFAULT 0 で自動的に埋まる
--   - 4 月以前データへの遡及変動なし (元々控除なし、新フィールド = 0 で同じ状態)
--   - 5 月以降 water 行も DEFAULT 0、slice 3 マージ前に反/現場が実額入力で更新する運用
--
-- 適用方法:
--   Neon Console (SQL Editor) で本ファイルを実行、または:
--   $ psql $DATABASE_URL -f scripts/migrations/c95-d-1_add_consultant_fee_column.sql
--
-- 冪等性:
--   IF NOT EXISTS で再実行安全。本マイグレを複数回実行しても副作用なし。
--
-- ロールバック (必要時のみ、本番では非推奨):
--   ALTER TABLE monthly_summaries DROP COLUMN IF EXISTS consultant_fee;
--   ※ 既存データに consultant_fee 値が入った後にロールバックすると、それらの値が失われる

BEGIN;

ALTER TABLE monthly_summaries
  ADD COLUMN IF NOT EXISTS consultant_fee NUMERIC NOT NULL DEFAULT 0;

-- 検証クエリ (実行後の自己確認用、副作用なし):
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'monthly_summaries' AND column_name = 'consultant_fee';
--
--   期待値: data_type=numeric, column_default=0, is_nullable=NO
--
--   SELECT business_category, year, month, consultant_fee
--   FROM monthly_summaries
--   WHERE consultant_fee != 0;
--
--   期待値: 0 件 (DEFAULT 0 で全行が 0、未だ手入力なし)

COMMIT;
