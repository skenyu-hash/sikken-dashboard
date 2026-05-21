"use client";
// PR c92-1: bulk daily-diff matrix の state 管理 + 一括保存 orchestration。
//
// 設計:
//   - 14 セル (area × business の組合せ) を Map<"${area}::${cat}", CellState> で保持
//   - 各セルは 4 inline field + dirty フラグ + 保存 status
//   - 初回 mount: 全 14 セルを並列に /api/entries で fetch、該当 day の entry を prefill
//   - bulk 保存: dirty セルのみ、3 並列 (semaphore) で POST /api/entries
//   - 失敗セルは saveStatus="error" で識別、UI で再試行可能
//
// 並列 3 制限の理由 (Q6=a):
//   - Neon free tier の接続上限考慮
//   - aggregation 同時実行による DB 負荷分散
//   - 14 件並列だと burst で接続枯渇リスク
//
// auto-save は OFF (c89-p1 AUTOSAVE_DISABLED_C89_P1=true)。
// 本 hook は inline 編集で state 更新するが POST は触発しない。
// 明示的に triggerBulkSave() が呼ばれた時のみ POST 群が発火する。

import { useCallback, useEffect, useState } from "react";
import { BUSINESSES, type BusinessCategory } from "../../lib/businesses";
import type { DailyEntry } from "../../lib/calculations";

// 14 セルの全組合せ。BUSINESSES から導出して定数化。
//   水道 8 + 電気 2 + 鍵 1 + ロード 1 + 探偵 2 = 14
export const ALL_CELLS: { area: string; category: BusinessCategory; areaName: string; categoryLabel: string }[] = (() => {
  const labels: Record<BusinessCategory, string> = {
    water: "水道", electric: "電気", locksmith: "鍵", road: "ロード", detective: "探偵",
  };
  const areaNames: Record<string, string> = {
    kansai: "関西", kanto: "関東", nagoya: "名古屋", kyushu: "九州",
    kitakanto: "北関東", hokkaido: "北海道", chugoku: "中国", shizuoka: "静岡",
  };
  const cells: { area: string; category: BusinessCategory; areaName: string; categoryLabel: string }[] = [];
  for (const biz of BUSINESSES) {
    for (const areaId of biz.areas) {
      cells.push({
        area: areaId,
        category: biz.id,
        areaName: areaNames[areaId] ?? areaId,
        categoryLabel: labels[biz.id],
      });
    }
  }
  return cells;
})();

export type CellKey = string; // `${area}::${category}`
export const cellKey = (area: string, category: string): CellKey => `${area}::${category}`;

/** 1 セル分の state。4 inline field + 保存 status。 */
export type CellState = {
  area: string;
  category: BusinessCategory;
  // 4 inline 入力 (c92-1 では各セル空 or 既存値プリロード)
  outsourced_sales_revenue: number | "";  // 売上
  acquisition_count: number | "";         // 獲得件数
  ad_cost: number | "";                   // 広告費
  // CPA は derived (ad_cost / acquisition_count) — input ではない
  // 状態
  dirty: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  errorMsg?: string;
  hasExistingEntry: boolean; // 該当 day に DB 行があったか (修正 vs 新規)
};

export type BulkEntryState = {
  cells: Map<CellKey, CellState>;
  loading: boolean;
  saving: boolean;
};

type Options = {
  year: number;
  month: number;
  day: number;
};

/** semaphore: 同時実行を最大 limit に制限する worker pool。
 *  PR c92-1 Q6=a: limit=3 で aggregation 競合 / Neon 接続上限を回避。 */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(workers);
}

const emptyCell = (area: string, category: BusinessCategory): CellState => ({
  area, category,
  outsourced_sales_revenue: "",
  acquisition_count: "",
  ad_cost: "",
  dirty: false,
  saveStatus: "idle",
  hasExistingEntry: false,
});

