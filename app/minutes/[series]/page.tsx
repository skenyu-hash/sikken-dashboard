// app/minutes/[series]/page.tsx
import Link from 'next/link';
import { neon } from '@neondatabase/serverless';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const PURPLE = '#3C3489';
const PURPLE_LIGHT = '#EEEDFE';
const PURPLE_DARK = '#26215C';

const SERIES_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  executive:       { label: '役員会',         color: '#854F0B', bgColor: '#FAEEDA' },
  vice_president:  { label: '副社長会',       color: '#3C3489', bgColor: '#EEEDFE' },
  general_manager: { label: '部長会',         color: '#185FA5', bgColor: '#E6F1FB' },
  section_manager: { label: '課長会',         color: '#993556', bgColor: '#FBEAF0' },
  other_title:     { label: 'その他役職会議', color: '#0F6E56', bgColor: '#E1F5EE' },
};

async function getSessions(seriesCode: string) {
  return await sql`
    SELECT
      s.*,
      ms.code AS series_code,
      ms.name AS series_name,
      (SELECT COUNT(*) FROM agendas a WHERE a.session_id = s.id) AS agenda_count
    FROM meeting_sessions s
    JOIN meeting_series ms ON s.series_id = ms.id
    WHERE ms.code = ${seriesCode}
    ORDER BY s.meeting_date DESC
    LIMIT 100
  ` as any[];
}

function getCyclePeriodShortLabel(period: number): string {
  return ['', '上旬', '中旬', '下旬'][period] ?? '';
}

function StatusBadge({ status, seriesColor, seriesBg }: { status: string; seriesColor: string; seriesBg: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    scheduled:   { bg: '#F1EFE8', color: '#5F5E5A', label: '予定' },
    in_progress: { bg: seriesBg,  color: seriesColor, label: '進行中' },
    completed:   { bg: '#E1F5EE', color: '#0F6E56', label: '完了' },
  };
  const s = map[status] ?? { bg: '#F1EFE8', color: '#5F5E5A', label: status };
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 11, background: s.bg, color: s.color, fontWeight: 500 }}>{s.label}</span>;
}

export default async function SeriesListPage({ params }: { params: Promise<{ series: string }> }) {
  const { series } = await params;
  const config = SERIES_CONFIG[series];
  if (!config) notFound();

  const sessions = await getSessions(series);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <Link href="/minutes" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>← 議事録ハブへ戻る</Link>

      <div style={{ background: PURPLE, color: '#fff', padding: '20px 24px', borderRadius: '12px 12px 0 0', marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{config.label}</h1>
            <p style={{ fontSize: 13, opacity: 0.85, margin: '4px 0 0' }}>議事録一覧</p>
          </div>
          <Link href={`/minutes/${series}/new`} style={{ background: '#fff', color: PURPLE, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>+ 新しい会議を作成</Link>
        </div>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: PURPLE_LIGHT }}>
              <th style={thStyle}>日付</th>
              <th style={thStyle}>サイクル</th>
              <th style={thStyle}>タイトル</th>
              <th style={thStyle}>議題</th>
              <th style={thStyle}>司会</th>
              <th style={thStyle}>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: '#888' }}>
                  まだ会議が登録されていません。「+ 新しい会議を作成」から始めてください。
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
                <tr key={s.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                  <td style={tdStyle}>
                    <Link href={`/minutes/${series}/${s.id}`} style={{ color: '#185FA5', textDecoration: 'none', fontWeight: 500 }}>
                      {new Date(s.meeting_date).toLocaleDateString('ja-JP')}
                    </Link>
                  </td>
                  <td style={{ ...tdStyle, color: '#666' }}>
                    {s.cycle_year}年{s.cycle_month}月{getCyclePeriodShortLabel(s.cycle_period)}
                  </td>
                  <td style={tdStyle}>
                    {s.title || <span style={{ color: '#aaa' }}>無題</span>}
                  </td>
                  <td style={{ ...tdStyle, color: '#666' }}>{s.agenda_count} 件</td>
                  <td style={{ ...tdStyle, color: '#666' }}>
                    {s.facilitator || <span style={{ color: '#aaa' }}>—</span>}
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={s.status} seriesColor={config.color} seriesBg={config.bgColor} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontSize: 12,
  fontWeight: 500,
  color: PURPLE_DARK,
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
};
