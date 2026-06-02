"use client";
// PR: 経営数字の誤改変防止 — focus 中の input[type=number] で意図しない値変更を全面阻止。
//
// 阻止対象 (反さん依頼、2026-06-02):
//   1. マウスホイール: 1 段刻みで値が ±1 増減
//   2. キーボード ArrowUp / ArrowDown: 1 段刻みで値が ±1 増減 (Shift+矢印は 10 刻み)
//   3. PageUp / PageDown: (一部ブラウザで) ±10 増減
//   → これらを全て preventDefault、入力は直接タイプのみ
//
// CSS スピナー非表示 (globals.css) と対をなす完全防御:
//   CSS  = 上下矢印クリック UI を非表示 (= マウスクリック封鎖)
//   本 component = マウスホイール + キーボード矢印キー封鎖 (= JS 操作封鎖)
//
// 設計:
//   - document に listener 2 個追加 (wheel + keydown)
//   - active element が input[type=number] かつ target も同一のときのみ preventDefault
//   - focus 維持 (blur しない、ユーザー入力体験を切断しない)
//   - ページスクロール / キーボードナビゲーション (Tab 等) は阻害しない
//   - 計算ロジック・state は一切触らない
//
// なぜ ArrowLeft / ArrowRight は阻止しないか:
//   input[type=number] でカーソル移動 (左右矢印) は値変更しない、入力 UX 必須機能のため。
//   Tab / Shift+Tab も同様にナビ機能、阻止しない。

import { useEffect } from "react";

export default function NoWheelOnNumberInput(): null {
  useEffect(() => {
    if (typeof document === "undefined") return;

    // (1) マウスホイールで値が ±1 増減するのを阻止
    const onWheel = (e: WheelEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        active.type === "number" &&
        e.target === active
      ) {
        e.preventDefault();
        // focus は維持 (blur しない)
      }
    };

    // (2) キーボード ArrowUp / ArrowDown / PageUp / PageDown で値が増減するのを阻止
    //   focus 中の input[type=number] でのみ反応、それ以外の input / ページナビには影響なし
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        active.type === "number" &&
        e.target === active &&
        (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "PageUp" || e.key === "PageDown")
      ) {
        e.preventDefault();
        // focus は維持、ArrowLeft/ArrowRight (カーソル移動)/Tab は阻止しない
      }
    };

    // passive: false で preventDefault を有効化
    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return null;
}
