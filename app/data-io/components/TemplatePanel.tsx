"use client";

import { useState } from "react";
import { BUSINESSES, type BusinessCategory } from "../../lib/businesses";
import ExportCard, { type CardState } from "./ExportCard";
import {
  downloadTemplateCsv,
  downloadTemplateXlsx,
} from "../lib/exportTemplate";

type TemplateCardId =
  | "monthly_blank"
  | "monthly_sample"
  | "daily_blank"
  | "daily_sample";

const INITIAL_STATE: CardState = {
  loading: false,
  error: null,
  lastDownloadAt: null,
};

export default function TemplatePanel() {
  // カード4（日次サンプル）の業態プルダウン。デフォルトは water。
  const [dailyCategory, setDailyCategory] = useState<BusinessCategory>("water");

  // カードごとの DL 状態（並行 DL に耐える独立 state）
  const [cardStates, setCardStates] = useState<
    Record<TemplateCardId, CardState>
  >({
    monthly_blank: INITIAL_STATE,
    monthly_sample: INITIAL_STATE,
    daily_blank: INITIAL_STATE,
    daily_sample: INITIAL_STATE,
  });

  function patchCard(id: TemplateCardId, patch: Partial<CardState>) {
    setCardStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function runTemplate(
    id: TemplateCardId,
    fmt: "csv" | "xlsx",
    kind: "monthly" | "daily",
    variant: "blank" | "sample",
    category?: BusinessCategory
  ) {
    patchCard(id, { loading: true, error: null });
    try {
      if (fmt === "csv") {
        downloadTemplateCsv(kind, variant, category);
      } else {
        await downloadTemplateXlsx(kind, variant, category);
      }
      patchCard(id, {
        loading: false,
        lastDownloadAt: new Date(),
        error: null,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "ダウンロード失敗";
      patchCard(id, { loading: false, error: msg });
    }
  }

  // 8個のハンドラ（4カード × 2形式）
  const handleMonthlyBlankCsv  = () => runTemplate("monthly_blank",  "csv",  "monthly", "blank");
  const handleMonthlyBlankXlsx = () => runTemplate("monthly_blank",  "xlsx", "monthly", "blank");
  const handleMonthlySampleCsv  = () => runTemplate("monthly_sample", "csv",  "monthly", "sample");
  const handleMonthlySampleXlsx = () => runTemplate("monthly_sample", "xlsx", "monthly", "sample");
  const handleDailyBlankCsv  = () => runTemplate("daily_blank",  "csv",  "daily", "blank");
  const handleDailyBlankXlsx = () => runTemplate("daily_blank",  "xlsx", "daily", "blank");
  const handleDailySampleCsv  = () => runTemplate("daily_sample", "csv",  "daily", "sample", dailyCategory);
  const handleDailySampleXlsx = () => runTemplate("daily_sample", "xlsx", "daily", "sample", dailyCategory);

  return (
    <div>
      <div
        style={{
          background: "#FAFAFA",
          border: "1px dashed #E5E7EB",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 16,
          fontSize: 11,
          color: "#6B7280",
          lineHeight: 1.6,
        }}
      >
        💡 テンプレートをダウンロードして Excel / Numbers で編集後、取込タブからアップロード可能（取込機能は Phase 9.2.3 で実装予定）。各テンプレートのヘッダー直下には注釈行（&quot;* = 必須項目です&quot;）が含まれます。
      </div>

      <ExportCard
        icon="📋"
        title="月次サマリー（空テンプレート）"
        description="monthly_summaries の21列、ヘッダー + 注釈行のみ。* 必須項目"
        state={cardStates["monthly_blank"]}
        onCsv={handleMonthlyBlankCsv}
        onXlsx={handleMonthlyBlankXlsx}
      />

      <ExportCard
        icon="📊"
        title="月次サマリー（サンプル入り）"
        description="ヘッダー + 3行サンプル（関西水道 / 関東電気 / 関西探偵、直近月）"
        state={cardStates["monthly_sample"]}
        onCsv={handleMonthlySampleCsv}
        onXlsx={handleMonthlySampleXlsx}
      />

      <ExportCard
        icon="📅"
        title="日次エントリー（空テンプレート）"
        description="DailyEntry の30列、全業態共通スキーマ。ヘッダー + 注釈行のみ。* 必須項目"
        state={cardStates["daily_blank"]}
        onCsv={handleDailyBlankCsv}
        onXlsx={handleDailyBlankXlsx}
      />

      <ExportCard
        icon="📅"
        title="日次エントリー（サンプル入り）"
        description="業態別の3日分サンプル（直近月の 1日 / 5日 / 10日）"
        state={cardStates["daily_sample"]}
        onCsv={handleDailySampleCsv}
        onXlsx={handleDailySampleXlsx}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={fieldHintStyle}>業態:</span>
          <select
            value={dailyCategory}
            onChange={(e) => setDailyCategory(e.target.value as BusinessCategory)}
            disabled={cardStates["daily_sample"].loading}
            style={inputSmallStyle}
          >
            {BUSINESSES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </ExportCard>
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
