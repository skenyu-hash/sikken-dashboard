"use client";
// PR c92-1: BulkEntryMatrix の 1 セル。
//   4 主要メトリクスを inline 編集 (売上 / 獲得件数 / 広告費 / CPA derived display)。
//   c92-2 で詳細展開 (27 fields) を追加予定、本 PR では「詳細編集」ボタンは
//   placeholder (将来 c92-2 で wire-up)。
//
// 視覚状態 (右上 badge):
//   - saved (緑●): DB に当該 day の entry が保存済 (修正モード)
//   - dirty (黄●): 編集中、未保存
//   - saving (青●): bulk save 進行中
//   - error (赤●): 保存失敗 (retry ボタン表示)
//   - empty (灰●): 未入力 + DB 行なし

import type { CellState } from "../lib/useBulkEntryState";

type Props = {
  cell: CellState;
  areaName: string;
  categoryLabel: string;
  onChange: (field: "outsourced_sales_revenue" | "acquisition_count" | "ad_cost", raw: string) => void;
  onRetry?: () => void;
};

const yen = (v: number | ""): string =>
  typeof v === "number" && v > 0 ? `¥${v.toLocaleString("ja-JP")}` : "—";
const cnt = (v: number | ""): string =>
  typeof v === "number" && v > 0 ? `${v.toLocaleString("ja-JP")}件` : "—";

// CPA derived: ad_cost / acquisition_count
function calcCpa(ad: number | "", acq: number | ""): string {
  if (typeof ad !== "number" || typeof acq !== "number" || ad <= 0 || acq <= 0) return "—";
  return `¥${Math.round(ad / acq).toLocaleString("ja-JP")}`;
}

function StatusBadge({ status, dirty, hasExisting }: {
  status: CellState["saveStatus"];
  dirty: boolean;
  hasExisting: boolean;
}) {
  // 優先度: saving > error > dirty > saved > empty
  let label: string;
  let bg: string;
  let color: string;
  if (status === "saving") { label = "保存中"; bg = "#dbeafe"; color = "#1e40af"; }
  else if (status === "error") { label = "失敗"; bg = "#fee2e2"; color = "#991b1b"; }
  else if (dirty) { label = "未保存"; bg = "#fef9c3"; color = "#854d0e"; }
  else if (status === "saved" || hasExisting) { label = "✓ 完了"; bg = "#d1fae5"; color = "#065f46"; }
  else { label = "未入力"; bg = "#f3f4f6"; color = "#6b7280"; }

  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 500,
      padding: "1px 6px", borderRadius: 3,
      background: bg, color, lineHeight: 1.4,
    }}>{label}</span>
  );
}

export default function EntryCell({ cell, areaName, categoryLabel, onChange, onRetry }: Props) {
  const cpa = calcCpa(cell.ad_cost, cell.acquisition_count);
  const isError = cell.saveStatus === "error";

  return (
    <div style={{
      background: "#fff",
      border: isError ? "1px solid #fca5a5" : "1px solid #e5e7eb",
      borderRadius: 8, padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 8,
      minWidth: 0, // grid item 縮小許可
    }}>
      {/* header: area name + status badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#111", lineHeight: 1.2 }}>
            {areaName}
          </div>
          <div style={{ fontSize: 9, color: "#9ca3af", lineHeight: 1.2 }}>
            {categoryLabel}
          </div>
        </div>
        <StatusBadge
          status={cell.saveStatus}
          dirty={cell.dirty}
          hasExisting={cell.hasExistingEntry}
        />
      </div>

      {/* 4 inline fields: 売上 / 獲得件数 / 広告費 / CPA */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        fontVariantNumeric: "tabular-nums",
      }}>
        <InlineField label="売上" value={cell.outsourced_sales_revenue}
          onChange={(v) => onChange("outsourced_sales_revenue", v)} />
        <InlineField label="獲得" value={cell.acquisition_count}
          onChange={(v) => onChange("acquisition_count", v)} suffix="件" />
        <InlineField label="広告費" value={cell.ad_cost}
          onChange={(v) => onChange("ad_cost", v)} />
        <DerivedField label="CPA" value={cpa} />
      </div>

      {/* error 時の retry ボタン */}
      {isError && (
        <div style={{
          padding: "6px 8px", background: "#fef2f2",
          borderRadius: 4, fontSize: 10,
        }}>
          <div style={{ color: "#991b1b", fontWeight: 500, marginBottom: 2 }}>
            ⚠ {cell.errorMsg ?? "保存失敗"}
          </div>
          {onRetry && (
            <button type="button" onClick={onRetry} style={{
              background: "#fff", border: "1px solid #fca5a5",
              color: "#991b1b", borderRadius: 4, padding: "2px 8px",
              fontSize: 10, fontWeight: 500, cursor: "pointer",
            }}>再試行</button>
          )}
        </div>
      )}

      {/* c92-2 placeholder: 詳細展開ボタン (本 PR では非機能) */}
      {/* <button type="button" disabled style={{ ... }}>詳細展開 (c92-2)</button> */}

      {/* 旧 single-cell 詳細 page への fallback link (c92-1 期間のみ) */}
      <a
        href={`/entry?view=single&category=${cell.category}`}
        style={{
          fontSize: 9, color: "#9ca3af", textDecoration: "none",
          textAlign: "right", lineHeight: 1.2,
        }}
        title="既存の単一セル詳細編集 form を開く (c92-2 で inline 展開に置換予定)"
      >
        詳細編集 →
      </a>
    </div>
  );
}

function InlineField({ label, value, onChange, suffix }: {
  label: string;
  value: number | "";
  onChange: (v: string) => void;
  suffix?: string;
}) {
  // 表示は yen / cnt ヘルパで整形、編集は raw number input
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 9, color: "#6b7280", display: "block", marginBottom: 1 }}>
        {label}{suffix ? ` (${suffix})` : ""}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value === "" ? "" : value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "4px 6px", fontSize: 12,
          border: "1px solid #d1fae5", borderRadius: 4,
          background: "#f0fdf4", color: "#111",
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          outline: "none",
        }}
      />
    </label>
  );
}

function DerivedField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 1 }}>{label} (自動)</div>
      <div style={{
        padding: "4px 6px", fontSize: 12, fontWeight: 500, color: "#374151",
        background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 4,
        textAlign: "right", fontVariantNumeric: "tabular-nums",
        height: 26, display: "flex", alignItems: "center", justifyContent: "flex-end",
      }}>
        {value}
      </div>
    </div>
  );
}

void yen; void cnt; // 将来 c92-2 詳細展開で使用予定、現状は inline で使われていない
