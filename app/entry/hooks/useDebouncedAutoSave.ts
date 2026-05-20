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
//   - "error"   : saveFn 失敗 (API エラーのみ、validation 失敗は "skip" 扱い)
//
// 使い方:
//   const { status, triggerSave, markClean } = useDebouncedAutoSave({ state, enabled, saveFn });
//   - state 変更ごとに自動的に debounce → saveFn
//   - triggerSave() で即時保存 (確定送信ボタンが利用、debounce 待たず flush)
//   - markClean(nextState) で baseline を明示捕捉 (fetch 内 setState 内で使う)
//
// PR c6.1 hotfix: baseline 機構 (fetch ロードでの誤発火防止)
//   旧実装は state 変更だけで debounce → save する設計で、fetch でロードされた
//   state 変更も「ユーザー入力」として扱い save が発火していた (POST 不要発火 +
//   DB invalid 値で初期 badge "保存失敗" 表示の bug)。
//
//   修正方針:
//     1. baselineRef = mount 時 state で初期化、fetch 完了 (enabled false→true)
//        と save 成功時に最新 state にリセット
//     2. state effect: shallowEqual(state, baseline) なら skip (fetch 由来の
//        変更は baseline と一致するため発火しない)
//     3. user 入力で state が baseline から逸脱した時のみ debounce → save
//
//   shallowEqual は EntryFormState のフラット構造 (number | string) に最適化
//   した自作版を使用 (lodash 等の外部 deps 追加なし)。
//
// PR c6.2 hotfix: c6.1 で残った 2 つの問題を修正
//   Problem A: 初期 mount で POST が 2 回発火する (根本原因は仮説ベース、複数要因
//     候補あり: useRef 初期捕捉のズレ / effect 順 race / 月遷移など)。
//     → markClean(nextState) callback を新設し、fetchExisting 内の setState
//       updater で baseline を同期的に捕捉する belt+suspenders 方式。
//   Problem B: validation 失敗で "保存失敗" badge が表示される。
//     → saveFn 戻り値を boolean から SaveOutcome 文字列 union に変更。
//       "success" → status="saved"、"error" → status="error"、"skip" → status は idle に戻す
//       (validation 失敗は API エラーと区別)。

import { useEffect, useRef, useState, useCallback } from "react";

export type AutoSaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

/** PR c6.2: saveFn の戻り値型。 boolean overload を解消し validation skip と
 *  API error を明示的に区別する。 */
export type SaveOutcome = "success" | "skip" | "error";

type Options<T> = {
  /** 監視する state (変更時に debounce → saveFn) */
  state: T;
  /** auto-save 許可フラグ (fetch 中などは false → skip) */
  enabled: boolean;
  /** 実際の保存処理。
   *  - "success": 保存成功
   *  - "skip"   : validation 失敗等で save 試行をスキップ (badge は変えない)
   *  - "error"  : API エラー等で save 試行は実行されたが失敗 (badge → "保存失敗")
   */
  saveFn: () => Promise<SaveOutcome>;
  /** debounce ms (default 500) */
  debounceMs?: number;
  /** "saved" 表示時間 ms (default 2500) */
  savedDisplayMs?: number;
};

// PR c6.1: フラットオブジェクト用の shallow 比較。
//   EntryFormState は number | string のプリミティブのみのフラット構造のため
//   shallow で必要十分。null/undefined / 異なる型 (string vs number) も
//   厳密等価 === で判定。
function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  const ak = Object.keys(a as Record<string, unknown>);
  const bk = Object.keys(b as Record<string, unknown>);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) {
      return false;
    }
  }
  return true;
}

export function useDebouncedAutoSave<T>({
  state, enabled, saveFn,
  debounceMs = 500, savedDisplayMs = 2500,
}: Options<T>) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");

  // PR c6.1: baseline = 直近の "saved or loaded" 時の state。
  //   state !== baseline の時のみ debounce → save 発火 (= ユーザー入力検知)
  //   mount 時は state を baseline に
  const baselineRef = useRef<T>(state);

  // PR c6.1: render 毎の最新 state を ref で保持 (effect 内で参照するため)
  const stateRef = useRef(state);
  stateRef.current = state;

  // PR c6.1: enabled の前回値を保持。false→true 遷移 (= fetch 完了) で baseline 更新
  const prevEnabledRef = useRef(enabled);

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

  // PR c6.1: enabled 遷移 false→true (= fetch 完了) で baseline を最新 state にリセット
  //   *この effect は state effect より上に宣言* し、同一 commit 内で先に実行される
  //   ことで、fetch 完了で更新された state を新しい baseline として捕捉してから
  //   下の state effect が shallowEqual 比較を行う。
  useEffect(() => {
    if (!prevEnabledRef.current && enabled) {
      baselineRef.current = stateRef.current; // fetch 完了直後の state を baseline に
    }
    prevEnabledRef.current = enabled;
  }, [enabled]);

  // PR c6.1: state 変更検知 → baseline 比較 → debounce → saveFn
  //   shallowEqual(state, baseline) なら fetch 由来の変更とみなして skip
  useEffect(() => {
    if (!enabled) return;
    if (shallowEqual(state, baselineRef.current)) return; // 差分なし = fetch 由来 → skip

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setStatus("saving");
      try {
        const result = await saveFn();
        if (result === "success") {
          // PR c6.1: save 成功で baseline 更新 (次回入力で再発火可能に)
          baselineRef.current = stateRef.current;
          setStatus("saved");
          if (savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setStatus("idle"), savedDisplayMs);
        } else if (result === "error") {
          setStatus("error");
        } else {
          // PR c6.2: "skip" (validation 失敗等) は status を idle に戻すだけ
          setStatus("idle");
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
  const triggerSave = useCallback(async (): Promise<SaveOutcome> => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setStatus("saving");
    try {
      const result = await saveFn();
      if (result === "success") {
        // PR c6.1: 確定送信成功でも baseline 更新
        baselineRef.current = stateRef.current;
        setStatus("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setStatus("idle"), savedDisplayMs);
      } else if (result === "error") {
        setStatus("error");
      } else {
        setStatus("idle");
      }
      return result;
    } catch {
      setStatus("error");
      return "error";
    }
  }, [saveFn, savedDisplayMs]);

  // PR c6.2: 外部から baseline を明示的に捕捉する callback。
  //   主に fetchExisting 内の setState updater で使用し、fetch ロード直後の state を
  //   baseline と同期させて誤発火を防ぐ (belt+suspenders、[enabled] toggle と併用)。
  //   idempotent — 同じ state で何度呼んでも安全 (StrictMode 含む)。
  const markClean = useCallback((cleanState: T) => {
    baselineRef.current = cleanState;
  }, []);

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  return { status, triggerSave, markClean };
}
