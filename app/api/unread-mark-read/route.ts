// PR c97-1: POST /api/unread-mark-read — 単一 (area, category) ペアの既読化。
//
// 認証必須。body: { areaId, category } の単一ペアを read_states に UPSERT (last_seen_at = NOW)。
//
// 重要な仕様 (反さん確定):
//   1. 単一 (areaId, category) ペアのみ受付。複数ペアの一括既読化は受け付けない
//      (合算ビューでの一括既読を防ぐため、自動既読化は単一拠点表示時のみ = c97-2 側で制御)。
//   2. 担当範囲外 (= hasDataAccess(view)=false) のペアを mark-read しようとした場合は 403 拒否。
//   3. スロットル: 同一 (user, area, category) の連続既読は 30 秒以内なら no-op (DB 書込せず 200 返却)。
//      → SQL レベルで WHERE 句条件付き UPDATE で実装、`{ skipped: true }` を返す。
//
// 不変条件遵守:
//   - read_states 以外への書き込み一切なし (entries / monthly_summaries は touch しない)
//   - 4 月以前データには影響なし (本 API は read_states UPSERT のみ、entries 触らない)

import { NextResponse } from "next/server";
import { currentUser } from "../../lib/auth";
import { hasDataAccess } from "../../lib/permissions";
import { getSql, ensureSchema } from "../../lib/db";

export const runtime = "nodejs";

const THROTTLE_SECONDS = 30;

const VALID_CATEGORIES = new Set(["water", "electric", "locksmith", "road", "detective"]);
const VALID_AREAS = new Set([
  "kansai", "kanto", "nagoya", "kyushu",
  "kitakanto", "hokkaido", "chugoku", "shizuoka",
]);

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    areaId?: string;
    category?: string;
  } | null;

  if (!body || typeof body.areaId !== "string" || typeof body.category !== "string") {
    return NextResponse.json({ error: "bad body (areaId, category required as strings)" }, { status: 400 });
  }
  if (!VALID_AREAS.has(body.areaId)) {
    return NextResponse.json({ error: "bad areaId" }, { status: 400 });
  }
  if (!VALID_CATEGORIES.has(body.category)) {
    return NextResponse.json({ error: "bad category" }, { status: 400 });
  }

  // 担当範囲外は 403 拒否 (反さん確定: 合算ビューでの一括既読防止)
  if (!hasDataAccess(
    { role: user.role, area_id: user.areaId, business_category: null },
    body.areaId,
    body.category,
    "view",
  )) {
    return NextResponse.json({ error: "forbidden (not in scope)" }, { status: 403 });
  }

  await ensureSchema();
  const sql = getSql();

  // スロットル付き UPSERT (反さん仕様: 30 秒以内の連続既読は no-op):
  //   - 初回 (PK 衝突なし) → INSERT
  //   - 30 秒超え経過 → ON CONFLICT DO UPDATE で last_seen_at = NOW
  //   - 30 秒以内 → WHERE 句で skip (返却 rowCount=0 で skipped=true 判定)
  //
  // Neon driver の neon() (HTTP ベース) は rowCount を直接返さないが、SQL の RETURNING 句で
  // 更新行を返却 → result 配列の length で判定可能。
  // 注: Neon の tagged template で `INTERVAL '${SEC} seconds'` を書くと SEC が parameter binding
  //   経由で `'30'` の string literal になり構文エラー。`${SEC}::int * INTERVAL '1 second'` パターンで bind。
  const result = await sql`
    INSERT INTO read_states (user_id, area_id, business_category, last_seen_at)
    VALUES (${user.id}, ${body.areaId}, ${body.category}, NOW())
    ON CONFLICT (user_id, area_id, business_category) DO UPDATE
      SET last_seen_at = NOW()
      WHERE read_states.last_seen_at < NOW() - (${THROTTLE_SECONDS}::int * INTERVAL '1 second')
    RETURNING last_seen_at
  `;

  // result.length = 0 のとき = WHERE 条件で UPDATE が skip された (= スロットル発火)
  // result.length = 1 のとき = INSERT or UPDATE 成功
  if (result.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "throttled (< 30s)" });
  }
  return NextResponse.json({ ok: true, skipped: false, last_seen_at: String(result[0].last_seen_at) });
}
