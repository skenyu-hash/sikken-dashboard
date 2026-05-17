"use client";
// PR #48b: 業態別フォーム (LocksmithForm / RoadForm / DetectiveForm) から
// 使う UI-only な数値入力フィールド。
//
// NumberField は EntryFormState の field key (InputFieldKey) に縛られている
// ため、業態フォーム-local state (販管費 / チャネル内訳など DB 保存対象外)
// には使えない。本コンポーネントは field key 不要 + onBlur 不要のシンプル版。

import type { InputValue } from "../types";

type Props = {
  label: string;
  unit: "円" | "件" | "%";
  value: InputValue;
  onChange: (v: InputValue) => void;
  disabled?: boolean;
};

export default function LocalNumberField({ label, unit, value, onChange, disabled }: Props) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, color: "#374151", marginBottom: 4, fontWeight: 600 }}>
        {label}
        <span style={{ color: "#9ca3af", marginLeft: 4, fontWeight: 400 }}>({unit})</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
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
          border: "1px solid #d1fae5", borderRadius: 6, outline: "none",
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </label>
  );
}
