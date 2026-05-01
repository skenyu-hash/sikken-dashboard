// 開発用デバッグエンドポイント。
// monthly_summaries テーブルの生レコードを認証付きで読み取る。
//
// 用途: 集計値の不整合（例: ダッシュボード表示が期待値と乖離）を調査する際、
// 多重レコード / business_category 表記ゆれ / NULL レコード等を特定するため。
//
// 認証: executive ロールのみ（他ロールは 403）
// CORS: 同一オリジンのみ許可（外部アクセス禁止）
// 副作用: なし（SELECT のみ）
// アクセスログ: Vercel Functions Logs に呼出ユーザー / クエリ内容を記録
// 使用期限: Phase 9.5 で削除 or admin UI に統合予定（暫定エンドポイント）

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

  // 同一オリジンチェック: ブラウザからの cross-origin 呼び出しを拒否。
  // server-to-server 呼び出しは Origin ヘッダなしで通る（プログラム的アクセスは
  // 認証 cookie が無い限り 401 で弾かれるので別レイヤで防御）。
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
  const areaId = searchParams.get("area_id");
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "missing or invalid year/month" },
      { status: 400 }
    );
  }

  // アクセスログ: Vercel Functions Logs に出力（誰がいつ何を見たかの追跡用）
  console.log(
    `[debug/monthly-summary] user=${user.email}(id=${user.id}) ` +
      `query=${JSON.stringify({ year, month, area_id: areaId })} at=${new Date().toISOString()}`
  );

  try {
    const sql = getSql();

    // クエリ1: 生レコード（business_category は COALESCE せず生値、NULL も拾う）
    const rows = (
      areaId
        ? await sql`
            SELECT
              id, area_id, business_category, year, month,
              total_revenue, total_profit, total_count, unit_price,
              ad_cost, ad_rate, acquisition_count, cpa,
              call_count, call_unit_price, conv_rate, profit_rate,
              help_revenue, help_count, help_unit_price, vehicle_count,
              created_at
            FROM monthly_summaries
            WHERE year = ${year} AND month = ${month} AND area_id = ${areaId}
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
    `) as Array<{ area_id: string; business_category: string | null; count: number }>;

    // クエリ3: business_category の DISTINCT 値（表記ゆれ検出）
    const distinctCategoriesRaw = (await sql`
      SELECT DISTINCT business_category
      FROM monthly_summaries
      WHERE year = ${year} AND month = ${month}
      ORDER BY business_category NULLS FIRST
    `) as Array<{ business_category: string | null }>;
    const distinctCategories = distinctCategoriesRaw.map((c) => c.business_category);

    // クエリ4: NULL business_category のレコード件数
    const nullCategoryRow = (await sql`
      SELECT COUNT(*)::int AS count
      FROM monthly_summaries
      WHERE year = ${year} AND month = ${month} AND business_category IS NULL
    `) as Array<{ count: number }>;
    const nullCategoryCount = nullCategoryRow[0]?.count ?? 0;

    // summary: rows をクライアント側で集計せず済むようサーバ側で出す
    const perArea: Record<string, number> = {};
    const perCategory: Record<string, number> = {};
    for (const r of rows) {
      const a = String(r.area_id);
      const c = r.business_category === null ? "null" : String(r.business_category);
      perArea[a] = (perArea[a] ?? 0) + 1;
      perCategory[c] = (perCategory[c] ?? 0) + 1;
    }

    return NextResponse.json({
      query: { year, month, area_id: areaId },
      rows,
      duplicates,
      distinctCategories,
      nullCategoryCount,
      summary: {
        totalRows: rows.length,
        perArea,
        perCategory,
      },
    });
  } catch (e) {
    console.error("[debug/monthly-summary] db error:", e);
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}
