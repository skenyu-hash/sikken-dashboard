// PR c97-1: GET /api/unread-count — 未読バッジ件数 (担当範囲の (area, cat) ペア)。
//
// 認証必須。ユーザーの担当範囲 (= permissions.hasDataAccess で view=true) のうち、
// entries.updated_at > read_states.last_seen_at (= 未読) の (area, category) ペア数を返却。
// read_states に行が無い (= 初回) ペアは entries が 1 行でもあれば未読扱い。
//
// レスポンス:
//   { count: number, breakdown?: Array<{ area_id: string, business_category: string }> }
//   - count: 未読拠点数 (NavBar / MobileHeader のバッジ表示用)
//   - breakdown: 未読拠点リスト (c97-2 のアラートパネル用、本 API では常に返却)
//
// 設計:
//   - 担当範囲ペア配列を unreadStats.getUserScopePairs で生成
//   - 各ペアについて entries の MAX(updated_at) と read_states の last_seen_at を比較
//   - 1 SQL で集約: LEFT JOIN read_states + entries 集計
//
// 不変条件遵守:
//   - READ ONLY (entries / read_states ともに SELECT のみ)
//   - 4 月以前データは entries に含まれるが、未読判定の対象なので影響なし
//     (現場ユーザーが過去日を /daily-report で表示しても last_seen_at は本 API 経由では更新されない)

import { NextResponse } from "next/server";
import { currentUser } from "../../lib/auth";
import { getSql, ensureSchema } from "../../lib/db";
import { getUserScopePairs } from "../../lib/unreadStats";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 担当範囲ペア (純関数で導出)
  // 注: SessionUser.business_category は持たないため null で渡す → 自エリア × 全業態の挙動になる
  //   (chief/staff/clerk は自エリア × 5 業態、executive/vice/manager は全 40 ペア)
  const scopePairs = getUserScopePairs(user.role, user.areaId, null);
  if (scopePairs.length === 0) {
    return NextResponse.json({ count: 0, breakdown: [] });
  }

  await ensureSchema();
  const sql = getSql();

  // 担当範囲ペアを (area, category) の VALUES list として渡し、
  // 各ペアについて entries の MAX(updated_at) と read_states の last_seen_at を比較。
  // 未読 = entries.MAX(updated_at) > read_states.last_seen_at (read_states 行なしなら epoch 0 扱い)。
  // entries が 0 行 (= 4 月以前データなし) のペアは未読でない (MAX が null)。
  const areaIds = scopePairs.map((p) => p.area_id);
  const cats = scopePairs.map((p) => p.business_category);

  // unnest で 2 列を pair として展開、LEFT JOIN で read_states を引く。
  // ※ pairs の対応関係を保つため、配列を index 一致で展開する unnest (col1, col2) パターン使用。
  const rows = await sql`
    WITH scope_pairs AS (
      SELECT * FROM unnest(${areaIds}::text[], ${cats}::text[]) AS t(area_id, business_category)
    ),
    entries_max AS (
      SELECT
        e.area_id,
        e.business_category,
        MAX(e.updated_at) AS max_updated_at
      FROM entries e
      WHERE (e.area_id, e.business_category) IN (
        SELECT sp.area_id, sp.business_category FROM scope_pairs sp
      )
      GROUP BY e.area_id, e.business_category
    )
    SELECT
      sp.area_id,
      sp.business_category,
      em.max_updated_at,
      rs.last_seen_at
    FROM scope_pairs sp
    LEFT JOIN entries_max em
      ON em.area_id = sp.area_id AND em.business_category = sp.business_category
    LEFT JOIN read_states rs
      ON rs.user_id = ${user.id}
      AND rs.area_id = sp.area_id
      AND rs.business_category = sp.business_category
    WHERE em.max_updated_at IS NOT NULL
      AND (rs.last_seen_at IS NULL OR em.max_updated_at > rs.last_seen_at)
  `;

  const breakdown = rows.map((r) => ({
    area_id: String(r.area_id),
    business_category: String(r.business_category),
  }));
  return NextResponse.json({ count: breakdown.length, breakdown });
}
