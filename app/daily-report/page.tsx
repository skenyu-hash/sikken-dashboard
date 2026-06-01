"use client";
// PR c95-C-2: 日報の独立ページ。
//
// 目的: c95-C-1 で抽出した `<DailyReportContent>` を /entry モーダル経由ではなく
//   独立した URL (= リンク共有可能、ブラウザバックで戻れる、Slack 添付しやすい)
//   で表示する。Modal と並走 (cutover は C-5)、EntryForm 無修正。
//
// URL クエリ仕様:
//   ?area={kansai|kanto|...} & category={water|electric|...} & date=YYYY-MM-DD
//   未指定時のデフォルト: kansai / water / today (CC 推奨、後で改善余地)
//
// 設計:
//   - "use client" + useSearchParams (Suspense boundary 内で読む、Next.js 16 要件)
//   - date は URL クエリ追従 (state + URL を双方向同期)
//   - wrapper で boxShadow + 白背景 + borderRadius を持たせ、撮影画像が Modal と完全同一
//   - DailyReportContent.onClose は渡さない → 「× 閉じる」ボタン + アクション「閉じる」非表示
//
// ロジック層 untouch: kpiCompute / helpStats / buildDailyReportText / useDailyReportData
//   すべて c95-C-1 で確立済の hook + Content を再利用。本 PR は表示の器のみ。

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BusinessCategory } from "../lib/businesses";
import DailyReportContent from "../entry/components/dailyReport/DailyReportContent";

const VALID_CATEGORIES: BusinessCategory[] = ["water", "electric", "locksmith", "road", "detective"];
const VALID_AREAS = ["kansai", "kanto", "nagoya", "kyushu", "kitakanto", "hokkaido", "chugoku", "shizuoka"];

const todayISO = (): string => new Date().toISOString().slice(0, 10);

// Suspense boundary で useSearchParams を wrap (Next.js 16 要件)
export default function DailyReportPage() {
  return (
    <Suspense fallback={<div style={pageStyle}>読み込み中...</div>}>
      <DailyReportPageContent />
    </Suspense>
  );
}

function DailyReportPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL クエリ初期化 (未指定なら CC 推奨デフォルト)
  const urlArea = searchParams.get("area");
  const urlCategory = searchParams.get("category");
  const urlDate = searchParams.get("date");

  const areaId = (urlArea && VALID_AREAS.includes(urlArea)) ? urlArea : "kansai";
  const category: BusinessCategory = (urlCategory && VALID_CATEGORIES.includes(urlCategory as BusinessCategory))
    ? urlCategory as BusinessCategory
    : "water";
  const initialDate = (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) ? urlDate : todayISO();

  // date state 管理 (URL 追従)
  const [date, setDate] = useState(initialDate);

  // URL → state 同期 (戻る/進むボタン対応)
  useEffect(() => {
    const u = searchParams.get("date");
    if (u && /^\d{4}-\d{2}-\d{2}$/.test(u) && u !== date) {
      setDate(u);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ナビ ◀▶ / カレンダー → state + URL 両方更新 (replace で履歴汚さず)
  const handleDateChange = useCallback((newDate: string) => {
    setDate(newDate);
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", newDate);
    router.replace(`/daily-report?${params.toString()}`);
  }, [searchParams, router]);

  // 撮影 ref (boxShadow + 白背景 + borderRadius 含む wrapper を撮影)
  const captureRef = useRef<HTMLDivElement>(null);

  return (
    <div style={pageStyle}>
      <div style={wrapperStyle} ref={captureRef}>
        <DailyReportContent
          date={date}
          areaId={areaId}
          category={category}
          onDateChange={handleDateChange}
          captureRef={captureRef}
          /* onClose は渡さない → 「× 閉じる」+ アクション「閉じる」非表示 */
        />
      </div>
    </div>
  );
}

// モーダルの containerStyle と verbatim 同一 (撮影画像がモーダル版と完全同等)
// 差分は margin: "0 auto" のみ追加 (独立ページで中央寄せ用、撮影には影響しない)
const wrapperStyle: React.CSSProperties = {
  background: "#f3f6f4", color: "#1c2b25",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif',
  WebkitFontSmoothing: "antialiased",
  width: "100%", maxWidth: 1100,
  borderRadius: 12, overflow: "hidden",
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  margin: "0 auto",
};

// ページ全体の背景 (ナビと整合する trans 淡色)
const pageStyle: React.CSSProperties = {
  background: "#f2f5f2",
  minHeight: "100vh",
  padding: "24px 16px",
};
