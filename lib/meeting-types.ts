// lib/meeting-types.ts
// SIKKEN 役職会議モジュール — 共有型定義

export type MeetingSeriesCode = 'executive' | 'vice_president' | 'manager' | 'section';
export type SessionStatus     = 'scheduled' | 'in_progress' | 'completed';
export type AgendaStatus      = 'open' | 'discussing' | 'decided' | 'deferred';
export type ActionStatus      = 'todo' | 'in_progress' | 'done' | 'blocked';
export type CyclePeriod       = 1 | 2 | 3; // 1=1〜10日, 2=11〜20日, 3=21〜末日

export interface MeetingSeries {
  id: number;
  code: MeetingSeriesCode;
  name: string;
  tier: number;
  description: string | null;
  cycle_type: string;
  is_active: boolean;
}

export interface MeetingSession {
  id: number;
  series_id: number;
  meeting_date: string;
  cycle_year: number;
  cycle_month: number;
  cycle_period: CyclePeriod;
  title: string | null;
  status: SessionStatus;
  facilitator: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (optional)
  series_code?: MeetingSeriesCode;
  series_name?: string;
  series_tier?: number;
  agenda_count?: number;
  open_actions?: number;
}

export interface Agenda {
  id: number;
  session_id: number;
  parent_agenda_id: number | null;
  title: string;
  description: string | null;
  order_index: number;
  status: AgendaStatus;
  created_at: string;
  updated_at: string;
  // Joined
  discussions?: Discussion[];
  decisions?: Decision[];
  actions?: ActionItem[];
}

export interface Discussion {
  id: number;
  agenda_id: number;
  speaker_name: string;
  content: string;
  order_index: number;
  created_at: string;
}

export interface Decision {
  id: number;
  agenda_id: number;
  parent_decision_id: number | null;
  content: string;
  decided_at: string;
  created_at: string;
}

export interface ActionItem {
  id: number;
  agenda_id: number;
  decision_id: number | null;
  description: string;
  assignee: string | null;
  due_date: string | null;
  status: ActionStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetricData {
  revenue?: number;
  gross_profit?: number;
  ad_cost?: number;
  landing_forecast?: number;
  target_achievement?: number;
  // 自由に拡張可
  [key: string]: unknown;
}

export interface LinkedMetrics {
  id: number;
  session_id: number;
  source: string;
  metric_data: MetricData;
  snapshot_at: string;
  created_at: string;
}

// ----- ヘルパー関数 -----

export function getCyclePeriod(date: Date): CyclePeriod {
  const day = date.getDate();
  if (day <= 10) return 1;
  if (day <= 20) return 2;
  return 3;
}

export function getCyclePeriodLabel(period: CyclePeriod): string {
  return ['', '上旬 (1〜10日)', '中旬 (11〜20日)', '下旬 (21〜末日)'][period];
}

export function getCyclePeriodShortLabel(period: CyclePeriod): string {
  return ['', '上旬', '中旬', '下旬'][period];
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: '予定',
  in_progress: '進行中',
  completed: '完了',
  open: '未着手',
  discussing: '議論中',
  decided: '決定済',
  deferred: '保留',
  todo: '未対応',
  done: '完了',
  blocked: 'ブロック中',
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatJpyShort(value: number | null | undefined): string {
  if (value == null) return '—';
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}億`;
  if (Math.abs(value) >= 10_000)      return `${(value / 10_000).toFixed(0)}万`;
  return value.toLocaleString('ja-JP');
}
