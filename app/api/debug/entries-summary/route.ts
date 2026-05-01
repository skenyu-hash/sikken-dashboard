// 開発用デバッグエンドポイント。
// entries テーブル（日次入力 JSONB）の area × business_category 別集計を返す。
//
// 用途: ダッシュボード集計（daily entries の sum）と monthly_summaries の
// 乖離を調査するため。daily entries の合計が画面表示と一致するか検証する。
//
// 認証: executive ロールのみ（他は 403）
// CORS: 同一オリジンのみ許可
// 副作用: なし（SELECT のみ）
// 使用期限: Phase 9.5 で削除予定（兄弟 /api/debug/monthly-summary と同方針）

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
import { currentUser } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "executive") {
    return NextResponse.json({ error: "forbidden (executive only)" }, { status: 403 });
  }

  // CORS: cross-origin ブラウザリクエスト拒否
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    const originHost = (() => {
      try {
        return new URL(origin).host;
      } catch {
        return null;
      }
    })();
    if (originHost && originHost !== host) {
      return NextResponse.json({ error: "cross-origin forbidden" }, { status: 403 });
    }
  }

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "missing or invalid year/month" },
      { status: 400 }
    );
  }

  console.log(
    `[debug/entries-summary] user=${user.email}(id=${user.id}) ` +
      `query=${JSON.stringify({ year, month })} at=${new Date().toISOString()}`
  );

  try {
    const sql = getSql();

    // 集計1: area × business_category 別の sum / count / 期間 / 最終更新時刻
    // total_revenue は DailyEntry の3部門合算式 (selfRevenue + newRevenue + addRevenue)
    // に準拠（calculations.ts:138 と同じ式）
    const grouped = (await sql`
      SELECT
        area_id,
        COALESCE(business_category, 'water') AS business_category,
        COUNT(*)::int AS entry_count,
        SUM(
          COALESCE((data->>'selfRevenue')::bigint, 0) +
          COALESCE((data->>'newRevenue')::bigint, 0) +
          COALESCE((data->>'addRevenue')::bigint, 0)
        )::bigint AS total_revenue,
        SUM(COALESCE((data->>'selfRevenue')::bigint, 0))::bigint AS self_revenue,
        SUM(COALESCE((data->>'newRevenue')::bigint, 0))::bigint AS new_revenue,
        SUM(COALESCE((data->>'addRevenue')::bigint, 0))::bigint AS add_revenue,
        SUM(COALESCE((data->>'totalCount')::int, 0))::int AS total_count,
        MIN(entry_date) AS earliest_date,
        MAX(entry_date) AS latest_date,
        MIN(updated_at) AS first_updated_at,
        MAX(updated_at) AS last_updated_at
      FROM entries
      WHERE EXTRACT(YEAR FROM entry_date) = ${year}
        AND EXTRACT(MONTH FROM entry_date) = ${month}
      GROUP BY area_id, COALESCE(business_category, 'water')
      ORDER BY area_id, COALESCE(business_category, 'water')
    `) as Array<Record<string, unknown>>;

    // 全体サマリー
    const totalEntries = grouped.reduce((s, r) => s + Number(r.entry_count ?? 0), 0);
    const totalRevenue = grouped.reduce((s, r) => s + Number(r.total_revenue ?? 0), 0);

    return NextResponse.json({
      query: { year, month },
      groups: grouped,
      summary: {
        totalGroups: grouped.length,
        totalEntries,
        totalRevenue,
      },
      hint: {
        calculation:
          "total_revenue = SUM(selfRevenue + newRevenue + addRevenue) per group, matches calculations.ts:138 (Dashboard 集計式)",
        compareWith:
          "/api/debug/monthly-summary?year=YYYY&month=M で monthly_summaries 値と並べて確認推奨",
      },
    });
  } catch (e) {
    console.error("[debug/entries-summary] db error:", e);
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}
