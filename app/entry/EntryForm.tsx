"use client";
// 新フォーム /entry のメインコンテナ。
//
// 仕様書: docs/specs/spec-form-redesign.md §4
// 設計:
//   - 入力 20 + auto 11 = 31 フィールド (仕様書通り)
//   - 自動計算は useFormCalculations で useMemo (リアクティブ)
//   - バリデーションは onBlur + 保存時 (useFormValidation)
//   - 保存は POST /api/import-monthly + 500ms 後 GET /api/monthly-summary で
//     read-back verification
//   - エリア選択: executive/vice のみ手動、他は自エリア固定

import { useEffect, useMemo, useState } from "react";
import { useFormCalculations } from "./hooks/useFormCalculations";
import { useFormValidation } from "./hooks/useFormValidation";
import SectionSales from "./components/SectionSales";
import SectionCosts from "./components/SectionCosts";
import SectionAcquisition from "./components/SectionAcquisition";
import SectionConstruction from "./components/SectionConstruction";
import SectionHelp from "./components/SectionHelp";
import AutoCalcDisplay from "./components/AutoCalcDisplay";
import { BUSINESS_LABELS, type BusinessCategory } from "../lib/business-labels";
import type { EntryFormState, InputFieldKey, InputValue } from "./types";

type Props = {
  initialArea: string;
  initialYear: number;
  initialMonth: number;
  initialDay: number;
  category: BusinessCategory;
  canSelectArea: boolean;
  availableAreas: { id: string; name: string }[];
};

const AREA_NAMES: Record<string, string> = {
  kansai: "関西", kanto: "関東", nagoya: "名古屋", kyushu: "九州",
  kitakanto: "北関東", hokkaido: "北海道", chugoku: "中国", shizuoka: "静岡",
};

const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  water: "水道", electric: "電気", locksmith: "鍵", road: "ロード", detective: "探偵",
};

function emptyState(area: string, year: number, month: number, day: number, category: BusinessCategory): EntryFormState {
  return {
    area_id: area, year, month, day, category,
    outsourced_sales_revenue: "", internal_staff_revenue: "",
    outsourced_response_count: "", internal_staff_response_count: "",
    repeat_count: "", revisit_count: "", review_count: "",
    total_labor_cost: "", material_cost: "", sales_outsourcing_cost: "", card_processing_fee: "",
    ad_cost: "", call_count: "", acquisition_count: "",
    outsourced_construction_count: "", internal_construction_count: "",
    outsourced_construction_cost: "", internal_construction_profit: "",
    help_count: "", help_revenue: "",
  };
}

