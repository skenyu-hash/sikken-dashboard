"use client";

import { useMemo, useState } from "react";
import { BUSINESSES } from "../../lib/businesses";
import FilterBar, { ALL_AREAS } from "./FilterBar";
import ExportCard, { type CardState } from "./ExportCard";
import {
  MONTHLY_SUMMARY_COLUMNS,
  DAILY_ENTRIES_COLUMNS,
} from "../lib/columnMappings";
import { rowsToCsv, downloadCsv, matrixToCsv } from "../lib/exportToCsv";
import {
  downloadSingleSheetXlsx,
  downloadMatrixXlsx,
  downloadWorkbook,
} from "../lib/exportToXlsx";
import {
  buildAreaPivotSheets,
  type AreaPivotResponse,
} from "../lib/buildPivot";
import {
  buildFullReportSheets,
  type FullReportResponse,
} from "../lib/buildFullReport";

type ExportType =
  | "monthly-summary"
  | "daily-entries"
  | "matrix-cells"
  | "area-pivot"
  | "full-report";

const ALL_CATEGORY_IDS = BUSINESSES.map((b) => b.id);
const ALL_AREA_IDS = ALL_AREAS.map((a) => a.id);

const SLUG: Record<ExportType, string> = {
  "monthly-summary": "monthly_summary",
  "daily-entries": "daily_entries",
  "matrix-cells": "matrix_cells",
  "area-pivot": "area_pivot",
  "full-report": "full_report",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function buildFilename(type: ExportType, fmt: "csv" | "xlsx"): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const hm = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `sikken_${SLUG[type]}_${ymd}_${hm}.${fmt}`;
}

