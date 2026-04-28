// app/api/agendas/[id]/discussions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// POST /api/agendas/[id]/discussions
// body: { speaker_name, content }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agendaId = parseInt(id, 10);
  const { speaker_name, content } = await req.json();

  if (!speaker_name || !content) {
    return NextResponse.json({ error: 'speaker_name と content は必須です' }, { status: 400 });
  }

  const maxOrder = await sql`
    SELECT COALESCE(MAX(order_index), 0) AS m FROM discussions WHERE agenda_id = ${agendaId}
  `;
  const nextOrder = (maxOrder[0].m as number) + 10;

  const inserted = await sql`
    INSERT INTO discussions (agenda_id, speaker_name, content, order_index)
    VALUES (${agendaId}, ${String(speaker_name).trim()}, ${String(content).trim()}, ${nextOrder})
    RETURNING *
  `;

  // 議題を「議論中」に自動昇格
  await sql`
    UPDATE agendas SET status = 'discussing'
    WHERE id = ${agendaId} AND status = 'open'
  `;

  return NextResponse.json({ discussion: inserted[0] }, { status: 201 });
}