export default function EntryForm({ initialArea, initialYear, initialMonth, initialDay, category, canSelectArea, availableAreas }: Props) {
  const [state, setState] = useState<EntryFormState>(() =>
    emptyState(initialArea, initialYear, initialMonth, initialDay, category)
  );
  const calc = useFormCalculations(state);
  const { errors, validateField, validateAll, clearErrors } = useFormValidation();
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"idle" | "success" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // PR #44: 編集モード state (既存データ読込済か / 既存 as_of_day)
  // monthly_summaries は (area, business_category, year, month) で UNIQUE
  // のため month 単位 1 行運用 (PR #28 の設計)。day 違いでも同じ行を返す。
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [existingAsOfDay, setExistingAsOfDay] = useState<number | null>(null);

  const labels = BUSINESS_LABELS[category];

  const setField = (k: InputFieldKey, v: InputValue) => {
    setState((s) => ({ ...s, [k]: v }));
    setSaveResult("idle");
  };

  const setMeta = (k: "area_id" | "year" | "month" | "day", v: string | number) => {
    setState((s) => ({ ...s, [k]: v }));
    setSaveResult("idle");
  };

  // PR #44: area/year/month/category 変更時に既存データを fetch して展開。
  // day は UNIQUE 制約に含まれないため依存配列から除外 (day 変更で再 fetch しない)。
  // race condition 対策: cancelled フラグで高速タブ切替時の上書きを防止。
  useEffect(() => {
    let cancelled = false;
    async function fetchExisting() {
      setIsLoadingExisting(true);
      try {
        const params = new URLSearchParams({
          area: state.area_id,
          year: String(state.year),
          month: String(state.month),
          category,
        });
        const res = await fetch(`/api/monthly-summary?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;

        const summary = json.summary as Record<string, unknown> | null;
        if (summary) {
          // 既存データあり → 入力 20 フィールド展開、メタ (area/year/month/day/category) は維持
          setState((s) => ({
            ...s,
            outsourced_sales_revenue: numOrEmpty(summary.outsourced_sales_revenue),
            internal_staff_revenue: numOrEmpty(summary.internal_staff_revenue),
            outsourced_response_count: numOrEmpty(summary.outsourced_response_count),
            internal_staff_response_count: numOrEmpty(summary.internal_staff_response_count),
            repeat_count: numOrEmpty(summary.repeat_count),
            revisit_count: numOrEmpty(summary.revisit_count),
            review_count: numOrEmpty(summary.review_count),
            total_labor_cost: numOrEmpty(summary.total_labor_cost),
            material_cost: numOrEmpty(summary.material_cost),
            sales_outsourcing_cost: numOrEmpty(summary.sales_outsourcing_cost),
            card_processing_fee: numOrEmpty(summary.card_processing_fee),
            ad_cost: numOrEmpty(summary.ad_cost),
            call_count: numOrEmpty(summary.call_count),
            acquisition_count: numOrEmpty(summary.acquisition_count),
            outsourced_construction_count: numOrEmpty(summary.outsourced_construction_count),
            internal_construction_count: numOrEmpty(summary.internal_construction_count),
            outsourced_construction_cost: numOrEmpty(summary.outsourced_construction_cost),
            internal_construction_profit: numOrEmpty(summary.internal_construction_profit),
            help_count: numOrEmpty(summary.help_count),
            help_revenue: numOrEmpty(summary.help_revenue),
          }));
          const aod = Number(summary.as_of_day);
          setExistingAsOfDay(Number.isInteger(aod) ? aod : null);
        } else {
          // 既存データなし → 入力 20 フィールドをクリア (メタは維持)
          setState((s) => ({
            ...s,
            outsourced_sales_revenue: "", internal_staff_revenue: "",
            outsourced_response_count: "", internal_staff_response_count: "",
            repeat_count: "", revisit_count: "", review_count: "",
            total_labor_cost: "", material_cost: "", sales_outsourcing_cost: "", card_processing_fee: "",
            ad_cost: "", call_count: "", acquisition_count: "",
            outsourced_construction_count: "", internal_construction_count: "",
            outsourced_construction_cost: "", internal_construction_profit: "",
            help_count: "", help_revenue: "",
          }));
          setExistingAsOfDay(null);
        }
        clearErrors();
      } catch (e) {
        // ネットワークエラー時はサイレントに新規入力モード扱い
        if (!cancelled) {
          setExistingAsOfDay(null);
        }
        console.error("/entry 既存データ読込エラー:", e);
      } finally {
        if (!cancelled) setIsLoadingExisting(false);
      }
    }
    fetchExisting();
    return () => {
      cancelled = true;
    };
    // 注意: state.day は意図的に依存配列に含めない (DB 上 UNIQUE に含まれないため)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.area_id, state.year, state.month, category]);

  const handleSave = async () => {
    if (!validateAll(state)) {
      setSaveResult("error");
      setSaveMsg("入力内容を確認してください");
      return;
    }
    setSaving(true);
    setSaveResult("idle");
    setSaveMsg(null);

    try {
      // POST: pick エイリアスは PR #38 で吸収。as_of_day は今日の日。
      // as_of_day はユーザーが選んだ「日」を採用 (既存 as_of_day 運用と統合)
      const asOfDay = state.day;
      const row: Record<string, string | number> = {
        area_id: state.area_id,
        year: state.year,
        month: state.month,
        // 入力値
        outsourced_sales_revenue: numOrZero(state.outsourced_sales_revenue),
        internal_staff_revenue: numOrZero(state.internal_staff_revenue),
        outsourced_response_count: numOrZero(state.outsourced_response_count),
        internal_staff_response_count: numOrZero(state.internal_staff_response_count),
        repeat_count: numOrZero(state.repeat_count),
        revisit_count: numOrZero(state.revisit_count),
        review_count: numOrZero(state.review_count),
        total_labor_cost: numOrZero(state.total_labor_cost),
        material_cost: numOrZero(state.material_cost),
        sales_outsourcing_cost: numOrZero(state.sales_outsourcing_cost),
        card_processing_fee: numOrZero(state.card_processing_fee),
        ad_cost: numOrZero(state.ad_cost),
        call_count: numOrZero(state.call_count),
        acquisition_count: numOrZero(state.acquisition_count),
        outsourced_construction_count: numOrZero(state.outsourced_construction_count),
        internal_construction_count: numOrZero(state.internal_construction_count),
        outsourced_construction_cost: numOrZero(state.outsourced_construction_cost),
        internal_construction_profit: numOrZero(state.internal_construction_profit),
        help_count: numOrZero(state.help_count),
        help_revenue: numOrZero(state.help_revenue),
        // auto 計算結果のうち、既存 DB 列に対応するものを送信
        // (新規 DB 列なしの total_construction_count / actual_construction_cost / profit は送らない)
        total_revenue: Math.round(calc.total_revenue),
        total_count: Math.round(calc.total_response_count),
        unit_price: Math.round(calc.unit_price),
        call_unit_price: Math.round(calc.call_unit_price),
        cpa: Math.round(calc.cpa),
        conv_rate: Math.round(calc.conv_rate * 10) / 10,
        help_unit_price: Math.round(calc.help_unit_price),
        total_profit: Math.round(calc.total_profit),
      };

      const res = await fetch("/api/import-monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, as_of_day: asOfDay, rows: [row] }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const errMsg = (j.errors && j.errors[0]?.error) ?? j.error ?? `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      // read-back verification
      await new Promise((r) => setTimeout(r, 500));
      const verifyRes = await fetch(
        `/api/monthly-summary?area=${state.area_id}&year=${state.year}&month=${state.month}&category=${category}`
      );
      if (!verifyRes.ok) throw new Error("保存後の検証取得に失敗");
      const verifyJson = await verifyRes.json();
      if (!verifyJson?.summary) throw new Error("保存後に DB 行が見つかりません");

      setSaveResult("success");
      setSaveMsg(`保存しました（${state.year}年${state.month}月 / ${AREA_NAMES[state.area_id] ?? state.area_id} / ${CATEGORY_LABELS[category]}）`);
      clearErrors();
    } catch (e) {
      setSaveResult("error");
      setSaveMsg(`保存失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur - 1, cur, cur + 1];
  }, []);
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2", paddingBottom: 100 }}>
      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)", padding: "18px 24px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>
          月次データ入力 — {CATEGORY_LABELS[category]}
        </h1>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
          仕様書 31 フィールド (入力 20 / 自動計算 11)。
          入力日（日付）時点までの累積データを入力してください。下部の「保存」ボタンで一括登録します。
        </p>
      </div>

      <div style={{ padding: 20, maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* メタ: エリア / 年 / 月 */}
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #d1fae5", padding: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12 }}>
            <Meta label="エリア">
              {canSelectArea ? (
                <select value={state.area_id} onChange={(e) => setMeta("area_id", e.target.value)}
                  style={metaSelect}>
                  {availableAreas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              ) : (
                <div style={{ ...metaSelect, background: "#f9fafb", color: "#6b7280", lineHeight: "36px", paddingLeft: 10 }}>
                  {AREA_NAMES[state.area_id] ?? state.area_id}（自エリア固定）
                </div>
              )}
            </Meta>
            <Meta label="年">
              <select value={state.year} onChange={(e) => setMeta("year", Number(e.target.value))} style={metaSelect}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}年</option>)}
              </select>
            </Meta>
            <Meta label="月">
              <select value={state.month} onChange={(e) => setMeta("month", Number(e.target.value))} style={metaSelect}>
                {monthOptions.map((m) => <option key={m} value={m}>{m}月</option>)}
              </select>
            </Meta>
            <Meta label="日（as_of_day）">
              <select value={state.day} onChange={(e) => setMeta("day", Number(e.target.value))} style={metaSelect}>
                {dayOptions.map((d) => <option key={d} value={d}>{d}日</option>)}
              </select>
            </Meta>
          </div>
          {/* PR #44: 編集モード/新規入力モード/読込中のステータスバッジ */}
          <ModeBadge
            isLoading={isLoadingExisting}
            existingAsOfDay={existingAsOfDay}
            currentDay={state.day}
          />
          <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 8, lineHeight: 1.5 }}>
            ※ 編集中の値は保存前にエリア・年・月を変更すると失われます
            （日の変更は再読込しないため値は保持されます）。
          </p>
        </div>

        <SectionSales state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
        <SectionCosts state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} />
        <SectionAcquisition state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
        <SectionConstruction state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
        <SectionHelp state={state} setField={setField} validateField={validateField} errors={errors} labels={labels} calc={calc} />
        <AutoCalcDisplay calc={calc} labels={labels} />
      </div>

      {/* 固定保存バー */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "rgba(255,255,255,0.96)", borderTop: "1px solid #d1fae5",
        backdropFilter: "blur(8px)",
        padding: "12px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        zIndex: 30,
      }}>
        <div style={{ flex: 1, fontSize: 12 }}>
          {saveResult === "success" && saveMsg && (
            <span style={{ color: "#065f46", fontWeight: 700 }}>✓ {saveMsg}</span>
          )}
          {saveResult === "error" && saveMsg && (
            <span style={{ color: "#991b1b", fontWeight: 700 }}>⚠ {saveMsg}</span>
          )}
        </div>
        <button type="button" onClick={handleSave} disabled={saving}
          style={{
            padding: "10px 28px", fontSize: 13, fontWeight: 800,
            border: "none", borderRadius: 8,
            background: saving ? "#9ca3af" : "#1B5E3F", color: "#fff",
            cursor: saving ? "default" : "pointer",
            boxShadow: "0 2px 8px rgba(27,94,63,0.25)",
          }}>
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

function numOrZero(v: InputValue): number {
  return v === "" ? 0 : v;
}

// PR #44: API レスポンスから受け取った値を InputValue に変換。
// null/undefined は空文字、数値・文字列は Number 化、0 や NaN もそのまま空文字。
function numOrEmpty(v: unknown): InputValue {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : "";
}

// PR #44: 編集モード/新規入力モード/読込中のステータス表示。
// monthly_summaries は month 単位 1 行運用 (PR #28 設計) のため、day 違いでも
// 同じレコードを編集することになる。as_of_day の変化は注意喚起テキストで明示。
function ModeBadge({
  isLoading, existingAsOfDay, currentDay,
}: { isLoading: boolean; existingAsOfDay: number | null; currentDay: number }) {
  if (isLoading) {
    return (
      <div style={{
        marginTop: 12, padding: "10px 14px", borderRadius: 6,
        background: "#eff6ff", borderLeft: "4px solid #3b82f6", fontSize: 12,
      }}>
        <span style={{ fontSize: 14, marginRight: 6 }}>📡</span>
        <span style={{ color: "#1e40af", fontWeight: 600 }}>既存データを読み込み中...</span>
      </div>
    );
  }
  if (existingAsOfDay !== null) {
    const willOverwrite = existingAsOfDay !== currentDay;
    return (
      <div style={{
        marginTop: 12, padding: "10px 14px", borderRadius: 6,
        background: "#fffbeb", borderLeft: "4px solid #f59e0b", fontSize: 12,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 16 }}>✏️</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#78350f", fontWeight: 700, marginBottom: 2 }}>
              編集モード
            </div>
            <div style={{ color: "#92400e", lineHeight: 1.6 }}>
              最終更新: <strong>{existingAsOfDay}日時点</strong>（DB の現在値を表示中）
              {willOverwrite && (
                <>
                  <br />
                  保存すると <strong>as_of_day = {currentDay}日</strong> に更新されます。
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{
      marginTop: 12, padding: "10px 14px", borderRadius: 6,
      background: "#f0fdf4", borderLeft: "4px solid #10b981", fontSize: 12,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 16 }}>📝</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#065f46", fontWeight: 700, marginBottom: 2 }}>
            新規入力モード
          </div>
          <div style={{ color: "#047857", lineHeight: 1.6 }}>
            この月のデータはまだ DB に存在しません。
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 10, color: "#6b7280", marginBottom: 4, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const metaSelect: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 10px", fontSize: 13, fontWeight: 600,
  color: "#111", background: "#fff", border: "1px solid #d1fae5", borderRadius: 6, outline: "none",
};
