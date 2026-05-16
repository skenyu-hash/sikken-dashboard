"use client";
// PR #48b c2: 年/月/日 3 つの select を <input type="date"> 1 つに統合する
// カレンダー型日付入力コンポーネント。EntryForm の年/月/日 メタ入力を置換
// する用途 (c3 で組み込み)。
//
// 入出力契約:
//   - props: year/month/day (number) を受け取り
//   - onChange: (year, month, day) の 3 値を返す
//   - 内部表記は YYYY-MM-DD 文字列 (HTML date input の value 規格)
//
// 設計メモ:
//   - monthly_summaries は (area_id, business_category, year, month) で UNIQUE。
//     day は as_of_day 列としてレコード内に保存されるだけで PK には含まれない。
//   - そのため日付ごとの「履歴」表示は本 PR では未対応。注記で予告 (PR #49)。

import { useMemo } from "react";

type Props = {
  year: number;
  month: number;
  day: number;
  onChange: (year: number, month: number, day: number) => void;
  label?: string;
  disabled?: boolean;
  /** 入力可能な最小日付 (YYYY-MM-DD)。未指定なら制限なし。 */
  min?: string;
  /** 入力可能な最大日付 (YYYY-MM-DD)。未指定なら制限なし。 */
  max?: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function CalendarDatePicker({
  year, month, day, onChange,
  label = "日付", disabled, min, max,
}: Props) {
  const value = useMemo(() => `${year}-${pad2(month)}-${pad2(day)}`, [year, month, day]);

  return (
    <label style={{ display: "block" }}>
      <span style={{
        display: "block", fontSize: 10, color: "#6b7280",
        marginBottom: 4, fontWeight: 600,
      }}>{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value; // "YYYY-MM-DD" or ""
          if (!raw) return;
          const [y, m, d] = raw.split("-").map(Number);
          if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return;
          onChange(y, m, d);
        }}
        style={{
          width: "100%", height: 36, padding: "0 10px",
          fontSize: 13, fontWeight: 600, color: "#111",
          background: "#fff", border: "1px solid #d1fae5",
          borderRadius: 6, outline: "none",
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? "not-allowed" : "auto",
        }}
      />
      <span style={{
        display: "block", fontSize: 10, color: "#9ca3af",
        marginTop: 4, lineHeight: 1.4,
      }}>
        💡 日付ごとの履歴対応は近日アップデート予定（PR #49）
      </span>
    </label>
  );
}
