// app/api/actions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// PATCH /api/actions/[id]
// body: { status?, description?, assignee?, due_date? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actionId = parseInt(id, 10);
  const body = await req.json();

  const result = await sql`
    UPDATE action_items SET
      status       = COALESCE(${body.status      ?? null}, status),
      description  = COALESCE(${body.description ?? null}, description),
      assignee     = COALESCE(${body.assignee    ?? null}, assignee),
      due_date     = COALESCE(${body.due_date    ?? null}, due_date),
      completed_at = CASE
        WHEN ${body.status ?? null} = 'done' THEN NOW()
        WHEN ${body.status ?? null} IS NOT NULL AND ${body.status ?? null} != 'done' THEN NULL
        ELSE completed_at
      END
    WHERE id = ${actionId}
    RETURNING *
  `;

  if (result.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ action: result[0] });
}

// DELETE /api/actions/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actionId = parseInt(id, 10);
  await sql`DELETE FROM action_items WHERE id = ${actionId}`;
  return NextResponse.json({ ok: true });
}
