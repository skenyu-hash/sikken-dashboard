"use client";
// PR #49a: /targets ページの areaTargets state + 読み書き責務を集約したフック。
//
// 背景:
//   PR #49a までは TargetsMatrix 内部に areaTargets / 読込 / debounced save /
//   flashCells を全て抱えていた。Phase 1 で 1 マトリクスを 3 セクションに分割
//   する場合、各セクションが独立した state を持つと:
//     - 同じ DB 行を 3 回 fetch する (無駄)
//     - セクション A で売上を更新中に、セクション B が「古い売上値」で保存
//       → 上書き競合 (race condition)
//   が発生する。
//
// 解決策:
//   page.tsx が本フックを 1 回だけ呼び、shared state (areaTargets / setCell /
//   flashCells / loading) を各 TargetsMatrix セクションに props で渡す。
//   セクションは presentational に専念し、保存は本フック経由で一元化される。
//
// 注意:
//   - 「前月コピー」「全エリア同値設定」など page.tsx 側の一括 POST は本フックを
//     経由しないため、要画面リロード (既存挙動を維持、Phase 2 で改善検討)。
//   - useDebouncedCallback は 500ms。連打時は最後の値のみ保存される。

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyTargets, type Targets } from "../../lib/calculations";
import { useDebouncedCallback, useSaveStatus, type SaveStatus } from "./useDebounceSave";

export type AreaTargets = Record<string, Targets>;

type Area = { id: string; name: string };

type Options = {
  areas: Area[];
  category: string;
  year: number;
  month: number;
  onSaveStatusChange?: (status: SaveStatus, flash: boolean) => void;
};

type Result = {
  /** key=areaId, value=Targets */
  areaTargets: AreaTargets;
  /** 1 セルの値を更新 (debounced save 起動) */
  setCell: (areaId: string, key: keyof Targets, raw: string) => void;
  /** 初回ロード中 */
  loading: boolean;
  /** 保存成功直後にハイライト対象のセルキー (`${areaId}::__row__`) */
  flashCells: Set<string>;
  /** 保存ステータス (page.tsx 側で表示) */
  status: SaveStatus;
  flash: boolean;
};

export function useTargetsState({ areas, category, year, month, onSaveStatusChange }: Options): Result {
  const [areaTargets, setAreaTargets] = useState<AreaTargets>({});
  const [loading, setLoading] = useState(true);
  const [flashCells, setFlashCells] = useState<Set<string>>(new Set());
  const { status, flash, markSaving, markSaved, markError } = useSaveStatus();

  // PR c88: callback ref で onSaveStatusChange の identity を effect 依存配列から
  //   分離。page.tsx 側で useCallback による安定化済だが、将来安定化が壊された場合の
  //   defensive (c6.2 markClean + [enabled] と同じ belt+suspenders 設計)。
  //   render 毎に最新 callback を ref に格納し、effect は ref 経由で呼び出す。
  const onSaveStatusChangeRef = useRef(onSaveStatusChange);
  onSaveStatusChangeRef.current = onSaveStatusChange;

  // PR c76e: 初回 fetch 中は status="loading" を broadcast し badge "読み込み中..." 表示。
  //   loading 完了後は通常の save status (idle/saving/saved/error) に切替。
  //   loading 状態への stuck を防ぐため依存配列に loading を含める。
  // PR c88: 依存配列から onSaveStatusChange を除外 (ref 経由で参照)。これにより
  //   callback identity 変動による re-render → fetch loop の連鎖を完全に遮断。
  useEffect(() => {
    if (loading) {
      onSaveStatusChangeRef.current?.("loading", false);
    } else {
      onSaveStatusChangeRef.current?.(status, flash);
    }
  }, [loading, status, flash]);

  // 全エリアの targets を並列取得
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      areas.map(async (a) => {
        const res = await fetch(
          `/api/targets?area=${a.id}&year=${year}&month=${month}&category=${category}`
        );
        const j = res.ok ? await res.json() : { targets: emptyTargets() };
        return [a.id, { ...emptyTargets(), ...(j.targets ?? {}) }] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const map: AreaTargets = {};
      for (const [id, t] of entries) map[id] = t;
      setAreaTargets(map);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [areas, category, year, month]);

  const debouncedSave = useDebouncedCallback(async (areaId: string, t: Targets) => {
    markSaving();
    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ areaId, year, month, targets: t, category }),
      });
      if (!res.ok) {
        markError();
        return;
      }
      markSaved();
      const cellKey = `${areaId}::__row__`;
      setFlashCells((prev) => {
        const next = new Set(prev);
        next.add(cellKey);
        return next;
      });
      setTimeout(() => {
        setFlashCells((prev) => {
          const next = new Set(prev);
          next.delete(cellKey);
          return next;
        });
      }, 800);
    } catch {
      markError();
    }
  }, 500);

  const setCell = useCallback(
    (areaId: string, key: keyof Targets, raw: string) => {
      const num = raw === "" ? 0 : parseFloat(raw) || 0;
      setAreaTargets((prev) => {
        const next = { ...prev, [areaId]: { ...(prev[areaId] ?? emptyTargets()), [key]: num } };
        debouncedSave(areaId, next[areaId]);
        return next;
      });
    },
    [debouncedSave]
  );

  return { areaTargets, setCell, loading, flashCells, status, flash };
}
