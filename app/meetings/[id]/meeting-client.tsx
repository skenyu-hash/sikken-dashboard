// app/(dashboard)/meetings/[id]/meeting-client.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCyclePeriodShortLabel,
  getStatusLabel,
  formatJpyShort,
} from '@/lib/meeting-types';
import type {
  MeetingSession,
  Agenda,
  Discussion,
  Decision,
  ActionItem,
  LinkedMetrics,
} from '@/lib/meeting-types';

type InitialData = {
  session: MeetingSession;
  agendas: (Agenda & {
    discussions: Discussion[];
    decisions: Decision[];
    actions: ActionItem[];
  })[];
  metrics: LinkedMetrics | null;
};

export default function MeetingClient({ initial }: { initial: InitialData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const refresh = () => {
    startTransition(() => router.refresh());
  };

  const session = initial.session;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <a href="/meetings" className="text-sm text-gray-500 hover:underline">← 会議一覧へ戻る</a>

      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold">
          {session.series_name} — {new Date(session.meeting_date).toLocaleDateString('ja-JP')}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {session.cycle_year}年{session.cycle_month}月
          {getCyclePeriodShortLabel(session.cycle_period)}
          {session.title ? ` ／ ${session.title}` : ''}
          {session.facilitator ? ` ／ 司会: ${session.facilitator}` : ''}
        </p>
      </div>

      <MetricsBar metrics={initial.metrics} sessionId={session.id} onChange={refresh} />

      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">議題</h2>
          <AddAgendaForm sessionId={session.id} onAdded={refresh} />
        </div>

        {initial.agendas.length === 0 ? (
          <div className="text-center py-12 text-gray-500 border rounded-lg bg-gray-50">
            議題がまだありません。「+ 議題を追加」から始めてください。
          </div>
        ) : (
          <div className="space-y-4">
            {initial.agendas.map((a) => (
              <AgendaCard key={a.id} agenda={a} onChange={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// 数字バー（10日会議シート連動）
// =====================================================================
function MetricsBar({
  metrics,
  sessionId,
  onChange,
}: {
  metrics: LinkedMetrics | null;
  sessionId: number;
  onChange: () => void;
}) {
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
      <div className="bg-gray-50 border rounded-lg p-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">10日会議シートから数字をまだ取り込んでいません</span>
        <button
          onClick={sync}
          disabled={loading}
          className="px-3 py-1.5 bg-white border rounded text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? '取り込み中…' : '数字を取り込む'}
        </button>
      </div>
    );
  }

  const m = metrics.metric_data;
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-blue-700">
          10日会議シート連動 ／ {new Date(metrics.snapshot_at).toLocaleString('ja-JP')} 時点
        </div>
        <button onClick={sync} disabled={loading} className="text-xs text-blue-700 hover:underline disabled:opacity-50">
          {loading ? '更新中…' : '再取得'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <Stat label="売上"     value={formatJpyShort(m.revenue as number)} />
        <Stat label="粗利"     value={formatJpyShort(m.gross_profit as number)} />
        <Stat label="広告費"   value={formatJpyShort(m.ad_cost as number)} />
        <Stat label="着地予測" value={formatJpyShort(m.landing_forecast as number)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900">{value}</div>
    </div>
  );
}

// =====================================================================
// 議題カード
// =====================================================================
function AgendaCard({
  agenda,
  onChange,
}: {
  agenda: Agenda & { discussions: Discussion[]; decisions: Decision[]; actions: ActionItem[] };
  onChange: () => void;
}) {
  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="bg-gray-50 px-4 py-3 border-b flex justify-between items-start">
        <div>
          <h3 className="font-semibold">{agenda.title}</h3>
          {agenda.description && <p className="text-sm text-gray-600 mt-1">{agenda.description}</p>}
        </div>
        <span className="text-xs px-2 py-0.5 bg-white border rounded text-gray-700">
          {getStatusLabel(agenda.status)}
        </span>
      </div>

      <div className="p-4 space-y-5">
        <Section title="発言・意見" count={agenda.discussions.length}>
          {agenda.discussions.length === 0 ? (
            <Hint>発言を記録してください</Hint>
          ) : (
            <ul className="space-y-2">
              {agenda.discussions.map((d) => (
                <li key={d.id} className="text-sm leading-relaxed">
                  <span className="font-medium text-blue-700">{d.speaker_name}：</span>
                  <span className="text-gray-800">{d.content}</span>
                </li>
              ))}
            </ul>
          )}
          <AddDiscussionForm agendaId={agenda.id} onAdded={onChange} />
        </Section>

        <Section title="決定事項" count={agenda.decisions.length}>
          {agenda.decisions.length === 0 ? (
            <Hint>まだ決定事項がありません</Hint>
          ) : (
            <ul className="space-y-1.5">
              {agenda.decisions.map((d) => (
                <li key={d.id} className="text-sm flex gap-2">
                  <span className="text-green-600">✓</span>
                  <span className="text-gray-800">{d.content}</span>
                </li>
              ))}
            </ul>
          )}
          <AddDecisionForm agendaId={agenda.id} onAdded={onChange} />
        </Section>

        <Section title="アクション" count={agenda.actions.length}>
          {agenda.actions.length === 0 ? (
            <Hint>アクションがありません</Hint>
          ) : (
            <ul className="space-y-1.5">
              {agenda.actions.map((a) => (
                <ActionRow key={a.id} action={a} onChange={onChange} />
              ))}
            </ul>
          )}
          <AddActionForm agendaId={agenda.id} onAdded={onChange} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
        {title} <span className="text-gray-400 font-normal">({count})</span>
      </h4>
      <div>{children}</div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-gray-400 italic mb-2">{children}</div>;
}

// =====================================================================
// アクション行（チェックボックスで完了切替）
// =====================================================================
function ActionRow({ action, onChange }: { action: ActionItem; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const isDone = action.status === 'done';

  const toggle = async () => {
    setBusy(true);
    try {
      await fetch(`/api/actions/${action.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: isDone ? 'todo' : 'done' }),
      });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="text-sm flex items-center gap-3 py-0.5">
      <input
        type="checkbox"
        checked={isDone}
        onChange={toggle}
        disabled={busy}
        className="w-4 h-4"
      />
      <span className={`flex-1 ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {action.description}
      </span>
      {action.assignee && (
        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">@{action.assignee}</span>
      )}
      {action.due_date && (
        <span className="text-xs text-gray-500">
          〜{new Date(action.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
        </span>
      )}
    </li>
  );
}

// =====================================================================
// 入力フォーム群
// =====================================================================
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
      <button onClick={() => setOpen(true)} className="px-3 py-1.5 bg-black text-white rounded text-sm">
        + 議題を追加
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="議題タイトル"
        className="px-3 py-1.5 border rounded text-sm w-72"
      />
      <button onClick={submit} disabled={busy || !title.trim()} className="px-3 py-1.5 bg-black text-white rounded text-sm disabled:opacity-50">
        追加
      </button>
      <button onClick={() => { setOpen(false); setTitle(''); }} className="px-3 py-1.5 text-sm text-gray-500">
        キャンセル
      </button>
    </div>
  );
}

function AddDiscussionForm({ agendaId, onAdded }: { agendaId: number; onAdded: () => void }) {
  const [speaker, setSpeaker] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!speaker.trim() || !content.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/agendas/${agendaId}/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker_name: speaker.trim(), content: content.trim() }),
      });
      setContent('');
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2 mt-3">
      <input
        value={speaker}
        onChange={(e) => setSpeaker(e.target.value)}
        placeholder="発言者"
        className="px-2 py-1 border rounded text-sm w-24"
      />
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="発言内容"
        className="px-2 py-1 border rounded text-sm flex-1"
      />
      <button onClick={submit} disabled={busy || !speaker.trim() || !content.trim()} className="px-3 py-1 bg-black text-white rounded text-sm disabled:opacity-50">
        追加
      </button>
    </div>
  );
}

function AddDecisionForm({ agendaId, onAdded }: { agendaId: number; onAdded: () => void }) {
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/agendas/${agendaId}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      setContent('');
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2 mt-3">
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="決定事項"
        className="px-2 py-1 border rounded text-sm flex-1"
      />
      <button onClick={submit} disabled={busy || !content.trim()} className="px-3 py-1 bg-black text-white rounded text-sm disabled:opacity-50">
        追加
      </button>
    </div>
  );
}

function AddActionForm({ agendaId, onAdded }: { agendaId: number; onAdded: () => void }) {
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!description.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/agendas/${agendaId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          assignee: assignee.trim() || null,
          due_date: dueDate || null,
        }),
      });
      setDescription('');
      setAssignee('');
      setDueDate('');
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2 mt-3">
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="アクション内容"
        className="px-2 py-1 border rounded text-sm flex-1"
      />
      <input
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        placeholder="担当"
        className="px-2 py-1 border rounded text-sm w-20"
      />
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="px-2 py-1 border rounded text-sm"
      />
      <button onClick={submit} disabled={busy || !description.trim()} className="px-3 py-1 bg-black text-white rounded text-sm disabled:opacity-50">
        追加
      </button>
    </div>
  );
}
