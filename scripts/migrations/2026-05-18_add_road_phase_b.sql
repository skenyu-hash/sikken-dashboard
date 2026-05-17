-- ================================================================
-- PR #52: ロード業態 Phase B 列追加 (獲得 7 内訳)
-- ================================================================
-- 実行日: 2026-05-18
-- 仕様: PR #52 ロード業態 4 レイヤー連動 (DB + フォーム保存 + ダッシュボード)
--
-- 背景:
--   PR #48b c5-road で RoadForm を実装したが、獲得 7 チャネル内訳は UI のみ
--   (DB 保存対象外) だった。本 PR で全 7 内訳を専用カラムに永続化し、
--   編集モードでの復元 + ダッシュボード表示を実現する。
--
-- 設計方針 (PR #51 鍵業態と同パターン):
--   - 全 7 カラム NOT NULL DEFAULT 0 (既存行は 0 で自動補完)
--   - ロード以外の業態では常に 0 で保存される (他業態への影響なし)
--   - profit 計算は calc.profit (水道と同式) で動作するため、locksmith のような
--     専用コストカラム (locksmith_construction_cost 等) は不要
--   - 入電 7 内訳は引き続き UI only (Phase B 後続で必要なら追加検討)
--   - 保険売上 / 無保険売上 / 販管費も引き続き UI only
--
-- 影響:
--   既存データ: 影響なし (DEFAULT 0)。
--   既存 API: pick() エイリアス追加のみで後方互換完全維持。

BEGIN;

-- ロード業態 獲得 7 チャネル (件数、PR #48b で UI 定義済の 7 種に対応)
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_ad_count        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_repeat_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_referral_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_revisit_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_wellnest_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_seo_count       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS road_insurance_count INTEGER NOT NULL DEFAULT 0;

-- 検証クエリ (適用後の確認)
SELECT 'after_migration' AS phase, COUNT(*) AS total_columns
FROM information_schema.columns
WHERE table_name = 'monthly_summaries';
-- 期待: 45 (PR #51 後) + 7 (本 PR) = 52

SELECT 'new_columns' AS label, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'monthly_summaries'
  AND column_name IN (
    'road_ad_count', 'road_repeat_count', 'road_referral_count',
    'road_revisit_count', 'road_wellnest_count', 'road_seo_count',
    'road_insurance_count'
  )
ORDER BY column_name;
-- 期待: 7 行

SELECT 'existing_data_preserved' AS label, COUNT(*) AS row_count FROM monthly_summaries;

COMMIT;
