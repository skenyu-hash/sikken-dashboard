// app/api/meetings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getCyclePeriod } from '@/lib/meeting-types';

const sql = neon(process.env.DATABASE_URL!);

// GET /api/meetings?series=executive&limit=20
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const seriesCode = searchParams.get('series') ?? 'executive';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  const rows = await sql`
    SELECT
      s.*,
      ms.code AS series_code,
      ms.name AS series_name,
      ms.tier AS series_tier,
      (SELECT COUNT(*) FROM agendas a WHERE a.session_id = s.id) AS agenda_count,
      (SELECT COUNT(*) FROM action_items ai
         JOIN agendas a ON ai.agenda_id = a.id
         WHERE a.session_id = s.id AND ai.status != 'done') AS open_actions
    FROM meeting_sessions s
    JOIN meeting_series ms ON s.series_id = ms.id
    WHERE ms.code = ${seriesCode}
    ORDER BY s.meeting_date DESC
    LIMIT ${limit}
  `;

  return NextResponse.json({ sessions: rows });
}

// POST /api/meetings
// body: { series_code, meeting_date, title?, facilitator? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { series_code, meeting_date, title, facilitator, metric_scope, metric_business, metric_area } = body;

  if (!series_code || !meeting_date) {
    return NextResponse.json(
      { error: 'series_code と meeting_date は必須です' },
      { status: 400 }
    );
  }

  const seriesRows = await sql`
    SELECT id FROM meeting_series WHERE code = ${series_code} AND is_active = TRUE
  `;
  if (seriesRows.length === 0) {
    return NextResponse.json({ error: '有効な会議体が見つかりません' }, { status: 400 });
  }

  const date = new Date(meeting_date);
  const cycle_period = getCyclePeriod(date);
  const cycle_year = date.getFullYear();
  const cycle_month = date.getMonth() + 1;

  const inserted = await sql`
 INSERT INTO meeting_sessions
      (series_id, meeting_date, cycle_year, cycle_month, cycle_period, title, facilitator, status, metric_scope, metric_business, metric_area)
    VALUES
      (${seriesRows[0].id}, ${meeting_date}, ${cycle_year}, ${cycle_month}, ${cycle_period}, ${title ?? null}, ${facilitator ?? null}, 'in_progress', ${metric_scope ?? 'group'}, ${metric_business ?? null}, ${metric_area ?? null})
    RETURNING *
`;
  return NextResponse.json({ session: inserted[0] }, { status: 201 });
}
