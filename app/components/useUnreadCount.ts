"use client";
// PR c97-2: 未読バッジ count fetch hook。
//
// NavBar / MobileHeader の「日報」label に表示する赤丸バッジの数字 (= 未読拠点数) を取得。
//
// 設計:
//   - mount 時 + 5 分間隔タイマーで /api/unread-count を fetch
//   - try-catch でロバスト化、エラー時は count=0 (= バッジ非表示) + console.warn のみ
//     (反さん指示「ページ本体を絶対に落とさない」、c96-2 教訓)
//   - 401 (未ログイン / cookie expire) も catch → count=0
//   - 既存 fetch パターン (credentials デフォルト = same-origin) 踏襲、AUTH_COOKIE 自動送信
//   - refetch 関数を return して、外部 (= /daily-report の自動既読化後) から即時更新可能

import { useEffect, useState, useCallback, useRef } from "react";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 分間隔 (反さん指示、Step 2 で確定)

export type UnreadBreakdown = {
  area_id: string;
  business_category: string;
};

export type UnreadCountState = {
  count: number;
  breakdown: UnreadBreakdown[];
  /** 外部から強制再 fetch (例: mark-read 成功後の即時バッジ更新) */
  refetch: () => void;
};

export function useUnreadCount(enabled: boolean = true): UnreadCountState {
  const [count, setCount] = useState(0);
  const [breakdown, setBreakdown] = useState<UnreadBreakdown[]>([]);
  const fetchOnceRef = useRef<() => void>(() => {});

  const doFetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/unread-count");
      if (!res.ok) {
        // 401 / 500 等は静かに無視、バッジ非表示にする (= count=0)
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[useUnreadCount] /api/unread-count returned ${res.status}, hiding badge`);
        }
        setCount(0);
        setBreakdown([]);
        return;
      }
      const data = (await res.json()) as { count?: number; breakdown?: UnreadBreakdown[] };
      const c = typeof data.count === "number" ? data.count : 0;
      const b = Array.isArray(data.breakdown) ? data.breakdown : [];
      setCount(c);
      setBreakdown(b);
    } catch (e) {
      // network error / abort 等も静かに無視
      if (process.env.NODE_ENV !== "production") {
        console.warn("[useUnreadCount] fetch failed, hiding badge:", e);
      }
      setCount(0);
      setBreakdown([]);
    }
  }, [enabled]);

  // mount 時 + 5 分間隔タイマー
  useEffect(() => {
    fetchOnceRef.current = () => { void doFetch(); };
    if (!enabled) {
      setCount(0);
      setBreakdown([]);
      return;
    }
    void doFetch();
    const id = setInterval(() => { void doFetch(); }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, doFetch]);

  const refetch = useCallback(() => { fetchOnceRef.current(); }, []);

  return { count, breakdown, refetch };
}
