// app/api/agendas/[id]/actions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// POST /api/agendas/[id]/actions
// body: { description, assignee?, due_date?, decision_id? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agendaId = parseInt(id, 10);
  const { description, assignee, due_date, decision_id } = await req.json();

  if (!description) {
    return NextResponse.json({ error: 'description は必須です' }, { status: 400 });
  }

  const inserted = await sql`
    INSERT INTO action_items (agenda_id, decision_id, description, assignee, due_date)
    VALUES (
      ${agendaId},
      ${decision_id ?? null},
      ${String(description).trim()},
      ${assignee ?? null},
      ${due_date ?? null}
    )
    RETURNING *
  `;

  return NextResponse.json({ action: inserted[0] }, { status: 201 });
}
