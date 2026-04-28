// app/api/agendas/[id]/decisions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// POST /api/agendas/[id]/decisions
// body: { content, parent_decision_id? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agendaId = parseInt(id, 10);
  const { content, parent_decision_id } = await req.json();

  if (!content) {
    return NextResponse.json({ error: 'content は必須です' }, { status: 400 });
  }

  const inserted = await sql`
    INSERT INTO decisions (agenda_id, content, parent_decision_id)
    VALUES (${agendaId}, ${String(content).trim()}, ${parent_decision_id ?? null})
    RETURNING *
  `;

  // 議題を「決定済」に昇格
  await sql`
    UPDATE agendas SET status = 'decided' WHERE id = ${agendaId} AND status != 'decided'
  `;

  return NextResponse.json({ decision: inserted[0] }, { status: 201 });
}
