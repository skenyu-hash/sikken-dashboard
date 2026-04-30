// app/minutes/page.tsx
import Link from 'next/link';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const PURPLE = '#3C3489';
const PURPLE_LIGHT = '#EEEDFE';

const SERIES_CONFIG: Record<string, { label: string; color: string; bgColor: string; textColor: string; description: string }> = {
  executive:       { label: '役員会',         color: '#854F0B', bgColor: '#FAEEDA', textColor: '#412402', description: '取締役・役員レベルの議事録' },
  vice_president:  { label: '副社長会',       color: '#3C3489', bgColor: '#EEEDFE', textColor: '#26215C', description: '副社長の意思決定会議' },
  general_manager: { label: '部長会',         color: '#185FA5', bgColor: '#E6F1FB', textColor: '#042C53', description: '各社毎の部長会議' },
  section_manager: { label: '課長会',         color: '#993556', bgColor: '#FBEAF0', textColor: '#4B1528', description: '課長レベルの定例会議' },
  other_title:     { label: 'その他役職会議', color: '#0F6E56', bgColor: '#E1F5EE', textColor: '#04342C', description: 'エリア役職者など、その他の会議' },
};

const SERIES_ORDER = ['executive', 'vice_president', 'general_manager', 'section_manager', 'other_title'];

async function getSeriesStats() {
  const rows = await sql`
    SELECT
      ms.code,
      ms.name,
      ms.tier,
      ms.is_active,
      COUNT(s.id) AS session_count,
      MAX(s.meeting_date) AS latest_date
    FROM meeting_series ms
    LEFT JOIN meeting_sessions s ON s.series_id = ms.id
    WHERE ms.is_active = true
    GROUP BY ms.id, ms.code, ms.name, ms.tier, ms.is_active
    ORDER BY ms.tier
  ` as any[];
  return rows;
}

export default async function MinutesHubPage() {
  const stats = await getSeriesStats();

  const statsByCode: Record<string, any> = {};
  stats.forEach((s) => {
    statsByCode[s.code] = s;
  });

  return (
    <div style={{ padding: '24px 20px' }}>
      <div style={{ background: PURPLE, color: '#fff', padding: '20px 24px', borderRadius: '12px 12px 0 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>議事録</h1>
        <p style={{ fontSize: 13, opacity: 0.85, margin: '4px 0 0' }}>役職別の会議議事録を管理します</p>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {SERIES_ORDER.map((code) => {
            const config = SERIES_CONFIG[code];
            const stat = statsByCode[code];
            if (!config) return null;

            const sessionCount = stat ? Number(stat.session_count) : 0;
            const latestDate = stat?.latest_date ? new Date(stat.latest_date).toLocaleDateString('ja-JP') : null;

            return (
              <Link key={code} href={`/minutes/${code}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: config.bgColor, borderRadius: 10, padding: '18px 20px', cursor: 'pointer', border: '0.5px solid rgba(0,0,0,0.05)', transition: 'transform 0.1s' }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: config.color, marginBottom: 6 }}>{config.label}</div>
                  <div style={{ fontSize: 12, color: config.textColor, opacity: 0.75, marginBottom: 12, lineHeight: 1.5 }}>{config.description}</div>
                  <div style={{ fontSize: 11, color: config.color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span>{sessionCount > 0 ? `${sessionCount}件` : '0件'}</span>
                    {latestDate && <span style={{ opacity: 0.7 }}>／ 直近 {latestDate}</span>}
                    {sessionCount === 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        background: 'rgba(0,0,0,0.06)', color: config.color,
                        borderRadius: 10, padding: '1px 8px',
                      }}>準備中</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
