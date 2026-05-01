"use client";
// debounce 付き保存フック。
// 用途: /targets のインライン編集セル群で、ユーザーが入力するたびに
// 即 API を叩くのを防ぎ、500ms の静止後にまとめて保存する。
//
// 設計:
// - useDebouncedCallback: 呼び出しを debounce する汎用フック
// - useSaveStatus: 保存状態 (idle / saving / saved / error) と
//   緑フラッシュトリガを管理する状態フック
//
// 注意: React の strict mode では effect が二重実行されることがあるため、
// timer ref で重複起動を防ぐ。

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * debounced callback。最後の呼び出しから delay ms 経過後に fn を1回だけ実行。
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void | Promise<void>,
  delay = 500
): (...args: A) => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Promise.resolve(fnRef.current(...args));
      }, delay);
    },
    [delay]
  );
}

/**
 * 保存状態の管理。"saving" → "saved" → 緑フラッシュ → "idle" の遷移。
 * - markSaving(): 保存開始 ("saving")
 * - markSaved(): 保存成功 ("saved" + 緑フラッシュ 800ms → "idle")
 * - markError(): エラー ("error", 自動 reset なし)
 */
export function useSaveStatus(): {
  status: SaveStatus;
  flash: boolean;
  markSaving: () => void;
  markSaved: () => void;
  markError: () => void;
} {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const markSaving = useCallback(() => setStatus("saving"), []);
  const markSaved = useCallback(() => {
    setStatus("saved");
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      setFlash(false);
      setStatus("idle");
    }, 800);
  }, []);
  const markError = useCallback(() => setStatus("error"), []);

  return { status, flash, markSaving, markSaved, markError };
}
