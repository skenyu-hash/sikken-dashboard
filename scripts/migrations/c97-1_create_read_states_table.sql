-- PR c97-1: 未読バッジ機能 (個人別) 用 read_states テーブル新規。
--
-- 背景:
--   /daily-report ナビバッジ「未読拠点数」算出のため、ユーザー個人別の最終閲覧時刻を保持。
--   未読判定式: entries.updated_at > read_states.last_seen_at かつ user が担当する (area, category)。
--   担当範囲は permissions.ts hasDataAccess で導出 (本テーブルでは保持しない、API 側で都度判定)。
--
-- 仕様:
--   - PK = (user_id, area_id, business_category) で 1 ユーザー × 1 拠点 = 1 行
--   - INSERT/UPSERT のみ (DELETE は基本しない、ユーザー削除時のみ手動 CASCADE)
--   - 最大行数 = 46 ユーザー × 8 area × 5 cat = 1,840 行 (実運用は担当範囲のみ書込でさらに少)
--   - スロットル: 同一 (user, area, category) の連続既読は 30 秒以内なら UPSERT skip (= last_seen_at 更新なし)
--     → SQL レベルで WHERE 句条件付き UPSERT で実装
--
-- 適用方法:
--   Neon Console (SQL Editor) で本ファイルを実行、または:
--   $ psql $DATABASE_URL -f scripts/migrations/c97-1_create_read_states_table.sql
--
-- 冪等性:
--   IF NOT EXISTS で再実行安全。本マイグレを複数回実行しても副作用なし。
--   db.ts ensureSchema() でも同じ DDL が実行されるため、本マイグレは documentation 兼初回手動実行用。
--
-- ロールバック (必要時のみ):
--   DROP TABLE IF EXISTS read_states;
--   ※ 既存 last_seen_at が失われ、全ユーザーの全拠点が「未読」状態に戻る (実害は限定的)

BEGIN;

CREATE TABLE IF NOT EXISTS read_states (
  user_id INT NOT NULL,
  area_id TEXT NOT NULL,
  business_category VARCHAR(20) NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, area_id, business_category)
);

CREATE INDEX IF NOT EXISTS idx_read_states_user ON read_states (user_id);

-- 検証クエリ (実行後の自己確認用、副作用なし):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'read_states' ORDER BY ordinal_position;
--
--   期待値 (4 列):
--     user_id           integer                     NO
--     area_id           text                        NO
--     business_category character varying            NO
--     last_seen_at      timestamp with time zone    NO
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'read_states';
--   期待値: read_states_pkey, idx_read_states_user

COMMIT;
