"use client";

import { BUSINESSES } from "../../lib/businesses";

const ALL_AREAS: { id: string; name: string }[] = [
  { id: "kansai",    name: "関西" },
  { id: "kanto",     name: "関東" },
  { id: "nagoya",    name: "名古屋" },
  { id: "kyushu",    name: "九州" },
  { id: "kitakanto", name: "北関東" },
  { id: "hokkaido",  name: "北海道" },
  { id: "chugoku",   name: "中国" },
  { id: "shizuoka",  name: "静岡" },
];

type FilterBarProps = {
  monthFrom: string;
  monthTo: string;
  setMonthFrom: (v: string) => void;
  setMonthTo: (v: string) => void;
  selectedCategories: Set<string>;
  toggleCategory: (id: string) => void;
  toggleAllCategories: () => void;
  selectedAreas: Set<string>;
  toggleArea: (id: string) => void;
  toggleAllAreas: () => void;
};

export default function FilterBar(props: FilterBarProps) {
  const allCatsSelected =
    props.selectedCategories.size === BUSINESSES.length;
  const allAreasSelected = props.selectedAreas.size === ALL_AREAS.length;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#065f46",
          marginBottom: 14,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        共通フィルター
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={fieldLabelStyle}>📅 期間（月単位）</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="month"
            value={props.monthFrom}
            onChange={(e) => props.setMonthFrom(e.target.value)}
            style={inputStyle}
          />
          <span style={{ color: "#6B7280", fontSize: 12 }}>〜</span>
          <input
            type="month"
            value={props.monthTo}
            onChange={(e) => props.setMonthTo(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={fieldLabelStyle}>🏷️ カテゴリ</div>
        <div style={chipRowStyle}>
          <Chip
            label="全選択"
            selected={allCatsSelected}
            onClick={props.toggleAllCategories}
          />
          {BUSINESSES.map((b) => (
            <Chip
              key={b.id}
              label={b.label}
              selected={props.selectedCategories.has(b.id)}
              onClick={() => props.toggleCategory(b.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <div style={fieldLabelStyle}>📍 エリア</div>
        <div style={chipRowStyle}>
          <Chip
            label="全選択"
            selected={allAreasSelected}
            onClick={props.toggleAllAreas}
          />
          {ALL_AREAS.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              selected={props.selectedAreas.has(a.id)}
              onClick={() => props.toggleArea(a.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#374151",
  marginBottom: 8,
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const inputStyle: React.CSSProperties = {
  height: 34,
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 600,
  color: "#111827",
  background: "#FFFFFF",
  outline: "none",
};

const chipRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 16,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        border: selected ? "1px solid #1B5E3F" : "1px solid #E5E7EB",
        background: selected ? "#1B5E3F" : "#FFFFFF",
        color: selected ? "#FFFFFF" : "#374151",
        whiteSpace: "nowrap",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

export { ALL_AREAS };
