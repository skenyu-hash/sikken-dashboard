// app/meetings/[id]/meeting-client.tsx
'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const PURPLE = '#3C3489';
const PURPLE_LIGHT = '#EEEDFE';
const PURPLE_TINT = '#F8F7FE';
const PURPLE_DARK = '#26215C';
const PURPLE_MID = '#534AB7';
const BLUE = '#185FA5';
const AMBER = '#BA7517';
const AMBER_LIGHT = '#FAEEDA';
const AMBER_DARK = '#854F0B';
const AMBER_TEXT = '#412402';
const TEAL = '#0F6E56';
const TEAL_LIGHT = '#E1F5EE';
const TEAL_DARK = '#04342C';
const GRAY = '#888780';
const GRAY_LIGHT = '#F1EFE8';
const GRAY_DARK = '#444441';

type AnyRow = Record<string, any>;

type InitialData = {
  session: AnyRow;
  agendas: (AnyRow & {
    discussions: AnyRow[];
    concerns: AnyRow[];
    decisions: AnyRow[];
  })[];
  metrics: AnyRow | null;
};

function getCyclePeriodShortLabel(period: number): string {
  return ['', '上旬', '中旬', '下旬'][period] ?? '';
}

function formatJpyShort(value: number | null | undefined): string {
  if (value == null || isNaN(Number(value))) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億`;
  if (Math.abs(n) >= 10_000)      return `${(n / 10_000).toFixed(0)}万`;
  return n.toLocaleString('ja-JP');
}

export default function MeetingClient({ initial }: { initial: InitialData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const session = initial.session;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ background: PURPLE, color: '#fff', padding: '16px 24px', borderRadius: '12px 12px 0 0' }}>
        <a href="/meetings" style={{ display: 'inline-block', color: '#fff', opacity: 0.75, textDecoration: 'none', fontSize: 12, marginBottom: 6 }}>← 会議一覧へ戻る</a>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>
              {session.series_name} — {new Date(session.meeting_date).toLocaleDateString('ja-JP')}
            </h1>
            <p style={{ fontSize: 12, opacity: 0.85, margin: '4px 0 0' }}>
              {session.cycle_year}年{session.cycle_month}月
              {getCyclePeriodShortLabel(session.cycle_period)}
              {session.title ? ` ／ ${session.title}` : ''}
              {session.facilitator ? ` ／ 司会: ${session.facilitator}` : ''}
            </p>
          </div>
          <StatusChip status={session.status} />
        </div>
      </div>

      <MetricsBar metrics={initial.metrics} sessionId={session.id} onChange={refresh} />

      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>議題（{initial.agendas.length}件）</h2>
          <AddAgendaForm sessionId={session.id} onAdded={refresh} />
        </div>

        {initial.agendas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888', border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 8, background: '#FAFAFA', fontSize: 13 }}>
            議題がまだありません。「+ 議題を追加」から始めてください。
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {initial.agendas.map((a) => (
              <AgendaCard key={a.id} agenda={a} onChange={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    scheduled:   { bg: 'rgba(255,255,255,0.2)', color: '#fff', label: '予定' },
    in_progress: { bg: 'rgba(255,255,255,0.2)', color: '#fff', label: '進行中' },
    completed:   { bg: 'rgba(255,255,255,0.2)', color: '#fff', label: '完了' },
  };
  const s = map[status] ?? map.in_progress;
  return <span style={{ background: s.bg, color: s.color, padding: '4px 10px', borderRadius: 6, fontSize: 11 }}>{s.label}</span>;
}

function MetricsBar({ metrics, sessionId, onChange }: { metrics: AnyRow | null; sessionId: number; onChange: () => void }) {
  const [loading, setLoading] = useState(false);

  const sync = async () => {
    setLoading(true);
    try {
      await fetch(`/api/meetings/${sessionId}/sync-metrics`, { method: 'POST' });
      onChange();
    } finally {
      setLoading(false);
    }
  };

  if (!metrics) {
    return (
      <div style={{ background: PURPLE_LIGHT, padding: '12px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: PURPLE_DARK }}>
        <span>10日会議シートから数字をまだ取り込んでいません</span>
        <button onClick={sync} disabled={loading} style={{ background: '#fff', color: PURPLE, border: `0.5px solid ${PURPLE_MID}`, padding: '4px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
          {loading ? '取り込み中…' : '数字を取り込む'}
        </button>
      </div>
    );
  }

  const m = metrics.metric_data ?? {};
  return (
    <div style={{ background: PURPLE_LIGHT, padding: '12px 20px', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: PURPLE_DARK }}>
          10日会議シート連動 ／ {new Date(metrics.snapshot_at).toLocaleString('ja-JP')} 時点
        </div>
        <button onClick={sync} disabled={loading} style={{ background: 'transparent', color: PURPLE, border: '0.5px solid #AFA9EC', padding: '2px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
          {loading ? '更新中…' : '再取得'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <Stat label="売上" value={formatJpyShort(m.revenue)} />
        <Stat label="粗利" value={formatJpyShort(m.gross_profit)} />
        <Stat label="広告費" value={formatJpyShort(m.ad_cost)} />
        <Stat label="着地予測" value={formatJpyShort(m.landing_forecast)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: PURPLE_MID }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: PURPLE_DARK }}>{value}</div>
    </div>
  );
}

function AgendaCard({ agenda, onChange }: { agenda: AnyRow & { discussions: AnyRow[]; concerns: AnyRow[]; decisions: AnyRow[] }; onChange: () => void }) {
  const statusMap: Record<string, { bg: string; color: string; label: string }> = {
    open:       { bg: GRAY_LIGHT, color: GRAY_DARK, label: '未着手' },
    discussing: { bg: PURPLE_LIGHT, color: PURPLE, label: '議論中' },
    decided:    { bg: TEAL_LIGHT, color: TEAL, label: '決定済' },
    deferred:   { bg: GRAY_LIGHT, color: GRAY_DARK, label: '保留' },
  };
  const s = statusMap[agenda.status] ?? statusMap.open;

  return (
    <div style={{ border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ background: PURPLE_TINT, padding: '10px 14px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{agenda.title}</div>
        <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>{s.label}</span>
      </div>

      <div style={{ padding: '14px' }}>
        {agenda.description && (<p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>{agenda.description}</p>)}

        <Section dotColor={BLUE} title="発言・意見" count={agenda.discussions.length}>
          {agenda.discussions.length === 0 ? (
            <Hint>発言を記録してください</Hint>
          ) : (
            <div style={{ marginBottom: 8 }}>
              {agenda.discussions.map((d) => (
                <div key={d.id} style={{ fontSize: 13, lineHeight: 1.7 }}>
                  <span style={{ color: BLUE, fontWeight: 500 }}>{d.speaker_name}：</span>
                  <span style={{ color: '#222' }}>{d.content}</span>
                </div>
              ))}
            </div>
          )}
          <SpeakerInputForm
            onSubmit={async (speaker, content) => {
              await fetch(`/api/agendas/${agenda.id}/discussions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ speaker_name: speaker, content }),
              });
              onChange();
            }}
            placeholder="発言内容"
          />
        </Section>

        <Section dotColor={AMBER} title="補足事項・懸念事項" count={agenda.concerns.length}>
          {agenda.concerns.length === 0 ? (
            <Hint>補足や懸念があれば記録してください</Hint>
          ) : (
            <div style={{ marginBottom: 8 }}>
              {agenda.concerns.map((c) => (
                <div key={c.id} style={{ background: AMBER_LIGHT, borderLeft: `3px solid ${AMBER}`, borderRadius: '0 4px 4px 0', padding: '6px 10px', marginBottom: 4, fontSize: 13, lineHeight: 1.6 }}>
                  <span style={{ color: AMBER_DARK, fontWeight: 500 }}>{c.speaker_name}：</span>
                  <span style={{ color: AMBER_TEXT }}>{c.content}</span>
                </div>
              ))}
            </div>
          )}
          <SpeakerInputForm
            onSubmit={async (speaker, content) => {
              await fetch(`/api/agendas/${agenda.id}/concerns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ speaker_name: speaker, content }),
              });
              onChange();
            }}
            placeholder="補足や懸念事項"
          />
        </Section>

        <Section dotColor={TEAL} title="決定事項" count={agenda.decisions.length}>
          {agenda.decisions.length === 0 ? (
            <Hint>まだ決定事項がありません</Hint>
          ) : (
            <div style={{ marginBottom: 8 }}>
              {agenda.decisions.map((d) => (
                <div key={d.id} style={{ background: TEAL_LIGHT, borderRadius: 4, padding: '6px 10px', marginBottom: 4, fontSize: 13, lineHeight: 1.6, color: TEAL_DARK }}>
                  <span style={{ color: TEAL, fontWeight: 500 }}>✓</span>
                  <span style={{ marginLeft: 6 }}>{d.content}</span>
                </div>
              ))}
            </div>
          )}
          <SimpleInputForm
            onSubmit={async (content) => {
              await fetch(`/api/agendas/${agenda.id}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
              });
              onChange();
            }}
            placeholder="決定事項"
          />
        </Section>

        <Section dotColor={GRAY} title="メモ" count={null}>
          <NotesEditor agendaId={agenda.id} initialNotes={agenda.notes} />
        </Section>
      </div>
    </div>
  );
}

