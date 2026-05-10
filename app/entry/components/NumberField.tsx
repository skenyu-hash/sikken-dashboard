"use client";
// 共通: 数値入力フィールド (空文字許容、onBlur で validate、エラー表示)。
// 既存スタイル (緑系 = #d1fae5 ボーダー) と整合。

import type { InputValue, InputFieldKey, EntryFormState } from "../types";

type Props = {
  field: InputFieldKey;
  label: string;
  unit?: "円" | "件" | "%" | "";
  value: InputValue;
  onChange: (v: InputValue) => void;
  onBlur: (field: InputFieldKey, v: InputValue, state: EntryFormState) => boolean;
  state: EntryFormState;
  error?: string;
  required?: boolean;
};

export default function NumberField({
  field, label, unit = "", value, onChange, onBlur, state, error, required,
}: Props) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, color: "#374151", marginBottom: 4, fontWeight: 600 }}>
        {label}
        {unit && <span style={{ color: "#9ca3af", marginLeft: 4, fontWeight: 400 }}>({unit})</span>}
        {required && <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : Number(raw));
        }}
        onBlur={() => onBlur(field, value, state)}
        style={{
          width: "100%",
          height: 36,
          padding: "0 10px",
          fontSize: 13,
          fontWeight: 600,
          color: "#111",
          textAlign: "right",
          background: "#fff",
          border: error ? "1.5px solid #dc2626" : "1px solid #d1fae5",
          borderRadius: 6,
          outline: "none",
        }}
      />
      {error && (
        <span style={{ display: "block", fontSize: 10, color: "#dc2626", marginTop: 3, fontWeight: 600 }}>
          {error}
        </span>
      )}
    </label>
  );
}
