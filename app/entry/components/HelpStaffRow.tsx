"use client";
// PR c95-A-2: HELP 担当者ごとの動的行 (SectionHelp から呼び出し)。
//   入力: 担当者名 / HELP売上 / 件数 / 成約数 + 削除ボタン。
//   G5: staff_name はいずれか数値入力時に必須 (validation は EntryForm 側で行う)。
//   全項目空の行は handleSave で除外 (G4 と整合)。

import type { HelpStaffEntry, InputValue } from "../types";

type Props = {
  index: number;
  value: HelpStaffEntry;
  onChange: (next: HelpStaffEntry) => void;
  onRemove: () => void;
  errors?: Partial<Record<keyof HelpStaffEntry, string>>;
};

function parseNum(v: string): InputValue {
  if (v === "") return "";
  const n = Number(v.replace(/[,\s]/g, ""));
  return isFinite(n) ? n : "";
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "#374151", marginBottom: 4, fontWeight: 600,
};
const inputBase: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 10px",
  fontSize: 13, fontWeight: 600, color: "#111",
  background: "#fff", borderRadius: 6, outline: "none",
};
const errStyle: React.CSSProperties = {
  display: "block", fontSize: 10, color: "#dc2626", marginTop: 3, fontWeight: 600,
};
const borderOk = "1px solid #d1fae5";
const borderErr = "1.5px solid #dc2626";

export default function HelpStaffRow({ index, value, onChange, onRemove, errors }: Props) {
  const set = <K extends keyof HelpStaffEntry>(k: K, v: HelpStaffEntry[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1.5fr 1.4fr 1fr 1fr 36px",
      gap: 8, alignItems: "start",
      padding: 10, background: "#fafafa", borderRadius: 6, border: "1px solid #f3f4f6",
    }}>
      <label style={{ display: "block" }}>
        <span style={labelStyle}>担当者名{index === 0 ? " (必須)" : ""}</span>
        <input
          type="text" placeholder="例: 田中"
          value={value.staff_name}
          onChange={(e) => set("staff_name", e.target.value)}
          style={{ ...inputBase, border: errors?.staff_name ? borderErr : borderOk }}
          aria-label={`担当者 ${index + 1} 氏名`}
        />
        {errors?.staff_name && <span style={errStyle}>{errors.staff_name}</span>}
      </label>

      <label style={{ display: "block" }}>
        <span style={labelStyle}>HELP 売上 (円)</span>
        <input
          type="number" inputMode="numeric" min={0} placeholder="0"
          value={value.help_sales}
          onChange={(e) => set("help_sales", parseNum(e.target.value))}
          style={{ ...inputBase, border: errors?.help_sales ? borderErr : borderOk }}
          aria-label={`担当者 ${index + 1} HELP売上`}
        />
        {errors?.help_sales && <span style={errStyle}>{errors.help_sales}</span>}
      </label>

      <label style={{ display: "block" }}>
        <span style={labelStyle}>件数</span>
        <input
          type="number" inputMode="numeric" min={0} placeholder="0"
          value={value.help_count}
          onChange={(e) => set("help_count", parseNum(e.target.value))}
          style={{ ...inputBase, border: errors?.help_count ? borderErr : borderOk }}
          aria-label={`担当者 ${index + 1} HELP件数`}
        />
        {errors?.help_count && <span style={errStyle}>{errors.help_count}</span>}
      </label>

      <label style={{ display: "block" }}>
        <span style={labelStyle}>成約数</span>
        <input
          type="number" inputMode="numeric" min={0} placeholder="0"
          value={value.help_close_count}
          onChange={(e) => set("help_close_count", parseNum(e.target.value))}
          style={{ ...inputBase, border: errors?.help_close_count ? borderErr : borderOk }}
          aria-label={`担当者 ${index + 1} 成約数`}
        />
        {errors?.help_close_count && <span style={errStyle}>{errors.help_close_count}</span>}
      </label>

      <button
        type="button"
        onClick={onRemove}
        title="この行を削除"
        aria-label={`担当者 ${index + 1} を削除`}
        style={{
          marginTop: 21, width: 36, height: 36,
          border: "1px solid #e5e7eb", borderRadius: 6,
          background: "#fff", color: "#dc2626", cursor: "pointer",
          fontSize: 16, fontWeight: 700,
        }}
      >×</button>
    </div>
  );
}
