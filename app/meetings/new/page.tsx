// app/meetings/new/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const PURPLE = '#3C3489';

export default function NewMeetingPage() {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState('');
  const [facilitator, setFacilitator] = useState('');
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
          series_code: 'executive',
          meeting_date: date,
          title: title || null,
          facilitator: facilitator || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || '作成に失敗しました');
      }
      const { session } = await res.json();
      router.push(`/meetings/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラー');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 20px' }}>
      <a href="/meetings" style={{ fontSize: 13, color: '#888', textDecoration: 'none' }}>
        ← 会議一覧へ
      </a>

      <div
        style={{
          background: PURPLE,
          color: '#fff',
          padding: '20px 24px',
          borderRadius: '12px 12px 0 0',
          marginTop: 12,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>新しい会議</h1>
        <p style={{ fontSize: 12, opacity: 0.85, margin: '4px 0 0' }}>
          開催日からサイクル（上旬／中旬／下旬）が自動で判定されます
        </p>
      </div>

      <div
        style={{
          background: '#fff',
          padding: '24px',
          borderRadius: '0 0 12px 12px',
          border: '0.5px solid rgba(0,0,0,0.1)',
          borderTop: 'none',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>
            開催日 <span style={{ color: '#D85A30' }}>*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>タイトル</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 4月下旬役員会"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>司会</label>
          <input
            type="text"
            value={facilitator}
            onChange={(e) => setFacilitator(e.target.value)}
            placeholder="例: 反謙雄"
            style={inputStyle}
          />
        </div>

        {error && (
          <div
            style={{
              fontSize: 13,
              color: '#A32D2D',
              background: '#FCEBEB',
              border: '0.5px solid #F09595',
              borderRadius: 6,
              padding: '8px 12px',
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || !date}
          style={{
            width: '100%',
            padding: '12px',
            background: PURPLE,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting || !date ? 0.5 : 1,
          }}
        >
          {submitting ? '作成中…' : '作成して議事録を開く'}
        </button>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#444',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '0.5px solid rgba(0,0,0,0.2)',
  borderRadius: 6,
  fontSize: 14,
  boxSizing: 'border-box',
};
