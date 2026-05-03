-- SIKKEN Dashboard 副次的気付きクリーンアップ
-- 生成日: 2026-05-03
-- 対象:
--   1. roadservice カテゴリ × 6件 (2025-10〜2026-03、road と完全同値の重複ゴミ)
--   2. water/kansai/2026-02 (¥16,424,281 / -¥516,034 / 63件、detective と同値の誤投入疑い)

BEGIN;

-- 削除前 件数確認
SELECT 'before' AS phase, COUNT(*) AS cnt
FROM monthly_summaries
WHERE business_category = 'roadservice'
   OR (area_id='kansai' AND business_category='water' AND year=2026 AND month=2);
-- 期待: 7

-- (1) roadservice カテゴリ全削除 (6件)
DELETE FROM monthly_summaries
WHERE business_category = 'roadservice';

-- (2) water/kansai/2026-02 異常レコード削除 (1件)
DELETE FROM monthly_summaries
WHERE area_id='kansai' AND business_category='water'
  AND year=2026 AND month=2;

-- 削除後 件数確認
SELECT 'after' AS phase, COUNT(*) AS cnt
FROM monthly_summaries
WHERE business_category = 'roadservice'
   OR (area_id='kansai' AND business_category='water' AND year=2026 AND month=2);
-- 期待: 0

-- 異常レコード再確認
SELECT '異常レコード再確認' AS label, COUNT(*) AS cnt
FROM monthly_summaries
WHERE total_count > 0 AND total_revenue = 0;
-- 期待: 0

-- road/kansai 残存確認 (削除によって本物のデータが消えていないか念のため)
SELECT 'road/kansai survivors' AS label, COUNT(*) AS cnt,
       MIN(year::text || '-' || LPAD(month::text, 2, '0')) AS earliest,
       MAX(year::text || '-' || LPAD(month::text, 2, '0')) AS latest
FROM monthly_summaries
WHERE area_id='kansai' AND business_category='road';
-- 期待: 6件以上 (元の road データは無傷)

COMMIT;
