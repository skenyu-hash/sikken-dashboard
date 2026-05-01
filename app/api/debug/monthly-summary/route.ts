// 開発用デバッグエンドポイント。
// monthly_summaries テーブルの生レコードを認証付きで読み取る。
// 用途: 集計値の不整合（例: ダッシュボード表示が期待値と乖離）を調査する際、
// 多重レコード / business_category 表記ゆれ / NULL レコード等を特定するため。
//
// 認証: executive ロールのみ。
// 副作用: なし（SELECT のみ）。
// マージ可否: 緊急対応として暫定マージし、Phase 9.5 で削除 or admin 専用 UI に統合予定。

import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
import { currentRole } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (role !== "executive") {
    return NextResponse.json({ error: "forbidden (executive only)" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const areasParam = searchParams.get("areas") ?? "";
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "missing or invalid year/month" },
      { status: 400 }
    );
  }
  const areas = areasParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const sql = getSql();

    // クエリ1: 指定 year/month の全行（生の business_category 値、COALESCE しない）
    const rows = (
      areas.length > 0
        ? await sql`
            SELECT
              id, area_id, business_category, year, month,
              total_revenue, total_profit, total_count, unit_price,
              ad_cost, ad_rate, acquisition_count, cpa,
              call_count, call_unit_price, conv_rate, profit_rate,
              help_revenue, help_count, help_unit_price, vehicle_count,
              created_at
            FROM monthly_summaries
            WHERE year = ${year} AND month = ${month} AND area_id = ANY(${areas})
            ORDER BY area_id, business_category NULLS FIRST, id
          `
        : await sql`
            SELECT
              id, area_id, business_category, year, month,
              total_revenue, total_profit, total_count, unit_price,
              ad_cost, ad_rate, acquisition_count, cpa,
              call_count, call_unit_price, conv_rate, profit_rate,
              help_revenue, help_count, help_unit_price, vehicle_count,
              created_at
            FROM monthly_summaries
            WHERE year = ${year} AND month = ${month}
            ORDER BY area_id, business_category NULLS FIRST, id
          `
    ) as Array<Record<string, unknown>>;

    // クエリ2: 多重レコード検出（同じ area_id + business_category で複数行）
    const duplicates = (await sql`
      SELECT area_id, business_category, COUNT(*)::int AS count
      FROM monthly_summaries
      WHERE year = ${year} AND month = ${month}
      GROUP BY area_id, business_category
      HAVING COUNT(*) > 1
      ORDER BY area_id, business_category
    `) as Array<Record<string, unknown>>;

    // クエリ3: business_category の DISTINCT 値（表記ゆれ検出）
    const categories = (await sql`
      SELECT DISTINCT business_category
      FROM monthly_summaries
      WHERE year = ${year} AND month = ${month}
      ORDER BY business_category NULLS FIRST
    `) as Array<{ business_category: string | null }>;

    // クエリ4: NULL business_category のレコード件数
    const nullCategoryCount = (await sql`
      SELECT COUNT(*)::int AS count
      FROM monthly_summaries
      WHERE year = ${year} AND month = ${month} AND business_category IS NULL
    `) as Array<{ count: number }>;

    return NextResponse.json({
      ok: true,
      query: { year, month, areas: areas.length > 0 ? areas : "all" },
      rowCount: rows.length,
      duplicates: duplicates.length > 0 ? duplicates : "none",
      distinctCategories: categories.map((c) => c.business_category),
      nullCategoryCount: nullCategoryCount[0]?.count ?? 0,
      rows,
    });
  } catch (e) {
    console.error("/api/debug/monthly-summary:", e);
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}
