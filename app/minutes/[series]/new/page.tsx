'use client';

import { useRouter } from 'next/navigation';
import { useState, use } from 'react';

const PURPLE = '#3C3489';
const PURPLE_DARK = '#26215C';

const SERIES_LABEL: Record<string, string> = {
  executive: '役員会',
  vice_president: '副社長会',
  general_manager: '部長会',
  section_manager: '課長会',
  other_title: 'その他役職会議',
};

const BUSINESS_OPTIONS = [
  { value: 'water', label: '水道' },
  { value: 'electric', label: '電気' },
  { value: 'lock', label: '鍵' },
  { value: 'road', label: 'ロード' },
  { value: 'detective', label: '探偵' },
];

const AREA_OPTIONS = [
  { value: 'kansai', label: '関西' },
  { value: 'kanto', label: '関東' },
  { value: 'nagoya', label: '名古屋' },
  { value: 'kyushu', label: '九州' },
  { value: 'kitakanto', label: '北関東' },
  { value: 'hokkaido', label: '北海道' },
  { value: 'chugoku', label: '中国' },
  { value: 'shizuoka', label: '静岡' },
];

export default function NewMinutesPage({ params }: { params: Promise<{ series: string }> }) {
  const { series } = use(params);
  const seriesLabel = SERIES_LABEL[series] ?? series;

  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [facilitator, setFacilitator] = useState('');
  const [metricScope, setMetricScope] = useState<'group' | 'business' | 'area'>('group');
  const [business, setBusiness] = useState('water');
  const [area, setArea] = useState('kansai');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
  series_code: series,
  meeting_date: date,
  title: title || null,
  facilitator: facilitator || null,
  metric_scope: metricScope,
  metric_business: metricScope === 'business' ? business : null,
  metric_area: metricScope === 'area' ? area : null,
}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || '作成に失敗しました');
      }
      const { session } = await res.json();
      router.push(`/minutes/${series}/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '0.5px solid rgba(0,0,0,0.2)',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    color: PURPLE_DARK,
    fontWeight: 500,
    marginBottom: 6,
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 20px' }}>
      <a href={`/minutes/${series}`} style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>
        ← {seriesLabel} 一覧へ
      </a>

      <div style={{ background: PURPLE, color: '#fff', padding: '20px 24px', borderRadius: '12px 12px 0 0', marginTop: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>新しい議事録 — {seriesLabel}</h1>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>会議日付（必須）</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>タイトル</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：4月度経営会議" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>司会者</label>
          <input type="text" value={facilitator} onChange={(e) => setFacilitator(e.target.value)} placeholder="例：反謙雄" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>数字バーの表示範囲(必須)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" checked={metricScope === 'group'} onChange={() => setMetricScope('group')} />
              <span>グループ全体</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" checked={metricScope === 'business'} onChange={() => setMetricScope('business')} />
              <span>事業別</span>
            </label>
            {metricScope === 'business' && (
              <select value={business} onChange={(e) => setBusiness(e.target.value)} style={{ ...inputStyle, marginLeft: 24, width: 'calc(100% - 24px)' }}>
                {BUSINESS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="radio" checked={metricScope === 'area'} onChange={() => setMetricScope('area')} />
              <span>エリア別</span>
            </label>
            {metricScope === 'area' && (
              <select value={area} onChange={(e) => setArea(e.target.value)} style={{ ...inputStyle, marginLeft: 24, width: 'calc(100% - 24px)' }}>
                {AREA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: '#fee', color: '#c33', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <a href={`/minutes/${series}`} style={{ padding: '8px 16px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 13, color: '#666', textDecoration: 'none' }}>
            キャンセル
          </a>
          <button onClick={submit} disabled={submitting} style={{ background: PURPLE, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? '作成中…' : '議事録を作成'}
          </button>
        </div>
      </div>
    </div>
  );
}