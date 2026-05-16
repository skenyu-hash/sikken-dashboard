"use client";
// PR #48b c2: 車両台数 (vehicle_count) 用入力フィールド。
// NumberField とは別コンポーネントとして用意する理由:
//   - 「前回スナップショットからの自動継承」UI を持つ
//   - 業態別フォーム間で再利用するため、EntryFormState 依存を持たない
//     (NumberField は InputFieldKey に縛られている)
//
// 自動継承の挙動:
//   - value === "" かつ initialFromLastSnapshot != null のとき、マウント時に
//     1 度だけ onChange(initialFromLastSnapshot) を発火し、親 state を埋める。
//   - useRef ガードで「外部リセット (空に戻る) → 再オートフィル」のループを防ぐ。
//   - 一度オートフィルした後にユーザーが手動で消した場合は空のまま (再注入しない)。
//   - initialFromLastSnapshot が変化したとき (新しい月をロード等) はガードを
//     解除して再度オートフィル可能にする。
//
// なお、表示としては lastSnapshot が与えられている間は常に
// 「前回スナップショット: X 台」のヒントを表示する。

import { useEffect, useRef } from "react";
import type { InputValue } from "../types";

type Props = {
  value: InputValue;
  onChange: (v: InputValue) => void;
  /**
   * 前回スナップショット (同エリア・前月 or 月内直前) の vehicle_count 値。
   * null/undefined のときは継承 UI を表示しない。
   */
  initialFromLastSnapshot?: number | null;
  label?: string;
  disabled?: boolean;
  error?: string;
};

export default function VehicleCountField({
  value, onChange,
  initialFromLastSnapshot,
  label = "車両台数", disabled, error,
}: Props) {
  // 「同じ snapshot 値」に対して 1 度だけオートフィルを実行するためのガード。
  // initialFromLastSnapshot が変わったらリセットする (新しい月へ移動した等)。
  const autoFilledFor = useRef<number | null>(null);

  useEffect(() => {
    const snap = initialFromLastSnapshot;
    if (snap == null) return;
    // 既にこの snap でオートフィル済みならスキップ (手動クリア後の再注入を防ぐ)
    if (autoFilledFor.current === snap) return;
    if (value === "") {
      autoFilledFor.current = snap;
      onChange(snap);
    }
    // 新しい snap が来たらガードを更新 (value が "" でなくてもユーザー編集を尊重)
    autoFilledFor.current = snap;
    // onChange は親側で memo 化されない前提なので依存配列から除外する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFromLastSnapshot]);

  const showHint = initialFromLastSnapshot != null;

  return (
    <label style={{ display: "block" }}>
      <span style={{
        display: "block", fontSize: 11, color: "#374151",
        marginBottom: 4, fontWeight: 600,
      }}>
        {label}
        <span style={{ color: "#9ca3af", marginLeft: 4, fontWeight: 400 }}>(台)</span>
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
        style={{
          width: "100%", height: 36, padding: "0 10px",
          fontSize: 13, fontWeight: 600, color: "#111",
          textAlign: "right", background: "#fff",
          border: error ? "1.5px solid #dc2626" : "1px solid #d1fae5",
          borderRadius: 6, outline: "none",
          opacity: disabled ? 0.6 : 1,
        }}
      />
      {showHint && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          marginTop: 4, fontSize: 10, color: "#047857", fontWeight: 600,
        }}>
          <span>🚗 前回スナップショット: {initialFromLastSnapshot} 台</span>
          {value !== initialFromLastSnapshot && (
            <button
              type="button"
              onClick={() => onChange(initialFromLastSnapshot ?? 0)}
              disabled={disabled}
              style={{
                padding: "2px 8px", fontSize: 10, fontWeight: 700,
                border: "1px solid #d1fae5", borderRadius: 4,
                background: "#f0fdf4", color: "#065f46",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >前回値を使う</button>
          )}
        </span>
      )}
      {error && (
        <span style={{
          display: "block", fontSize: 10, color: "#dc2626",
          marginTop: 3, fontWeight: 600,
        }}>{error}</span>
      )}
    </label>
  );
}
