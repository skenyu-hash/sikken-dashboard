"use client";

import { useMemo, useState } from "react";
import { BUSINESSES } from "../../lib/businesses";
import FilterBar, { ALL_AREAS } from "./FilterBar";
import ExportCard, { type CardState } from "./ExportCard";

type ExportType =
  | "monthly-summary"
  | "daily-entries"
  | "matrix-cells"
  | "area-pivot"
  | "full-report";

const ALL_CATEGORY_IDS = BUSINESSES.map((b) => b.id);
const ALL_AREA_IDS = ALL_AREAS.map((a) => a.id);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function defaultMonthFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function defaultMonthTo(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function defaultDayFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
function defaultDayTo(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(last)}`;
}

const INITIAL_STATE: CardState = {
  loading: false,
  error: null,
  lastDownloadAt: null,
};

export default function ExportPanel() {
  // 共通フィルター
  const [monthFrom, setMonthFrom] = useState<string>(defaultMonthFrom());
  const [monthTo, setMonthTo] = useState<string>(defaultMonthTo());
  const [dayFrom, setDayFrom] = useState<string>(defaultDayFrom());
  const [dayTo, setDayTo] = useState<string>(defaultDayTo());

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(ALL_CATEGORY_IDS)
  );
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(
    new Set(ALL_AREA_IDS)
  );

  // matrix-cells 専用
  const now = useMemo(() => new Date(), []);
  const [mxArea, setMxArea] = useState<string>("kansai");
  const [mxCat, setMxCat] = useState<string>("water");
  const [mxYear, setMxYear] = useState<number>(now.getFullYear());
  const [mxMonth, setMxMonth] = useState<number>(now.getMonth() + 1);

  // area-pivot 専用（空 = 全カテゴリ合算）
  const [apCategory, setApCategory] = useState<string>("");

  // カードごとの状態
  const [cardStates] = useState<Record<ExportType, CardState>>({
    "monthly-summary": INITIAL_STATE,
    "daily-entries": INITIAL_STATE,
    "matrix-cells": INITIAL_STATE,
    "area-pivot": INITIAL_STATE,
    "full-report": INITIAL_STATE,
  });

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllCategories = () => {
    setSelectedCategories((prev) =>
      prev.size === ALL_CATEGORY_IDS.length ? new Set() : new Set(ALL_CATEGORY_IDS)
    );
  };
  const toggleArea = (id: string) => {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllAreas = () => {
    setSelectedAreas((prev) =>
      prev.size === ALL_AREA_IDS.length ? new Set() : new Set(ALL_AREA_IDS)
    );
  };

  return (
    <div>
      <FilterBar
        monthFrom={monthFrom}
        monthTo={monthTo}
        setMonthFrom={setMonthFrom}
        setMonthTo={setMonthTo}
        selectedCategories={selectedCategories}
        toggleCategory={toggleCategory}
        toggleAllCategories={toggleAllCategories}
        selectedAreas={selectedAreas}
        toggleArea={toggleArea}
        toggleAllAreas={toggleAllAreas}
      />

      <ExportCard
        icon="📊"
        title="月次サマリー"
        description="monthly_summaries 全カラム + エリア・業態日本語名（最大36ヶ月、月単位）"
        state={cardStates["monthly-summary"]}
        csvDisabled
        xlsxDisabled
        onCsv={() => {}}
        onXlsx={() => {}}
      />

      <ExportCard
        icon="📅"
        title="日次エントリー"
        description="entries.data フラット展開 + RAW JSON（最大6ヶ月、日単位）"
        state={cardStates["daily-entries"]}
        csvDisabled
        xlsxDisabled
        onCsv={() => {}}
        onXlsx={() => {}}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={fieldHintStyle}>📅 日範囲：</span>
          <input
            type="date"
            value={dayFrom}
            onChange={(e) => setDayFrom(e.target.value)}
            style={inputSmallStyle}
          />
          <span style={{ color: "#6B7280", fontSize: 12 }}>〜</span>
          <input
            type="date"
            value={dayTo}
            onChange={(e) => setDayTo(e.target.value)}
            style={inputSmallStyle}
          />
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: "#D97706", lineHeight: 1.5 }}>
          ⚠ entries テーブルの PK 制約により、同日同エリアで複数業態の入力が重複した場合、後勝ちで上書きされている可能性があります（KNOWN_ISSUES.md セクション1）
        </div>
      </ExportCard>

      <ExportCard
        icon="🧮"
        title="マトリクス全セル"
        description="感応度グリッド全セル展開（広告費率 13〜45% × 売上動的刻み）"
        state={cardStates["matrix-cells"]}
        csvDisabled
        xlsxDisabled
        onCsv={() => {}}
        onXlsx={() => {}}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={fieldHintStyle}>対象：</span>
          <select
            value={mxArea}
            onChange={(e) => setMxArea(e.target.value)}
            style={inputSmallStyle}
          >
            {ALL_AREAS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={mxCat}
            onChange={(e) => setMxCat(e.target.value)}
            style={inputSmallStyle}
          >
            {BUSINESSES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={mxYear}
            onChange={(e) => setMxYear(Number(e.target.value))}
            style={inputSmallStyle}
          >
            {[now.getFullYear() - 1, now.getFullYear()].map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
          <select
            value={mxMonth}
            onChange={(e) => setMxMonth(Number(e.target.value))}
            style={inputSmallStyle}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </div>
      </ExportCard>

      <ExportCard
        icon="🌐"
        title="エリア別集計（XLSX のみ）"
        description="エリア(行)×月(列) のピボット 3シート（売上 / 粗利 / 広告費）"
        state={cardStates["area-pivot"]}
        xlsxDisabled
        onXlsx={() => {}}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={fieldHintStyle}>カテゴリ絞り込み：</span>
          <button
            type="button"
            onClick={() => setApCategory("")}
            style={categoryPickerStyle(apCategory === "")}
          >
            全合算
          </button>
          {BUSINESSES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setApCategory(b.id)}
              style={categoryPickerStyle(apCategory === b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </ExportCard>

      <ExportCard
        icon="🏢"
        title="全社統合レポート（XLSX のみ）"
        description="①月次×カテゴリ ②月次×エリア ③カテゴリ×エリア の3シート（最大12ヶ月固定）"
        state={cardStates["full-report"]}
        xlsxDisabled
        onXlsx={() => {}}
      />

      <div
        style={{
          marginTop: 8,
          padding: "10px 14px",
          background: "#FAFAFA",
          border: "1px dashed #E5E7EB",
          borderRadius: 8,
          fontSize: 11,
          color: "#6B7280",
          lineHeight: 1.6,
        }}
      >
        💡 ダウンロードボタンは現在準備中（Phase 9.2 コミット 6b で接続予定）。
        フィルター UI とカード骨格のみ先行公開しています。
      </div>
    </div>
  );
}

const fieldHintStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#374151",
};

const inputSmallStyle: React.CSSProperties = {
  height: 30,
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  padding: "0 8px",
  fontSize: 12,
  fontWeight: 600,
  color: "#111827",
  background: "#FFFFFF",
  outline: "none",
};

function categoryPickerStyle(selected: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 14,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    border: selected ? "1px solid #1B5E3F" : "1px solid #E5E7EB",
    background: selected ? "#1B5E3F" : "#FFFFFF",
    color: selected ? "#FFFFFF" : "#374151",
    whiteSpace: "nowrap",
  };
}
