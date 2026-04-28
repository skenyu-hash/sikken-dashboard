-- ============================================================
-- SIKKEN 役職会議モジュール — Phase 1 Migration
-- ============================================================
-- 既存テーブルには一切触れず、新規テーブルのみ追加する設計。
-- 適用前に必ず DB のバックアップを取ること。
-- 適用方法（Neon の場合）:
--   1) Neon Console > SQL Editor でこのファイルを実行
--   2) または `psql $DATABASE_URL -f 001_create_meeting_tables.sql`
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 会議体マスタ
--    Phase 1 では役員会のみ運用するが、将来 4 階層全部を入れる
--    ことを見越して最初からマスタを用意する
-- ============================================================
CREATE TABLE meeting_series (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(50)  UNIQUE NOT NULL,
  name         VARCHAR(100) NOT NULL,
  tier         INTEGER      NOT NULL,
  description  TEXT,
  cycle_type   VARCHAR(20)  NOT NULL DEFAULT '10day',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO meeting_series (code, name, tier, description, is_active) VALUES
  ('executive',      '役員会',    1, '経営戦略・方針決定の最上位会議',   TRUE),
  ('vice_president', '副社長会',  2, '戦術展開・部門間連携',             FALSE),
  ('manager',        '部長会',    3, '部門展開・施策具体化',             FALSE),
  ('section',        '課長会',    4, '現場実行・進捗管理',               FALSE);
-- Phase 1 は executive のみ is_active = TRUE。
-- Phase 3 で他を順次 TRUE に切り替えるだけで使えるようになる。

-- ============================================================
-- 2. 個別会議セッション
-- ============================================================
CREATE TABLE meeting_sessions (
  id            SERIAL PRIMARY KEY,
  series_id     INTEGER     NOT NULL REFERENCES meeting_series(id),
  meeting_date  DATE        NOT NULL,
  cycle_year    INTEGER     NOT NULL,
  cycle_month   INTEGER     NOT NULL,
  cycle_period  INTEGER     NOT NULL CHECK (cycle_period IN (1, 2, 3)),
  -- 1 = 1〜10日, 2 = 11〜20日, 3 = 21〜末日
  title         VARCHAR(200),
  status        VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  -- 'scheduled' | 'in_progress' | 'completed'
  facilitator   VARCHAR(100),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_series_date ON meeting_sessions(series_id, meeting_date DESC);
CREATE INDEX idx_sessions_cycle       ON meeting_sessions(cycle_year, cycle_month, cycle_period);

-- ============================================================
-- 3. 議題（アジェンダ）
--    parent_agenda_id で上位会議の議題からの「降りてきた議題」を表現
--    （Phase 3 で本格活用、Phase 1 では NULL で運用）
-- ============================================================
CREATE TABLE agendas (
  id                SERIAL PRIMARY KEY,
  session_id        INTEGER     NOT NULL REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  parent_agenda_id  INTEGER     REFERENCES agendas(id),
  title             VARCHAR(300) NOT NULL,
  description       TEXT,
  order_index       INTEGER     NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'open',
  -- 'open' | 'discussing' | 'decided' | 'deferred'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agendas_session ON agendas(session_id, order_index);
CREATE INDEX idx_agendas_parent  ON agendas(parent_agenda_id) WHERE parent_agenda_id IS NOT NULL;

-- ============================================================
-- 4. 発言・意見
--    GIN index は Phase 2 の自然言語検索を見据えた仕込み
-- ============================================================
CREATE TABLE discussions (
  id            SERIAL PRIMARY KEY,
  agenda_id     INTEGER     NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  speaker_name  VARCHAR(100) NOT NULL,
  content       TEXT        NOT NULL,
  order_index   INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_discussions_agenda      ON discussions(agenda_id, order_index);
CREATE INDEX idx_discussions_speaker     ON discussions(speaker_name);
CREATE INDEX idx_discussions_content_gin ON discussions USING gin(to_tsvector('simple', content));

-- ============================================================
-- 5. 決定事項
-- ============================================================
CREATE TABLE decisions (
  id                  SERIAL PRIMARY KEY,
  agenda_id           INTEGER     NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  parent_decision_id  INTEGER     REFERENCES decisions(id),
  content             TEXT        NOT NULL,
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_decisions_agenda ON decisions(agenda_id);

-- ============================================================
-- 6. アクションアイテム
-- ============================================================
CREATE TABLE action_items (
  id            SERIAL PRIMARY KEY,
  agenda_id     INTEGER     NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  decision_id   INTEGER     REFERENCES decisions(id),
  description   TEXT        NOT NULL,
  assignee      VARCHAR(100),
  due_date      DATE,
  status        VARCHAR(20) NOT NULL DEFAULT 'todo',
  -- 'todo' | 'in_progress' | 'done' | 'blocked'
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actions_assignee_status ON action_items(assignee, status);
CREATE INDEX idx_actions_due_open        ON action_items(due_date) WHERE status != 'done';

-- ============================================================
-- 7. 数字スナップショット（10日会議シート連動）
--    metric_data は jsonb で柔軟に保存
--    例: {"revenue": 125000000, "gross_profit": 35000000,
--         "ad_cost": 38000000, "landing_forecast": 130000000,
--         "categories": {"water": {...}, "electric": {...}}}
-- ============================================================
CREATE TABLE linked_metrics (
  id           SERIAL PRIMARY KEY,
  session_id   INTEGER     NOT NULL REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  source       VARCHAR(50) NOT NULL,
  metric_data  JSONB       NOT NULL,
  snapshot_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_metrics_session  ON linked_metrics(session_id);
CREATE INDEX idx_metrics_data_gin ON linked_metrics USING gin(metric_data);

-- ============================================================
-- 8. updated_at 自動更新トリガー
-- ============================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_meeting_series_updated   BEFORE UPDATE ON meeting_series
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER trg_meeting_sessions_updated BEFORE UPDATE ON meeting_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER trg_agendas_updated          BEFORE UPDATE ON agendas
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
CREATE TRIGGER trg_action_items_updated     BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

COMMIT;
