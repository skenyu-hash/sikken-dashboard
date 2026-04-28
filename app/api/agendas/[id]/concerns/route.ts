// app/api/agendas/[id]/concerns/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agendaId = parseInt(id, 10);
  const { speaker_name, content } = await req.json();

  if (!speaker_name || !content) {
    return NextResponse.json({ error: 'speaker_name と content は必須です' }, { status: 400 });
  }

  const maxOrder = await sql`
    SELECT COALESCE(MAX(order_index), 0) AS m FROM concerns WHERE agenda_id = ${agendaId}
  ` as any[];
  const nextOrder = Number(maxOrder[0].m) + 10;

  const inserted = await sql`
    INSERT INTO concerns (agenda_id, speaker_name, content, order_index)
    VALUES (${agendaId}, ${String(speaker_name).trim()}, ${String(content).trim()}, ${nextOrder})
    RETURNING *
  ` as any[];

  return NextResponse.json({ concern: inserted[0] }, { status: 201 });
}
