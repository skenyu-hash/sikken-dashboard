"use client";
// 年次 (YTD) ビュー データ取得 hook (year-view スライス2)。
//
// 役割: scope (業態×エリアのペア集合) を受け、各業態について
//   - monthly-summary-bulk (実績、既存 API、認証なし)
//   - targets-bulk?full=1   (目標、既存 API を slice2 で full 拡張、認証あり)
//   を 1 年分まとめて並列 fetch し、検証済み純関数 (yearAggregation.ts) に通して
//   業態別の YTD 実績 + 年次目標 (ペース/年間) を返す。
//
// 設計: 既存 Dashboard.tsx の 14 個の月固定 effect には一切触れない。年次は本 hook に隔離。
// READ ONLY (GET のみ)。DB 書き込みなし。
// 事業別 (1 業態×複数エリア) でも会社別 (複数業態×複数エリア) でも同じ pairs 集合で動く。

import { useState, useEffect } from "react";
import type { BusinessCategory } from "../lib/businesses";
import {
  aggregateYearlyActuals,
  aggregateYearlyTargets,
  type YtdActuals,
  type YearlyTargets,
} from "../lib/yearAggregation";
import { manToYen, type Targets } from "../lib/calculations";

export type YearScopePair = { category: BusinessCategory; areaId: string };

export type YearAggregateResult = {
  actuals: Partial<Record<BusinessCategory, YtdActuals>>;
  targets: Partial<Record<BusinessCategory, YearlyTargets>>;
  loading: boolean;
};

type BulkActualRes = { summaries?: Array<Record<string, unknown>> };
type BulkTargetRes = { targets?: Array<{ year: number; month: number; targets: Targets }> };

/**
 * @param pairs 表示 scope の (業態×エリア) ペア集合。空なら何もしない。
 * @param viewYear 閲覧する暦年 (例 2026)。
 * @param now 現在日時 (テスト容易化のため注入可。既定 new Date())。
 */
export function useYearAggregate(
  pairs: YearScopePair[],
  viewYear: number,
  now: Date = new Date(),
): YearAggregateResult {
  const [actuals, setActuals] = useState<Partial<Record<BusinessCategory, YtdActuals>>>({});
  const [targets, setTargets] = useState<Partial<Record<BusinessCategory, YearlyTargets>>>({});
  const [loading, setLoading] = useState(false);

  // pairs は配列参照が毎回変わるため、内容で依存比較する。
  const pairsKey = JSON.stringify(pairs);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const asOfDay = now.getDate();
  // 当月の日数 (currentMonth の末日)。pacing 按分の分母。
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  useEffect(() => {
    if (pairs.length === 0) {
      setActuals({});
      setTargets({});
      return;
    }
    let cancelled = false;
    setLoading(true);

    // 業態ごとにエリアをまとめる (1 業態 = 1 回の bulk fetch)。
    const areasByCat = new Map<BusinessCategory, string[]>();
    for (const { category, areaId } of pairs) {
      const arr = areasByCat.get(category) ?? [];
      if (!arr.includes(areaId)) arr.push(areaId);
      areasByCat.set(category, arr);
    }

    (async () => {
      const actualRows: Array<{ category: BusinessCategory; summary: Record<string, unknown> | null }> = [];
      const targetsOut: Partial<Record<BusinessCategory, YearlyTargets>> = {};

      await Promise.all(
        [...areasByCat.entries()].map(async ([category, areas]) => {
          const areasParam = areas.join(",");
          const [aRes, tRes] = await Promise.all([
            fetch(`/api/monthly-summary-bulk?areas=${areasParam}&year=${viewYear}&category=${category}`)
              .then((r) => (r.ok ? (r.json() as Promise<BulkActualRes>) : { summaries: [] })),
            fetch(`/api/targets-bulk?areas=${areasParam}&year=${viewYear}&category=${category}&full=1`)
              .then((r) => (r.ok ? (r.json() as Promise<BulkTargetRes>) : { targets: [] })),
          ]);

          for (const s of aRes.summaries ?? []) {
            actualRows.push({ category, summary: s });
          }

          // 目標: manToYen で円換算してから純関数へ (Dashboard 既存流儀)。
          const targetRows = (tRes.targets ?? []).map((row) => ({
            year: Number(row.year),
            month: Number(row.month),
            targets: manToYen(row.targets),
          }));
          targetsOut[category] = aggregateYearlyTargets(targetRows, {
            viewYear, currentYear, currentMonth, asOfDay, daysInMonth,
          });
        }),
      );

      if (cancelled) return;
      setActuals(aggregateYearlyActuals(actualRows));
      setTargets(targetsOut);
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey, viewYear, currentYear, currentMonth, asOfDay, daysInMonth]);

  return { actuals, targets, loading };
}
