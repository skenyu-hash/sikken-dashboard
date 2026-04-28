// app/api/meetings/[id]/sync-metrics/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// POST /api/meetings/[id]/sync-metrics
//
// 既存の 10日会議シート（/meeting）から数字を取り込み、
// linked_metrics に jsonb スナップショットとして保存する。
//
// ★★★ TODO: 下記 SQL を既存の 10日会議シートのテーブル構造に
// 合わせて書き換えてください。`buildMetricRows` の overrides や
// `displaySummary` で使っている集計クエリをここに移植する形が早いです。
//
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);

  const sessions = await sql`
    SELECT cycle_year, cycle_month, cycle_period, meeting_date
    FROM meeting_sessions WHERE id = ${sessionId}
  `;
  if (sessions.length === 0) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  const { cycle_year, cycle_month, cycle_period, meeting_date } = sessions[0];

  // ---------------------------------------------------------------
  // ↓ ここを実テーブルに合わせて書き換える ↓
  // 例:
  // const rows = await sql`
  //   SELECT
  //     SUM(actual_revenue)      AS revenue,
  //     SUM(actual_gross_profit) AS gross_profit,
  //     SUM(actual_ad_cost)      AS ad_cost,
  //     SUM(landing_forecast)    AS landing_forecast
  //   FROM meeting_sheet_data
  //   WHERE year = ${cycle_year} AND month = ${cycle_month}
  // `;
  // const m = rows[0] ?? {};
  // const metric_data = {
  //   revenue:          Number(m.revenue ?? 0),
  //   gross_profit:     Number(m.gross_profit ?? 0),
  //   ad_cost:          Number(m.ad_cost ?? 0),
  //   landing_forecast: Number(m.landing_forecast ?? 0),
  // };

  // 暫定（実装するまでのプレースホルダー）
  const metric_data: Record<string, unknown> = {
    revenue: 0,
    gross_profit: 0,
    ad_cost: 0,
    landing_forecast: 0,
    _note: 'sync-metrics の TODO を書き換えると実数字が入ります',
    _meta: { cycle_year, cycle_month, cycle_period, meeting_date },
  };
  // ↑ ここまで書き換える ↑
  // ---------------------------------------------------------------

  const inserted = await sql`
    INSERT INTO linked_metrics (session_id, source, metric_data)
    VALUES (${sessionId}, 'meeting_sheet', ${JSON.stringify(metric_data)}::jsonb)
    RETURNING *
  `;

  return NextResponse.json({ metrics: inserted[0] });
}
