"use client";
// PR c95-A-3: 日報モーダル (DailyReportModal)。モック docs/mocks/daily_report_kansai_0530.html 準拠。
//
// PR c95-C-1: 純リファクタで本ファイルを overlay + container shell に縮小 (379 → ~55 行)。
//   中身 (ヘッダー / KPI 帯 / 業態 Section / HELP / アクション 4 種 + 派生計算 + データ fetch) は
//   `<DailyReportContent>` および `useDailyReportData` hook に抽出済。
//   Props は不変 (date / areaId / category / staffLabel / onClose) で EntryForm 側無修正。
//
// 設計原則 (c95-C-1):
//   - **見た目・挙動を 1 ピクセルも変えない** (反さん条件)。
//   - **撮影範囲完全保持**: containerRef は本 Modal の `<div style={containerStyle}>` に
//     bind したまま、`<DailyReportContent captureRef={containerRef}>` で props 経由で渡す。
//     これにより onSaveImage が toPng で撮影する DOM 範囲はリファクタ前と完全同一
//     (container shell = boxShadow + 白背景 + borderRadius 含む)。
//
// 引数: (date, areaId, category) → 月単位の /api/entries + /api/monthly-summary を fetch。
//   ◀▶ 日付ナビ / カレンダーで date 変更時に再描画 (月境界跨ぎは entries 再 fetch)。

import { useEffect, useRef, useState } from "react";
import type { BusinessCategory } from "../../lib/businesses";
import DailyReportContent from "./dailyReport/DailyReportContent";

type Props = {
  /** 表示対象日 (YYYY-MM-DD) */
  date: string;
  areaId: string;
  category: BusinessCategory;
  /** 担当者ラベル (ヘッダーバッジ用、省略時は「担当 -」) */
  staffLabel?: string;
  onClose: () => void;
};

export default function DailyReportModal({ date, areaId, category, staffLabel, onClose }: Props) {
  // date state 管理 (外部 date prop の変化でも追従、内部ナビでも変わる)
  const [internalDate, setInternalDate] = useState(date);
  useEffect(() => { setInternalDate(date); }, [date]);

  // 撮影 ref: Modal の container shell に bind。Content へ props 渡しで onSaveImage が利用。
  // これにより撮影範囲はリファクタ前と完全同一 (boxShadow + 白背景 + borderRadius 含む)。
  const containerRef = useRef<HTMLDivElement>(null);

  // モック準拠スタイル (抽出元: DailyReportModal c95-A-3 L179-190、値完全同一)
  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    overflowY: "auto", padding: 24,
  };
  const containerStyle: React.CSSProperties = {
    background: "#f3f6f4", color: "#1c2b25",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif',
    WebkitFontSmoothing: "antialiased",
    width: "100%", maxWidth: 1100, borderRadius: 12, overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={containerStyle} ref={containerRef}>
        <DailyReportContent
          date={internalDate}
          areaId={areaId}
          category={category}
          staffLabel={staffLabel}
          onDateChange={setInternalDate}
          onClose={onClose}
          captureRef={containerRef}
        />
      </div>
    </div>
  );
}