async function parseApiError(res: Response): Promise<string> {
  if (res.status === 401) return "セッション切れです。再ログインしてください";
  if (res.status === 403) return "権限がありません";
  let body: { error?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (res.status === 400) {
    return body.error ? `入力エラー: ${body.error}` : "入力エラー";
  }
  if (res.status >= 500) return "サーバエラーが発生しました";
  return body.error ? `エラー: ${body.error}` : `HTTP ${res.status}`;
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
  const [cardStates, setCardStates] = useState<Record<ExportType, CardState>>({
    "monthly-summary": INITIAL_STATE,
    "daily-entries": INITIAL_STATE,
    "matrix-cells": INITIAL_STATE,
    "area-pivot": INITIAL_STATE,
    "full-report": INITIAL_STATE,
  });

  function patchCard(type: ExportType, patch: Partial<CardState>) {
    setCardStates((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }

  async function runExport<T>(
    type: ExportType,
    apiUrl: string,
    write: (json: T, filename: string) => Promise<void> | void,
    fmt: "csv" | "xlsx"
  ) {
    patchCard(type, { loading: true, error: null });
    try {
      const res = await fetch(apiUrl, { credentials: "include" });
      if (!res.ok) throw new Error(await parseApiError(res));
      const json = (await res.json()) as { ok: boolean; data: T; meta?: unknown };
      if (!json.ok) throw new Error("API returned ok=false");
      await write(json.data, buildFilename(type, fmt));
      patchCard(type, { loading: false, lastDownloadAt: new Date(), error: null });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "通信に失敗しました。接続を確認してください";
      patchCard(type, { loading: false, error: msg });
    }
  }

  // 共通フィルターのバリデーション。問題なければ URLSearchParams、エラー時は string を返す
  function buildCommonParams(opts: { day?: boolean }): URLSearchParams | string {
    if (selectedCategories.size === 0) {
      return "カテゴリを1つ以上選択してください";
    }
    if (selectedAreas.size === 0) {
      return "エリアを1つ以上選択してください";
    }
    const p = new URLSearchParams();
    if (opts.day) {
      p.set("from", dayFrom);
      p.set("to", dayTo);
    } else {
      p.set("from", monthFrom);
      p.set("to", monthTo);
    }
    if (selectedCategories.size < ALL_CATEGORY_IDS.length) {
      p.set("categories", Array.from(selectedCategories).join(","));
    }
    if (selectedAreas.size < ALL_AREA_IDS.length) {
      p.set("areas", Array.from(selectedAreas).join(","));
    }
    return p;
  }

  function withCommonParams(
    type: ExportType,
    opts: { day?: boolean },
    run: (qs: string) => Promise<void>
  ): Promise<void> {
    const p = buildCommonParams(opts);
    if (typeof p === "string") {
      patchCard(type, { error: p });
      return Promise.resolve();
    }
    return run(p.toString());
  }

  // === 月次サマリー ===
  const handleMonthlyCsv = () =>
    withCommonParams("monthly-summary", {}, (qs) =>
      runExport<Array<Record<string, unknown>>>(
        "monthly-summary",
        `/api/export/monthly-summary?${qs}`,
        (rows, filename) => downloadCsv(filename, rowsToCsv(rows, MONTHLY_SUMMARY_COLUMNS)),
        "csv"
      )
    );
  const handleMonthlyXlsx = () =>
    withCommonParams("monthly-summary", {}, (qs) =>
      runExport<Array<Record<string, unknown>>>(
        "monthly-summary",
        `/api/export/monthly-summary?${qs}`,
        (rows, filename) =>
          downloadSingleSheetXlsx(filename, "月次サマリー", rows, MONTHLY_SUMMARY_COLUMNS),
        "xlsx"
      )
    );

  // === 日次エントリー ===
  const handleDailyCsv = () =>
    withCommonParams("daily-entries", { day: true }, (qs) =>
      runExport<Array<Record<string, unknown>>>(
        "daily-entries",
        `/api/export/daily-entries?${qs}`,
        (rows, filename) => downloadCsv(filename, rowsToCsv(rows, DAILY_ENTRIES_COLUMNS)),
        "csv"
      )
    );
  const handleDailyXlsx = () =>
    withCommonParams("daily-entries", { day: true }, (qs) =>
      runExport<Array<Record<string, unknown>>>(
        "daily-entries",
        `/api/export/daily-entries?${qs}`,
        (rows, filename) =>
          downloadSingleSheetXlsx(filename, "日次エントリー", rows, DAILY_ENTRIES_COLUMNS),
        "xlsx"
      )
    );

  // === マトリクス全セル ===
  type MatrixData = {
    header: string[];
    rows: Array<{ salesMan: number; cells: Array<{ displayVal: number }> }>;
  };
  const buildMatrixUrl = () => {
    const p = new URLSearchParams();
    p.set("area", mxArea);
    p.set("category", mxCat);
    p.set("year", String(mxYear));
    p.set("month", String(mxMonth));
    return `/api/export/matrix-cells?${p.toString()}`;
  };
  const handleMatrixCsv = () =>
    runExport<MatrixData>(
      "matrix-cells",
      buildMatrixUrl(),
      (data, filename) => downloadCsv(filename, matrixToCsv(data.header, data.rows)),
      "csv"
    );
  const handleMatrixXlsx = () =>
    runExport<MatrixData>(
      "matrix-cells",
      buildMatrixUrl(),
      (data, filename) =>
        downloadMatrixXlsx(filename, "感応度グリッド", data.header, data.rows),
      "xlsx"
    );

  // === エリア別集計 ===
  const handleAreaPivotXlsx = () => {
    const p = new URLSearchParams();
    p.set("from", monthFrom);
    p.set("to", monthTo);
    if (apCategory) p.set("category", apCategory);
    return runExport<AreaPivotResponse>(
      "area-pivot",
      `/api/export/area-pivot?${p.toString()}`,
      (data, filename) => downloadWorkbook(filename, buildAreaPivotSheets(data)),
      "xlsx"
    );
  };

  // === 全社統合レポート ===
  const handleFullReportXlsx = () => {
    const p = new URLSearchParams();
    p.set("from", monthFrom);
    p.set("to", monthTo);
    return runExport<FullReportResponse>(
      "full-report",
      `/api/export/full-report?${p.toString()}`,
      (data, filename) => downloadWorkbook(filename, buildFullReportSheets(data)),
      "xlsx"
    );
  };

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
        onCsv={handleMonthlyCsv}
        onXlsx={handleMonthlyXlsx}
      />

      <ExportCard
        icon="📅"
        title="日次エントリー"
        description="entries.data フラット展開 + RAW JSON（最大6ヶ月、日単位）"
        state={cardStates["daily-entries"]}
        onCsv={handleDailyCsv}
        onXlsx={handleDailyXlsx}
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
        onCsv={handleMatrixCsv}
        onXlsx={handleMatrixXlsx}
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
        onXlsx={handleAreaPivotXlsx}
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
        onXlsx={handleFullReportXlsx}
      />
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
