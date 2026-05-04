-- SIKKEN ユーザー権限再割り当て (2026-05-04)
-- 8件のロール変更 + 6件の新規作成
-- 削除は実施しない (CST田中一真は is_active=false のまま放置)
--
-- 注意:
--   このファイルは UPDATE 8件のみを直接適用する。
--   INSERT 6件は bcrypt パスワードハッシュ生成が必要なため、
--   別途 Node.js スクリプト (scripts/insert_new_users_202605.ts 等) で
--   実行する想定。

BEGIN;

-- ========== 変更前確認 ==========
SELECT 'before_update' AS phase, COUNT(*) AS cnt
FROM users
WHERE email IN (
  'tfru20201212@gmail.com', 'xiangtaichaishan@gmail.com',
  'taiki2000taiki12@gmail.com', 't.nishida@mavericks-corp.com',
  'h.tsuruta@mavericks-corp.com', 'ebina0804@icloud.com',
  'ngt16hrt1610@icloud.com', 'fuuma.sakai@icloud.com'
);
-- 期待: 8

-- ========== UPDATE: ロール変更 (8件) ==========

-- 役員 → 副社長 (1件)
UPDATE users SET role='vice', updated_at=NOW() WHERE email='tfru20201212@gmail.com';

-- 部長 → 副社長 (1件)
UPDATE users SET role='vice', updated_at=NOW() WHERE email='xiangtaichaishan@gmail.com';

-- 社員 → 課長 (1件)
UPDATE users SET role='chief', updated_at=NOW() WHERE email='taiki2000taiki12@gmail.com';

-- 事務員 → 課長 (2件)
UPDATE users SET role='chief', updated_at=NOW() WHERE email='t.nishida@mavericks-corp.com';
UPDATE users SET role='chief', updated_at=NOW() WHERE email='h.tsuruta@mavericks-corp.com';

-- 事務員 → 社員 (3件)
UPDATE users SET role='staff', updated_at=NOW() WHERE email='ebina0804@icloud.com';
UPDATE users SET role='staff', updated_at=NOW() WHERE email='ngt16hrt1610@icloud.com';
UPDATE users SET role='staff', updated_at=NOW() WHERE email='fuuma.sakai@icloud.com';

-- ========== 検証: UPDATE 結果確認 ==========
SELECT 'after_update' AS phase, role, COUNT(*) AS cnt
FROM users
WHERE email IN (
  'tfru20201212@gmail.com', 'xiangtaichaishan@gmail.com',
  'taiki2000taiki12@gmail.com', 't.nishida@mavericks-corp.com',
  'h.tsuruta@mavericks-corp.com', 'ebina0804@icloud.com',
  'ngt16hrt1610@icloud.com', 'fuuma.sakai@icloud.com'
)
GROUP BY role
ORDER BY role;
-- 期待: chief=3, staff=3, vice=2

-- ========== 全体ロール分布 (UPDATE後、INSERT前の予測) ==========
SELECT 'final_distribution' AS phase, role, COUNT(*) AS cnt
FROM users
GROUP BY role
ORDER BY
  CASE role
    WHEN 'executive' THEN 1
    WHEN 'vice' THEN 2
    WHEN 'manager' THEN 3
    WHEN 'chief' THEN 4
    WHEN 'staff' THEN 5
    WHEN 'clerk' THEN 6
    ELSE 7
  END;
-- 期待 (UPDATE後、INSERT前):
--   executive: 11 (-1 大内)
--   vice: 2 (+2: 大内 + 柴山)
--   manager: 6 (-1 柴山)
--   chief: 3 (+3: 城地 + 西田 + 靏田)
--   staff: 9 (+3 蛯名+長田+神田、-1 城地 = 7+3-1=9)
--   clerk: 9 (-5: 西田/靏田/蛯名/長田/神田)
-- 合計: 11+2+6+3+9+9 = 40 (変化なし)

COMMIT;
