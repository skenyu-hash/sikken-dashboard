// app/minutes/[series]/[id]/page.tsx
import { neon } from '@neondatabase/serverless';
import { notFound } from 'next/navigation';
import MeetingClient from './meeting-client';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function getMeetingData(id: number) {
  const sessions = await sql`
    SELECT s.*, ms.code AS series_code, ms.name AS series_name, ms.tier AS series_tier
    FROM meeting_sessions s
    JOIN meeting_series ms ON s.series_id = ms.id
    WHERE s.id = ${id}
  ` as any[];
  if (sessions.length === 0) return null;

  const agendas = await sql`
    SELECT * FROM agendas WHERE session_id = ${id} ORDER BY order_index, id
  ` as any[];
  const agendaIds = agendas.map((a) => a.id);

  const [discussions, concerns, decisions] = agendaIds.length > 0
    ? await Promise.all([
        sql`SELECT * FROM discussions WHERE agenda_id = ANY(${agendaIds}::int[]) ORDER BY agenda_id, order_index, id` as Promise<any[]>,
        sql`SELECT * FROM concerns    WHERE agenda_id = ANY(${agendaIds}::int[]) ORDER BY agenda_id, order_index, id` as Promise<any[]>,
        sql`SELECT * FROM decisions   WHERE agenda_id = ANY(${agendaIds}::int[]) ORDER BY agenda_id, decided_at` as Promise<any[]>,
      ])
    : [[] as any[], [] as any[], [] as any[]];

  const metrics = await sql`
    SELECT * FROM linked_metrics WHERE session_id = ${id} ORDER BY snapshot_at DESC LIMIT 1
  ` as any[];

  const agendasWithChildren = agendas.map((a) => ({
    ...a,
    discussions: discussions.filter((d) => d.agenda_id === a.id),
    concerns:    concerns.filter((c) => c.agenda_id === a.id),
    decisions:   decisions.filter((d) => d.agenda_id === a.id),
  }));

  return {
    session: sessions[0],
    agendas: agendasWithChildren,
    metrics: metrics[0] ?? null,
  };
}

export default async function MeetingDetailPage({ params }: { params: Promise<{ series: string; id: string }> }) {
  const { id } = await params;
  const data = await getMeetingData(parseInt(id, 10));
  if (!data) notFound();

  return <MeetingClient initial={data as any} />;
}
