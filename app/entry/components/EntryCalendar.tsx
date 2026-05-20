"use client";
// PR c6: モバイル向けカレンダー (mockup sikken_other_mobile_mockups_1.html Image 4)。
//
// 既存 3 つの <select> (年/月/日) を 1 つの date-picker-card に統合。
//
// 設計:
//   - displayYear / displayMonth は内部 state、◀▶ で月送り (state.year/month は不変)
//   - cell タップで初めて onChange を呼び、親 state を更新 (= fetch trigger)
//   - has-data dot は displayMonth === state.month の時のみ表示 (別月閲覧中はドットなし)
//   - props.year/month が外部から変更されたら displayYear/Month も同期 (defensive)
//
// セル状態 (mockup .cal-day 準拠):
//   - 通常        : white bg + #374151 text
//   - 先月 (muted) : #d1d5db text
//   - 今日 (today) : #fef3c7 bg + #854d0e text + bold
//   - 選択 (selected): #059669 bg + white text + bold
//   - 入力済 (has-data): ::after で右下に #059669 4px ドット
//
// 凡例: 入力済 ● / 今日 / 選択中

import { useEffect, useMemo, useState } from "react";

type Props = {
  /** 現在選択中の年 (state.year) */
  year: number;
  /** 現在選択中の月 (state.month, 1-12) */
  month: number;
  /** 現在選択中の日 (state.day, 1-31) */
  day: number;
  /** 入力済み日のセット (Q1=A: 通常は as_of_day の 1 日のみ) */
  hasDataDays: Set<number>;
  /** 日付変更時のコールバック。3 値とも変わる可能性あり (別月セルをタップした場合) */
  onChange: (year: number, month: number, day: number) => void;
  /** 読み込み中フラグ (fetch 中はカレンダー操作を抑制) */
  isLoading?: boolean;
  /** disabled (canEdit=false 等) */
  disabled?: boolean;
};

