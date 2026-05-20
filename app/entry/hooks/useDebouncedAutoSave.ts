"use client";
// PR c6: state 変更検知 → 500ms debounce → 自動保存
//
// 既存 handleSave (POST /api/import-monthly + GET /api/monthly-summary) を
// そのまま呼び出す形にして、auto-save と「確定送信」ボタンは同じ実体を共有。
//   - 確定送信ボタン (Q2=A): UI rename + 視覚 feedback のみ、機能変更なし
//   - 自動保存: state.dirty が true の間、500ms debounce で saveFn を発火
//
// status state machine:
//   - "idle"    : 初期 / 直近の save 完了から数秒経過
//   - "loading" : enabled=false (fetch 中) → カレンダー操作も skip
//   - "saving"  : debounce 発火後、saveFn 実行中
//   - "saved"   : saveFn 成功直後 (一定時間後に idle に戻す)
//   - "error"   : saveFn 失敗
//
// 使い方:
//   const { status, triggerSave } = useDebouncedAutoSave({ state, enabled, saveFn });
//   - state 変更ごとに自動的に debounce → saveFn
//   - triggerSave() で即時保存 (確定送信ボタンが利用、debounce 待たず flush)

import { useEffect, useRef, useState, useCallback } from "react";

export type AutoSaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

type Options<T> = {
  /** 監視する state (変更時に debounce → saveFn) */
  state: T;
  /** auto-save 許可フラグ (fetch 中などは false → skip) */
  enabled: boolean;
  /** 実際の保存処理。成功なら true、失敗なら false を resolve */
  saveFn: () => Promise<boolean>;
  /** debounce ms (default 500) */
  debounceMs?: number;
  /** "saved" 表示時間 ms (default 2500) */
  savedDisplayMs?: number;
};

export function useDebouncedAutoSave<T>({
  state, enabled, saveFn,
  debounceMs = 500, savedDisplayMs = 2500,
}: Options<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const isInitialMount = useRef(true);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const savedTimer = useRef<NodeJS.Timeout | null>(null);

  // enabled=false (= 読み込み中) は indicator も loading 表示
  useEffect(() => {
    if (!enabled) {
      setStatus("loading");
    } else if (status === "loading") {
      setStatus("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // state 変更検知 → debounce → saveFn
  useEffect(() => {
    // 初回 mount 時は何もしない (初期化フラッシュ防止)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!enabled) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        const ok = await saveFn();
        setStatus(ok ? "saved" : "error");
        if (ok) {
          if (savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setStatus("idle"), savedDisplayMs);
        }
      } catch {
        setStatus("error");
      }
    }, debounceMs);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // saveFn は不変参照を期待 (useCallback で wrap して渡す)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, enabled, debounceMs, savedDisplayMs]);

  // 即時保存 (確定送信ボタン用、debounce 待たず flush)
  const triggerSave = useCallback(async () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setStatus("saving");
    try {
      const ok = await saveFn();
      setStatus(ok ? "saved" : "error");
      if (ok) {
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setStatus("idle"), savedDisplayMs);
      }
      return ok;
    } catch {
      setStatus("error");
      return false;
    }
  }, [saveFn, savedDisplayMs]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  return { status, triggerSave };
}
