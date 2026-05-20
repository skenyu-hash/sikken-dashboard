"use client";
// PR #76c: /api/monthly-summary 単一エリア fetch hook。
//
// /targets mobile (MobileTargetCard) で達成率 badge を出すために、
// 表示中エリア × 年月 × 業態 の monthly_summaries 行を取得する。
//
// 設計:
//   - areaId / year / month / category が変わるたび再 fetch
//   - 旧 in-flight は cancelled flag で破棄 (race 防止)
//   - areaId 未確定 (group view 等) では fetch せず data=null
//   - 404 / DB 行なしは { summary: null } で返るため data も null

import { useEffect, useState } from "react";

type SummaryRow = Record<string, unknown> | null;

export function useMonthlySummary({
  areaId, year, month, category,
}: {
  areaId: string | null | undefined;
  year: number;
  month: number;
  category: string;
}): { data: SummaryRow; loading: boolean } {
  const [data, setData] = useState<SummaryRow>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!areaId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/monthly-summary?area=${encodeURIComponent(areaId)}&year=${year}&month=${month}&category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((j: { summary?: SummaryRow }) => {
        if (!cancelled) setData(j.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [areaId, year, month, category]);

  return { data, loading };
}
