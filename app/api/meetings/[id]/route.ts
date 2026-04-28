// app/api/meetings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// GET /api/meetings/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);

  const sessions = await sql`
    SELECT s.*, ms.code AS series_code, ms.name AS series_name, ms.tier AS series_tier
    FROM meeting_sessions s
    JOIN meeting_series ms ON s.series_id = ms.id
    WHERE s.id = ${sessionId}
  `;
  if (sessions.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const agendas = await sql`
    SELECT * FROM agendas WHERE session_id = ${sessionId} ORDER BY order_index, id
  `;
  const agendaIds = agendas.map((a: Record<string, unknown>) => a.id as number);

  const [discussions, decisions, actions, metrics] = agendaIds.length > 0
    ? await Promise.all([
        sql`SELECT * FROM discussions WHERE agenda_id = ANY(${agendaIds}::int[]) ORDER BY agenda_id, order_index, id`,
        sql`SELECT * FROM decisions   WHERE agenda_id = ANY(${agendaIds}::int[]) ORDER BY agenda_id, decided_at`,
        sql`SELECT * FROM action_items WHERE agenda_id = ANY(${agendaIds}::int[]) ORDER BY agenda_id, due_date NULLS LAST, id`,
        sql`SELECT * FROM linked_metrics WHERE session_id = ${sessionId} ORDER BY snapshot_at DESC LIMIT 1`,
      ])
    : [
        [],
        [],
        [],
        await sql`SELECT * FROM linked_metrics WHERE session_id = ${sessionId} ORDER BY snapshot_at DESC LIMIT 1`,
      ];

  const agendasWithChildren = agendas.map((a: Record<string, unknown>) => ({
    ...a,
    discussions: discussions.filter((d: Record<string, unknown>) => d.agenda_id === a.id),
    decisions:   decisions.filter((d: Record<string, unknown>) => d.agenda_id === a.id),
    actions:     actions.filter((ai: Record<string, unknown>) => ai.agenda_id === a.id),
  }));

  return NextResponse.json({
    session: sessions[0],
    agendas: agendasWithChildren,
    metrics: metrics[0] ?? null,
  });
}

// PATCH /api/meetings/[id]
// body: { title?, status?, facilitator?, notes? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
  const body = await req.json();

  const result = await sql`
    UPDATE meeting_sessions SET
      title       = COALESCE(${body.title       ?? null}, title),
      status      = COALESCE(${body.status      ?? null}, status),
      facilitator = COALESCE(${body.facilitator ?? null}, facilitator),
      notes       = COALESCE(${body.notes       ?? null}, notes)
    WHERE id = ${sessionId}
    RETURNING *
  `;
  if (result.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ session: result[0] });
}
