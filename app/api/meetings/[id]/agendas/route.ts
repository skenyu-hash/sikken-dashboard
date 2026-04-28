// app/api/meetings/[id]/agendas/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// POST /api/meetings/[id]/agendas
// body: { title, description?, parent_agenda_id? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
  const { title, description, parent_agenda_id } = await req.json();

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title は必須です' }, { status: 400 });
  }

  const maxOrder = await sql`
    SELECT COALESCE(MAX(order_index), 0) AS m FROM agendas WHERE session_id = ${sessionId}
  `;
  const nextOrder = (maxOrder[0].m as number) + 10;

  const inserted = await sql`
    INSERT INTO agendas (session_id, parent_agenda_id, title, description, order_index)
    VALUES (
      ${sessionId},
      ${parent_agenda_id ?? null},
      ${title.trim()},
      ${description ?? null},
      ${nextOrder}
    )
    RETURNING *
  `;

  return NextResponse.json({ agenda: inserted[0] }, { status: 201 });
}
