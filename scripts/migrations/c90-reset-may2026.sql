-- PR c90-1: 2026 年 5 月のみデータリセット (c89-p1 で発覚した auto-save 累積置換破壊からの復旧)
--
-- ⚠️ 実行は Neon Console から手動 (psql) のみ。本番環境を直接操作するため:
--   1. 必ず BEGIN; を入れて トランザクション開始
--   2. SELECT で対象件数 / 4 月以前の保護を確認
--   3. DELETE を実行
--   4. SELECT で削除後の状態を確認
--   5. 想定通りなら COMMIT、それ以外は ROLLBACK
--
-- 範囲:
--   - entries テーブル: entry_date BETWEEN '2026-05-01' AND '2026-05-31' のみ
--   - monthly_summaries テーブル: year = 2026 AND month = 5 のみ
--   - 4 月以前 / 6 月以降 / 他年は完全に保護
--
-- 影響範囲:
--   - 2026-05 の全業態 × 全エリア の日次入力 + 月次集計 が全て削除される
--   - 削除後、/entry から 5/1〜5/20 を順次再入力する必要 (c90-2 後)

BEGIN;

-- ============================================================
-- STEP 1: 削除前の事前確認 (件数と 4 月以前の保護確認)
-- ============================================================

-- 削除対象の確認 (entries)
SELECT '削除対象: entries' AS info,
  COUNT(*) AS rows_to_delete,
  MIN(entry_date) AS earliest,
  MAX(entry_date) AS latest
FROM entries
WHERE entry_date >= '2026-05-01' AND entry_date <= '2026-05-31';

-- 削除対象の確認 (monthly_summaries)
SELECT '削除対象: monthly_summaries' AS info,
  COUNT(*) AS rows_to_delete,
  array_agg(DISTINCT area_id) AS areas,
  array_agg(DISTINCT business_category) AS categories
FROM monthly_summaries
WHERE year = 2026 AND month = 5;

-- 4 月以前データの保護確認 (この件数は削除後も同じであるべき)
SELECT '保護対象: 2026-04 以前 entries' AS info, COUNT(*) AS protected_count
FROM entries WHERE entry_date < '2026-05-01';

SELECT '保護対象: 2026-04 以前 monthly_summaries' AS info, COUNT(*) AS protected_count
FROM monthly_summaries WHERE year < 2026 OR (year = 2026 AND month < 5);

-- ============================================================
-- STEP 2: 削除実行 (BEGIN 内なので COMMIT までは確定しない)
-- ============================================================

-- entries: 2026-05-01〜2026-05-31 の行のみ削除
-- WHERE 句は両端必須。「>= '2026-05-01' AND <= '2026-05-31'」で 4 月以前を絶対に触らない。
DELETE FROM entries
WHERE entry_date >= '2026-05-01' AND entry_date <= '2026-05-31';

-- monthly_summaries: year=2026 AND month=5 の行のみ削除
-- 他の (year, month) 組合せは全て保護
DELETE FROM monthly_summaries
WHERE year = 2026 AND month = 5;

-- ============================================================
-- STEP 3: 削除後の確認
-- ============================================================

-- 5 月が空になったことを確認
SELECT '削除後: entries 5月' AS info, COUNT(*) AS remaining
FROM entries
WHERE entry_date >= '2026-05-01' AND entry_date <= '2026-05-31';

SELECT '削除後: monthly_summaries 5月' AS info, COUNT(*) AS remaining
FROM monthly_summaries WHERE year = 2026 AND month = 5;

-- 4 月以前が保持されていることを確認 (STEP 1 と同じ件数なら OK)
SELECT '保護確認: 2026-04 以前 entries' AS info, COUNT(*) AS still_present
FROM entries WHERE entry_date < '2026-05-01';

SELECT '保護確認: 2026-04 以前 monthly_summaries' AS info, COUNT(*) AS still_present
FROM monthly_summaries WHERE year < 2026 OR (year = 2026 AND month < 5);

-- ============================================================
-- STEP 4: 確認 OK なら以下を実行、想定外なら ROLLBACK;
-- ============================================================
-- COMMIT;
-- ROLLBACK;

-- ⚠️ デフォルトでは COMMIT/ROLLBACK を実行せず、psql で SELECT 結果を確認してから
-- 手動で COMMIT または ROLLBACK を打つこと。
