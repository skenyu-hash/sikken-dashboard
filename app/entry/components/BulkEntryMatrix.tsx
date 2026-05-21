"use client";
// PR c92-1: 14 セル (area × business) を 1 画面に grid 配置する bulk daily-diff 入力 UI。
//
// レイアウト (Q5=a 準拠の業態別行):
//   水道: [関西] [関東] [名古屋] [九州] [北関東] [北海道] [中国] [静岡]  (8 cells)
//   電気: [関西] [関東]                                                     (2 cells)
//   鍵:   [関西]                                                             (1 cell)
//   ロード: [関西]                                                           (1 cell)
//   探偵: [関西] [名古屋]                                                    (2 cells)
//
//   各業態行は business → areas のリスト構造。空エリアは表示しない (sparse でなく compact)。
//
// 主要 UX:
//   - ヘッダ: 日付セレクタ (1 つだけ、matrix 全体に適用、Q4=a)
//   - 進捗バッジ: "X/14 完了 / Y 未保存 / Z 失敗" を画面上部に表示
//   - 一括保存ボタン: dirty セルのみ 3 並列で POST (Q6=a)
//   - 失敗セルは各セル内に retry ボタン (c92-1 で実装)
//   - mobile: grid-template-columns を狭くして自動 wrap
//
// auto-save は OFF (c89-p1 維持)。inline 編集で state 更新するが POST は触発しない。

import { useState } from "react";
import EntryCell from "./EntryCell";
import { useBulkEntryState, ALL_CELLS } from "../lib/useBulkEntryState";
import { BUSINESSES, type BusinessCategory } from "../../lib/businesses";

type Props = {
  initialYear: number;
  initialMonth: number;
  initialDay: number;
};

const categoryLabels: Record<BusinessCategory, string> = {
  water: "水道", electric: "電気", locksmith: "鍵", road: "ロード", detective: "探偵",
};

const areaNames: Record<string, string> = {
  kansai: "関西", kanto: "関東", nagoya: "名古屋", kyushu: "九州",
  kitakanto: "北関東", hokkaido: "北海道", chugoku: "中国", shizuoka: "静岡",
};

export default function BulkEntryMatrix({ initialYear, initialMonth, initialDay }: Props) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [day, setDay] = useState(initialDay);

  const {
    cells, loading, saving, progress,
    updateCell, triggerBulkSave, retryCell,
  } = useBulkEntryState({ year, month, day });

  // 日付変更ハンドラ — 月またぎで year/month も更新
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value; // "YYYY-MM-DD"
    const parts = v.split("-");
    if (parts.length === 3) {
      setYear(Number(parts[0]));
      setMonth(Number(parts[1]));
      setDay(Number(parts[2]));
    }
  };

  const dateValue = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div style={{
      minHeight: "100vh", background: "#f2f5f2",
      paddingBottom: 100,
    }}>
      {/* ====== ヘッダ: 緑グラデ ====== */}
      <div style={{
        background: "linear-gradient(135deg, #059669, #047857)",
        padding: "16px 24px",
      }}>
        <div style={{
          maxWidth: 1400, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap",
        }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>
              月次データ入力 (一括)
            </h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 4, lineHeight: 1.5 }}>
              日次差分を入力。月初〜選択日の累積はダッシュボードで自動計算 (c90 aggregation)。
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)" }}>対象日</span>
              <input
                type="date"
                value={dateValue}
                onChange={handleDateChange}
                style={{
                  padding: "6px 10px", fontSize: 13,
                  border: "1px solid rgba(255,255,255,0.4)",
                  borderRadius: 6, background: "rgba(255,255,255,0.95)",
                  color: "#111", fontVariantNumeric: "tabular-nums",
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* ====== 進捗バッジ + 一括保存ボタン ====== */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "10px 24px",
      }}>
        <div style={{
          maxWidth: 1400, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap",
        }}>
          <ProgressBadges progress={progress} loading={loading} />
          <BulkSaveButton
            saving={saving}
            dirty={progress.dirty}
            error={progress.error}
            onClick={() => { void triggerBulkSave(); }}
          />
        </div>
      </div>

      {/* ====== マトリクス本体: 業態別行 ====== */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {BUSINESSES.map((biz) => (
            <BusinessRow
              key={biz.id}
              biz={biz}
              cells={cells}
              onChange={updateCell}
              onRetry={retryCell}
            />
          ))}
        </div>
      </div>

      {/* c92-2 placeholder: 詳細展開 / 前日コピー 等は c92-3 で */}
    </div>
  );
}

// ======== 進捗バッジ ========

function ProgressBadges({
  progress,
  loading,
}: {
  progress: { saved: number; dirty: number; error: number; total: number };
  loading: boolean;
}) {
  if (loading) {
    return (
      <span style={{ fontSize: 12, color: "#6b7280" }}>
        📡 {progress.total} セルを読み込み中...
      </span>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
      <Badge label={`${progress.saved}/${progress.total} 完了`} bg="#d1fae5" color="#065f46" />
      {progress.dirty > 0 && (
        <Badge label={`${progress.dirty} 未保存`} bg="#fef9c3" color="#854d0e" />
      )}
      {progress.error > 0 && (
        <Badge label={`${progress.error} 失敗`} bg="#fee2e2" color="#991b1b" />
      )}
    </div>
  );
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 4,
      background: bg, color, fontSize: 11, fontWeight: 700,
    }}>{label}</span>
  );
}

// ======== 一括保存ボタン ========

function BulkSaveButton({ saving, dirty, error, onClick }: {
  saving: boolean; dirty: number; error: number; onClick: () => void;
}) {
  const hasWork = dirty > 0 || error > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || !hasWork}
      style={{
        padding: "8px 18px", fontSize: 12, fontWeight: 700,
        border: "none", borderRadius: 6, cursor: saving || !hasWork ? "default" : "pointer",
        background: hasWork && !saving ? "#059669" : "#d1d5db",
        color: hasWork && !saving ? "#fff" : "#6b7280",
        whiteSpace: "nowrap",
      }}
    >
      {saving ? "保存中..." : hasWork ? `全変更を一括保存 (${dirty + error}件)` : "変更なし"}
    </button>
  );
}

// ======== 業態行 ========

function BusinessRow({
  biz, cells, onChange, onRetry,
}: {
  biz: typeof BUSINESSES[number];
  cells: ReturnType<typeof useBulkEntryState>["cells"];
  onChange: ReturnType<typeof useBulkEntryState>["updateCell"];
  onRetry: ReturnType<typeof useBulkEntryState>["retryCell"];
}) {
  const cellsInRow = ALL_CELLS.filter((c) => c.category === biz.id);
  return (
    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 8,
        padding: "8px 14px", background: "#ecfdf5",
        borderBottom: "1px solid #d1fae5",
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "#065f46", margin: 0 }}>
          {categoryLabels[biz.id]}
        </h2>
        <span style={{ fontSize: 10, color: "#6b7280" }}>
          {biz.areas.length} エリア
        </span>
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 10, padding: 12,
      }}>
        {cellsInRow.map((c) => {
          const cell = cells.get(`${c.area}::${c.category}`);
          if (!cell) return null;
          return (
            <EntryCell
              key={`${c.area}-${c.category}`}
              cell={cell}
              areaName={areaNames[c.area] ?? c.area}
              categoryLabel={categoryLabels[c.category]}
              onChange={(field, raw) => onChange(c.area, c.category, field, raw)}
              onRetry={cell.saveStatus === "error" ? () => { void onRetry(c.area, c.category); } : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