const dateStr = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function useBulkEntryState({ year, month, day }: Options) {
  const [cells, setCells] = useState<Map<CellKey, CellState>>(() => {
    const map = new Map<CellKey, CellState>();
    for (const c of ALL_CELLS) map.set(cellKey(c.area, c.category), emptyCell(c.area, c.category));
    return map;
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 初回 mount + day 変化で全 14 セルを並列 fetch
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoading(true);
      const target = dateStr(year, month, day);
      await Promise.all(ALL_CELLS.map(async ({ area, category }) => {
        try {
          const res = await fetch(`/api/entries?area=${area}&year=${year}&month=${month}&category=${category}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json() as { entries?: DailyEntry[] };
          const dayEntry = json.entries?.find((e) => e.date === target);
          if (cancelled) return;
          setCells((prev) => {
            const next = new Map(prev);
            const ck = cellKey(area, category);
            if (dayEntry) {
              next.set(ck, {
                area, category,
                outsourced_sales_revenue: numOrEmpty(dayEntry.outsourced_sales_revenue),
                acquisition_count: numOrEmpty(dayEntry.acquisition_count),
                ad_cost: numOrEmpty(dayEntry.ad_cost),
                dirty: false,
                saveStatus: "idle",
                hasExistingEntry: true,
              });
            } else {
              next.set(ck, emptyCell(area, category));
            }
            return next;
          });
        } catch (e) {
          // 個別セル fetch 失敗は無視 (UI 上は空欄表示、後で再 fetch 可能)
          console.error(`[c92-1] cell load failed for ${area}/${category}:`, e);
        }
      }));
      if (!cancelled) setLoading(false);
    }
    loadAll();
    return () => { cancelled = true; };
  }, [year, month, day]);

  // 1 セルの 1 フィールド更新 (ユーザー入力 → state 反映、dirty=true)
  const updateCell = useCallback((
    area: string, category: BusinessCategory,
    field: "outsourced_sales_revenue" | "acquisition_count" | "ad_cost",
    raw: string,
  ) => {
    setCells((prev) => {
      const next = new Map(prev);
      const ck = cellKey(area, category);
      const current = next.get(ck) ?? emptyCell(area, category);
      const value: number | "" = raw === "" ? "" : (Number(raw) || 0);
      next.set(ck, {
        ...current,
        [field]: value,
        dirty: true,
        saveStatus: "idle",
        errorMsg: undefined,
      });
      return next;
    });
  }, []);

  // 一括保存: dirty セルのみ、3 並列で POST /api/entries
  const triggerBulkSave = useCallback(async () => {
    const target = dateStr(year, month, day);
    const dirtyCells: CellState[] = [];
    cells.forEach((c) => { if (c.dirty) dirtyCells.push(c); });
    if (dirtyCells.length === 0) return;

    setSaving(true);
    // 全 dirty セルを saving 状態に
    setCells((prev) => {
      const next = new Map(prev);
      for (const c of dirtyCells) {
        const ck = cellKey(c.area, c.category);
        next.set(ck, { ...c, saveStatus: "saving", errorMsg: undefined });
      }
      return next;
    });

    await withConcurrency(dirtyCells, 3, async (c) => {
      const entry: DailyEntry = {
        date: target,
        // 旧 DailyEntry 必須 (互換性)
        totalCount: 0, constructionCount: 0,
        selfRevenue: 0, selfProfit: 0, selfCount: 0,
        newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
        addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
        // c92-1 inline 4 fields のうち入力 3 つを格納
        // internal_staff_revenue は c92-1 では常に 0 (Q2=a 仕様)
        outsourced_sales_revenue: typeof c.outsourced_sales_revenue === "number" ? c.outsourced_sales_revenue : 0,
        internal_staff_revenue: 0,
        acquisition_count: typeof c.acquisition_count === "number" ? c.acquisition_count : 0,
        ad_cost: typeof c.ad_cost === "number" ? c.ad_cost : 0,
      };
      try {
        const res = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ areaId: c.area, entry, category: c.category }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error ?? `HTTP ${res.status}`);
        }
        setCells((prev) => {
          const next = new Map(prev);
          const ck = cellKey(c.area, c.category);
          const cur = next.get(ck);
          if (cur) next.set(ck, {
            ...cur, dirty: false, saveStatus: "saved",
            hasExistingEntry: true, errorMsg: undefined,
          });
          return next;
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setCells((prev) => {
          const next = new Map(prev);
          const ck = cellKey(c.area, c.category);
          const cur = next.get(ck);
          if (cur) next.set(ck, { ...cur, saveStatus: "error", errorMsg: msg });
          return next;
        });
      }
    });

    setSaving(false);
  }, [year, month, day, cells]);

  // 1 セルの再試行 (失敗セルの retry button 用)
  const retryCell = useCallback(async (area: string, category: BusinessCategory) => {
    const ck = cellKey(area, category);
    const cell = cells.get(ck);
    if (!cell) return;
    // dirty 化して triggerBulkSave に乗せる ... の簡易版として直接 POST
    const target = dateStr(year, month, day);
    setCells((prev) => {
      const next = new Map(prev);
      const cur = next.get(ck);
      if (cur) next.set(ck, { ...cur, saveStatus: "saving", errorMsg: undefined });
      return next;
    });
    const entry: DailyEntry = {
      date: target,
      totalCount: 0, constructionCount: 0,
      selfRevenue: 0, selfProfit: 0, selfCount: 0,
      newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
      addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
      outsourced_sales_revenue: typeof cell.outsourced_sales_revenue === "number" ? cell.outsourced_sales_revenue : 0,
      internal_staff_revenue: 0,
      acquisition_count: typeof cell.acquisition_count === "number" ? cell.acquisition_count : 0,
      ad_cost: typeof cell.ad_cost === "number" ? cell.ad_cost : 0,
    };
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaId: area, entry, category }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setCells((prev) => {
        const next = new Map(prev);
        const cur = next.get(ck);
        if (cur) next.set(ck, {
          ...cur, dirty: false, saveStatus: "saved",
          hasExistingEntry: true, errorMsg: undefined,
        });
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCells((prev) => {
        const next = new Map(prev);
        const cur = next.get(ck);
        if (cur) next.set(ck, { ...cur, saveStatus: "error", errorMsg: msg });
        return next;
      });
    }
  }, [year, month, day, cells]);

  // 進捗集計 (画面上部の進捗バッジ用)
  const progress = (() => {
    let saved = 0, dirty = 0, error = 0, total = 0;
    cells.forEach((c) => {
      total++;
      if (c.saveStatus === "error") error++;
      else if (c.dirty) dirty++;
      else if (c.hasExistingEntry || c.saveStatus === "saved") saved++;
    });
    return { saved, dirty, error, total };
  })();

  return { cells, loading, saving, progress, updateCell, triggerBulkSave, retryCell };
}

function numOrEmpty(v: unknown): number | "" {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : "";
}