const DOW = ["日", "月", "火", "水", "木", "金", "土"] as const;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 月最終日 (year-month は 1-indexed)。月 13 = 翌年 1 月 0 日 = 当月末日 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 月初の曜日 (0=日, 6=土) */
function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export default function EntryCalendar({
  year, month, day, hasDataDays, onChange, isLoading, disabled,
}: Props) {
  // displayYear/Month は内部 state — ◀▶ 月送りで一時的に displayed 月を変更可能
  const [displayYear, setDisplayYear] = useState(year);
  const [displayMonth, setDisplayMonth] = useState(month);

  // 外部から year/month が変わったら (canSelectArea 等の親操作で), display も追従
  useEffect(() => {
    setDisplayYear(year);
    setDisplayMonth(month);
  }, [year, month]);

  // 今日の日付 (今月のときだけ today highlight)
  const todayObj = useMemo(() => new Date(), []);
  const isViewingCurrentMonth =
    todayObj.getFullYear() === displayYear && todayObj.getMonth() + 1 === displayMonth;
  const todayDay = todayObj.getDate();

  // 選択中の月を閲覧しているか (has-data dot 表示制御)
  const isViewingSelectedMonth = displayYear === year && displayMonth === month;

  // 月送り
  const navMonth = (delta: -1 | 1) => {
    let y = displayYear;
    let m = displayMonth + delta;
    if (m < 1) { y -= 1; m = 12; }
    if (m > 12) { y += 1; m = 1; }
    setDisplayYear(y);
    setDisplayMonth(m);
  };

  // セル配列構築: 7×6 = 42 cells, 月初の曜日ぶん muted (前月) + 当月 + 翌月 padding
  const cells: { y: number; m: number; d: number; muted: boolean }[] = [];
  const startDow = firstDayOfWeek(displayYear, displayMonth);
  const lastDay = lastDayOfMonth(displayYear, displayMonth);
  const prevLastDay = lastDayOfMonth(
    displayMonth === 1 ? displayYear - 1 : displayYear,
    displayMonth === 1 ? 12 : displayMonth - 1
  );
  // 先月パディング (muted)
  for (let i = startDow - 1; i >= 0; i--) {
    const dd = prevLastDay - i;
    const pm = displayMonth === 1 ? 12 : displayMonth - 1;
    const py = displayMonth === 1 ? displayYear - 1 : displayYear;
    cells.push({ y: py, m: pm, d: dd, muted: true });
  }
  // 当月
  for (let d = 1; d <= lastDay; d++) {
    cells.push({ y: displayYear, m: displayMonth, d, muted: false });
  }
  // 残りの 6 行分埋め (翌月 muted)
  while (cells.length < 42) {
    const idx = cells.length - startDow - lastDay + 1;
    const nm = displayMonth === 12 ? 1 : displayMonth + 1;
    const ny = displayMonth === 12 ? displayYear + 1 : displayYear;
    cells.push({ y: ny, m: nm, d: idx, muted: true });
  }

  const formattedDate = `${year}年${month}月${day}日 (${DOW[new Date(year, month - 1, day).getDay()]})`;

  const navBtn: React.CSSProperties = {
    background: "#fff", border: "0.5px solid rgba(0,0,0,0.1)",
    padding: "3px 8px", fontSize: 11, borderRadius: 4,
    cursor: disabled || isLoading ? "not-allowed" : "pointer",
    opacity: disabled || isLoading ? 0.5 : 1,
  };

  return (
    <div style={{
      background: "#fff", border: "0.5px solid rgba(0,0,0,0.1)",
      borderRadius: 10, padding: 12, marginBottom: 12,
      fontVariantNumeric: "tabular-nums",
    }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, fontWeight: 500 }}>
        入力日
      </div>

      {/* 選択日サマリ表示 (mockup .date-display) */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#f0fdf4", border: "0.5px solid #a7f3d0", borderRadius: 8,
        padding: "10px 12px",
      }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: "#064e3b" }}>
          {formattedDate}
        </span>
        <span style={{ color: "#065f46", fontSize: 18 }} aria-hidden>📅</span>
      </div>

      {/* カレンダー mini grid */}
      <div style={{
        background: "#fafafa", borderRadius: 8, padding: 10, marginTop: 10,
      }}>
        {/* 月送りヘッダ */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 8,
        }}>
          <button type="button" onClick={() => navMonth(-1)} disabled={disabled || isLoading}
            style={navBtn} aria-label="前月">◀</button>
          <span style={{ fontSize: 13, fontWeight: 500 }}>
            {displayYear}年{displayMonth}月
          </span>
          <button type="button" onClick={() => navMonth(1)} disabled={disabled || isLoading}
            style={navBtn} aria-label="翌月">▶</button>
        </div>

        {/* DOW + 日付 grid (7 col × 7 row 含む header) */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
          fontSize: 11, textAlign: "center",
        }}>
          {DOW.map((d) => (
            <div key={d} style={{
              color: "#9ca3af", padding: "4px 0", fontSize: 10,
            }}>{d}</div>
          ))}
          {cells.map((c, i) => {
            const isSelected = !c.muted && c.y === year && c.m === month && c.d === day;
            const isToday = !c.muted && isViewingCurrentMonth && c.d === todayDay;
            const isHasData = !c.muted && isViewingSelectedMonth && hasDataDays.has(c.d);
            const cellStyle: React.CSSProperties = {
              padding: "6px 0", borderRadius: 4,
              cursor: c.muted || disabled || isLoading ? "default" : "pointer",
              color: c.muted ? "#d1d5db"
                : isSelected ? "#fff"
                : isToday ? "#854d0e" : "#374151",
              background: isSelected ? "#059669"
                : isToday ? "#fef3c7" : "transparent",
              fontWeight: isSelected || isToday ? 500 : 400,
              position: "relative",
            };
            return (
              <div
                key={i}
                onClick={() => {
                  if (c.muted || disabled || isLoading) return;
                  onChange(c.y, c.m, c.d);
                }}
                style={cellStyle}
                role="button"
                tabIndex={c.muted ? -1 : 0}
                aria-label={`${c.y}年${c.m}月${c.d}日`}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
              >
                {c.d}
                {isHasData && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute", bottom: 2, left: "50%",
                      transform: "translateX(-50%)",
                      width: 4, height: 4, borderRadius: "50%",
                      background: isSelected ? "#fff" : "#059669",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 凡例 */}
        <div style={{
          marginTop: 8, display: "flex", gap: 10,
          fontSize: 9, color: "#9ca3af", alignItems: "center",
        }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 6, height: 6, background: "#059669", borderRadius: "50%" }} aria-hidden />
            入力済
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, background: "#fef3c7", borderRadius: 2 }} aria-hidden />
            今日
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, background: "#059669", borderRadius: 2 }} aria-hidden />
            選択中
          </span>
        </div>
      </div>
    </div>
  );
}

// pad2 は他コンポーネント (旧 CalendarDatePicker) で使用されていたヘルパー。
// CalendarDatePicker.tsx は orphan のため本 PR で削除。pad2 はこのファイル内のみで使用。
void pad2;
