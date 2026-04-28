// app/api/agendas/[id]/notes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agendaId = parseInt(id, 10);
  const { notes } = await req.json();

  const updated = await sql`
    UPDATE agendas SET notes = ${notes ?? null} WHERE id = ${agendaId}
    RETURNING id, notes
  ` as any[];

  if (updated.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ agenda: updated[0] });
}
