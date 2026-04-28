// app/(dashboard)/meetings/page.tsx
import Link from 'next/link';
import { neon } from '@neondatabase/serverless';
import { getCyclePeriodShortLabel, getStatusLabel } from '@/lib/meeting-types';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function getSessions() {
  return await sql`
    SELECT
      s.*,
      ms.code AS series_code,
      ms.name AS series_name,
      (SELECT COUNT(*) FROM agendas a WHERE a.session_id = s.id) AS agenda_count,
      (SELECT COUNT(*) FROM action_items ai
         JOIN agendas a ON ai.agenda_id = a.id
         WHERE a.session_id = s.id AND ai.status != 'done') AS open_actions
    FROM meeting_sessions s
    JOIN meeting_series ms ON s.series_id = ms.id
    WHERE ms.code = 'executive'
    ORDER BY s.meeting_date DESC
    LIMIT 100
  `;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled:   'bg-gray-100 text-gray-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed:   'bg-green-100 text-green-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {getStatusLabel(status)}
    </span>
  );
}

export default async function MeetingsListPage() {
  const sessions = await getSessions();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold">役職会議</h1>
          <p className="text-sm text-gray-500 mt-1">役員会の議事録・履歴</p>
        </div>
        <Link
          href="/meetings/new"
          className="px-4 py-2 bg-black text-white rounded text-sm hover:bg-gray-800"
        >
          + 新しい会議を作成
        </Link>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium">日付</th>
              <th className="px-4 py-3 text-left font-medium">サイクル</th>
              <th className="px-4 py-3 text-left font-medium">タイトル</th>
              <th className="px-4 py-3 text-left font-medium">議題</th>
              <th className="px-4 py-3 text-left font-medium">未完了アクション</th>
              <th className="px-4 py-3 text-left font-medium">ステータス</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  まだ会議が登録されていません。「+ 新しい会議を作成」から始めてください。
                </td>
              </tr>
            ) : (
              sessions.map((s: Record<string, unknown>) => (
                <tr key={s.id as number} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/meetings/${s.id}`} className="text-blue-600 hover:underline font-medium">
                      {new Date(s.meeting_date as string).toLocaleDateString('ja-JP')}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {s.cycle_year as number}年{s.cycle_month as number}月{getCyclePeriodShortLabel(s.cycle_period as 1 | 2 | 3)}
                  </td>
                  <td className="px-4 py-3">{(s.title as string) || <span className="text-gray-400">無題</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{s.agenda_count as number} 件</td>
                  <td className="px-4 py-3">
                    {(s.open_actions as number) > 0 ? (
                      <span className="text-orange-600 font-medium">{s.open_actions as number} 件</span>
                    ) : (
                      <span className="text-gray-400">0 件</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={s.status as string} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
