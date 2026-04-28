// app/(dashboard)/meetings/new/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
    <div className="p-6 max-w-xl mx-auto">
      <a href="/meetings" className="text-sm text-gray-500 hover:underline">← 会議一覧へ</a>
      <h1 className="text-2xl font-semibold mt-2 mb-6">新しい会議</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">開催日 <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
          <p className="text-xs text-gray-500 mt-1">サイクル（上旬/中旬/下旬）は日付から自動判定されます</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">タイトル</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 4月下旬役員会"
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">司会</label>
          <input
            type="text"
            value={facilitator}
            onChange={(e) => setFacilitator(e.target.value)}
            placeholder="例: 反謙雄"
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

        <button
          onClick={submit}
          disabled={submitting || !date}
          className="w-full py-2 bg-black text-white rounded font-medium disabled:opacity-50"
        >
          {submitting ? '作成中…' : '作成して議事録を開く'}
        </button>
      </div>
    </div>
  );
}
