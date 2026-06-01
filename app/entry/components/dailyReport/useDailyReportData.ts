// PR c95-C-1: 日報の月単位データ取得 + 月集計依存派生計算を担う custom hook。
//
// 抽出元: app/entry/components/DailyReportModal.tsx (c95-A-3) の useEffect (L65-80) +
//   hasDataDays useMemo (L110-114)。
//
// 設計原則 (c95-C-1):
//   - **責務は「月単位データ取得」に閉じる** (entries / summary / loading / hasDataDays)。
//     日単位派生 (todayEntry / kpiToday / kpiMonthly / helpStaffMonthly / companyReference)
//     は呼び出し側 (DailyReportContent) で useMemo する。理由: 日付は UI state、hook は
//     データ層に純化することで c95-C-2 独立ページ + モーダル版で同じ hook を使えるように
//     する (再利用性優先)。
//   - **純リファクタ**: useEffect ロジックも依存配列も完全等価、移植のみ。
//   - **fetch URL / response 構造 / 月境界跨ぎ挙動 すべて旧 DailyReportModal と同一**。

import { useEffect, useMemo, useState } from "react";
import type { DailyEntry } from "../../../lib/calculations";
import type { BusinessCategory } from "../../../lib/businesses";

export type DailyReportData = {
  entries: DailyEntry[];
  summary: Record<string, unknown> | null;
  loading: boolean;
  /** カレンダー ● マーカー用、entries の date.day を集合化 */
  hasDataDays: Set<number>;
};

/**
 * 日報の月単位データ取得 hook。
 *   area/year/month/category を変えると entries と monthly_summary を同時 fetch。
 *   c95-A-3 DailyReportModal の挙動を保つ (LOADING / 月境界跨ぎ再 fetch / cancelled ガード)。
 */
export function useDailyReportData(
  areaId: string,
  year: number,
  month: number,
  category: BusinessCategory,
): DailyReportData {
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  // 月境界を跨ぐと entries と summary を再 fetch (year/month 単位で memo)
  // 抽出元: DailyReportModal L65-80
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/entries?area=${areaId}&year=${year}&month=${month}&category=${category}`)
        .then((r) => r.ok ? r.json() : { entries: [] }),
      fetch(`/api/monthly-summary?area=${areaId}&year=${year}&month=${month}&category=${category}`)
        .then((r) => r.ok ? r.json() : { summary: null }),
    ]).then(([entriesRes, summaryRes]) => {
      if (cancelled) return;
      setEntries(entriesRes.entries ?? []);
      setSummary(summaryRes.summary ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [areaId, year, month, category]);

  // カレンダー用 hasDataDays — 抽出元: DailyReportModal L110-114
  const hasDataDays = useMemo(() => {
    const s = new Set<number>();
    for (const e of entries) s.add(Number(e.date.slice(8, 10)));
    return s;
  }, [entries]);

  return { entries, summary, loading, hasDataDays };
}
