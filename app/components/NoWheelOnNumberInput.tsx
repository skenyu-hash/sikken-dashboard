"use client";
// PR: 経営数字の誤改変防止 — focus 中の input[type=number] でマウスホイール操作による
// 値の増減を無効化する DOM-wide ハンドラ。
//
// 背景: input[type=number] にマウスフォーカス中、ホイールスクロールで値が ±1 ずつ
// 増減してしまう。経営数字 (売上・粗利・コスト等) で意図せず値が変わるのを物理的に
// 防ぐ (反さん依頼、2026-06-02)。CSS のスピナー非表示 (globals.css) と対をなす対応。
//
// 設計:
//   - document に passive: false の wheel listener を 1 個だけ追加 (10+ input 個別 onWheel 不要)
//   - active element が input[type=number] のときのみ preventDefault → ページスクロール
//     を阻害しない
//   - mount/unmount で addEventListener/removeEventListener、メモリリークなし
//   - 計算ロジック・state は一切触らない、ホイール挙動のみ

import { useEffect } from "react";

export default function NoWheelOnNumberInput(): null {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = (e: WheelEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        active.type === "number" &&
        e.target === active
      ) {
        e.preventDefault();
        // focus は維持 (blur しない、ユーザーの入力体験を切断しない)
      }
    };
    // passive: false で preventDefault を有効化
    document.addEventListener("wheel", handler, { passive: false });
    return () => document.removeEventListener("wheel", handler);
  }, []);
  return null;
}