function Section({ dotColor, title, count, children }: { dotColor: string; title: string; count: number | null; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-block', width: 6, height: 6, background: dotColor, borderRadius: '50%' }} />
        {title}
        {count !== null && <span style={{ color: '#aaa', textTransform: 'none' }}>({count})</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', marginBottom: 6 }}>{children}</div>;
}

function AddAgendaForm({ sessionId, onAdded }: { sessionId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/meetings/${sessionId}/agendas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      setTitle('');
      setOpen(false);
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: PURPLE, color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
        + 議題を追加
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="議題タイトル" style={{ padding: '6px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 13, width: 240 }} />
      <button onClick={submit} disabled={busy || !title.trim()} style={{ background: PURPLE, color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: busy || !title.trim() ? 0.5 : 1 }}>追加</button>
      <button onClick={() => { setOpen(false); setTitle(''); }} style={{ background: 'transparent', color: '#666', border: 'none', padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>キャンセル</button>
    </div>
  );
}

function SpeakerInputForm({ onSubmit, placeholder }: { onSubmit: (speaker: string, content: string) => Promise<void>; placeholder: string }) {
  const [speaker, setSpeaker] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!speaker.trim() || !content.trim()) return;
    setBusy(true);
    try {
      await onSubmit(speaker.trim(), content.trim());
      setContent('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <input value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="発言者" style={{ padding: '6px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 13, width: 80 }} />
      <input value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={placeholder} style={{ flex: 1, padding: '6px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 13 }} />
      <button onClick={submit} disabled={busy || !speaker.trim() || !content.trim()} style={{ background: PURPLE, color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: busy || !speaker.trim() || !content.trim() ? 0.5 : 1 }}>追加</button>
    </div>
  );
}

function SimpleInputForm({ onSubmit, placeholder }: { onSubmit: (content: string) => Promise<void>; placeholder: string }) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await onSubmit(content.trim());
      setContent('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
      <input value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={placeholder} style={{ flex: 1, padding: '6px 10px', border: '0.5px solid rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 13 }} />
      <button onClick={submit} disabled={busy || !content.trim()} style={{ background: PURPLE, color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: busy || !content.trim() ? 0.5 : 1 }}>追加</button>
    </div>
  );
}

function NotesEditor({ agendaId, initialNotes }: { agendaId: number; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const save = async (val: string) => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/agendas/${agendaId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: val }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (val: string) => {
    setNotes(val);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(val), 800);
  };

  return (
    <div>
      <textarea value={notes} onChange={(e) => handleChange(e.target.value)} placeholder="自由メモ（自動保存）" rows={3} style={{ width: '100%', padding: '8px 10px', background: GRAY_LIGHT, border: '0.5px solid rgba(0,0,0,0.1)', borderRadius: 4, fontSize: 12, lineHeight: 1.6, color: GRAY_DARK, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4, height: 14 }}>
        {saving ? '保存中…' : saved ? '✓ 保存しました' : ''}
      </div>
    </div>
  );
}
