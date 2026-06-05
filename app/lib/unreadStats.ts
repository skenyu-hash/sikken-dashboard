// PR c97-1: 未読バッジ機能 純関数 lib。
//
// 役割:
//   1. getUserScopePairs(role, areaId, businessCategory?): ユーザーの担当範囲 (= 未読カウント対象)
//      の (area_id, business_category) ペア配列を導出。
//      permissions.ts hasDataAccess を流用し、view 権限がある全ペアを列挙。
//   2. throttleSkip(lastSeenAt, now, throttleSeconds): スロットル判定 (連続既読を skip するか)。
//
// 設計:
//   - 全 8 area × 5 cat = 40 ペアの cross-product を生成し、hasDataAccess で view=true をフィルタ
//   - executive: 40 ペアすべて返却 (全社閲覧可)
//   - vice/manager: 40 ペアすべて返却 (他エリアも view OK)
//   - chief/staff/clerk: 自エリア × 自業態 (= 1 ペア) のみ返却。business_category 未設定なら自エリア × 5 業態
//
// 注意: 「未読カウント」は本 lib + SQL (entries.updated_at vs read_states.last_seen_at) で 2 段判定。
//   本 lib は「対象ペア」を返すだけで、未読判定 (updated_at > last_seen_at) は SQL 側の責務。

import type { Role } from "./permissions";
import { hasDataAccess } from "./permissions";

const ALL_AREAS = [
  "kansai", "kanto", "nagoya", "kyushu",
  "kitakanto", "hokkaido", "chugoku", "shizuoka",
] as const;
const ALL_CATEGORIES = ["water", "electric", "locksmith", "road", "detective"] as const;

export type ScopePair = {
  area_id: string;
  business_category: string;
};

/**
 * ユーザーの担当範囲 (未読カウント対象) を全 (area, category) ペアの集合として返却。
 *
 * @param role  ユーザーロール
 * @param areaId  ユーザーの担当エリア (null = 未設定 = 全エリア対象、ただし role による絞り込みは効く)
 * @param businessCategory  ユーザーの担当業態 (null/undefined = 業態未設定で hasDataAccess の暫定挙動を踏襲)
 * @returns 担当範囲ペアの配列。未読カウント対象としてフィルタ済。
 *
 * 例:
 *   getUserScopePairs("executive", null) → 40 ペア (全社)
 *   getUserScopePairs("manager", "kansai") → 40 ペア (他エリアも view OK)
 *   getUserScopePairs("staff", "kansai") → 5 ペア (関西 × 5 業態のみ、自エリア)
 *   getUserScopePairs("staff", "kansai", "water") → 1 ペア (関西 × 水道のみ)
 */
export function getUserScopePairs(
  role: Role,
  areaId: string | null,
  businessCategory: string | null = null,
): ScopePair[] {
  const result: ScopePair[] = [];
  const user = { role, area_id: areaId, business_category: businessCategory };
  for (const area of ALL_AREAS) {
    for (const cat of ALL_CATEGORIES) {
      if (hasDataAccess(user, area, cat, "view")) {
        result.push({ area_id: area, business_category: cat });
      }
    }
  }
  return result;
}

/**
 * スロットル判定: 同一 (user, area, category) の既読更新を skip すべきか。
 *
 * @param lastSeenAt  read_states 既存行の last_seen_at (= 前回既読時刻)、null なら初回
 * @param now         現在時刻
 * @param throttleSeconds  スロットル秒数 (反さん指示: 30 秒)
 * @returns true なら skip (UPSERT しない)、false なら通常更新
 *
 * 境界条件 (number-verifier 指摘、c97-1):
 *   本 lib の判定 `diffMs < throttleSeconds * 1000` は厳密未満 (= 30000ms ピッタリは false=更新)。
 *   POST /api/unread-mark-read の SQL は `< NOW() - INTERVAL '30 second'` で同じく厳密未満。
 *   両者同条件。実運用ではミリ秒精度の一致は発生せず実害ゼロ。
 *
 * 例:
 *   throttleSkip(null, new Date(), 30) → false (初回は必ず書込)
 *   throttleSkip(new Date(Date.now() - 10_000), new Date(), 30) → true (10 秒前 < 30 秒)
 *   throttleSkip(new Date(Date.now() - 60_000), new Date(), 30) → false (60 秒前 > 30 秒)
 */
export function throttleSkip(
  lastSeenAt: Date | null,
  now: Date,
  throttleSeconds: number,
): boolean {
  if (lastSeenAt === null) return false; // 初回は必ず書込
  const diffMs = now.getTime() - lastSeenAt.getTime();
  return diffMs < throttleSeconds * 1000;
}
