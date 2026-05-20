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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormCalculations } from "./hooks/useFormCalculations";
import { useFormValidation } from "./hooks/useFormValidation";
import { useDebouncedAutoSave } from "./hooks/useDebouncedAutoSave";
import EntryCalendar from "./components/EntryCalendar";
import WaterForm from "./components/forms/WaterForm";
import ElectricForm from "./components/forms/ElectricForm";
import LocksmithForm, { computeLocksmithProfit } from "./components/forms/LocksmithForm";
import RoadForm from "./components/forms/RoadForm";
import DetectiveForm from "./components/forms/DetectiveForm";
import { BUSINESS_LABELS, type BusinessCategory, type FieldLabels } from "../lib/business-labels";
import { BUSINESSES } from "../lib/businesses";
import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue } from "./types";

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

// PR #48b c3: 業態別フォーム dispatch。
// 現状は全業態 WaterForm を返す (動作変更ゼロを担保)。
// c4 で electric → ElectricForm、locksmith → LocksmithForm を分岐に追加。
// c5 で road → RoadForm、detective → DetectiveForm を分岐に追加。
type FormProps = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
};

function renderBusinessForm(category: BusinessCategory, props: FormProps) {
  switch (category) {
    case "electric":
      return <ElectricForm {...props} />;
    case "locksmith":
      return <LocksmithForm {...props} />;
    case "road":
      return <RoadForm {...props} />;
    case "detective":
      return <DetectiveForm {...props} />;
    case "water":
    default:
      return <WaterForm {...props} />;
  }
}

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
    switchboard_count: "",
    // PR #51: 鍵業態専用 (他業態は "" のまま、保存時 0)
    locksmith_car_lp_email_count: "", locksmith_inhouse_count: "",
    locksmith_repeat_count: "", locksmith_revisit_count: "",
    locksmith_construction_cost: "", locksmith_commission_fee: "",
    // PR #52: ロード業態専用 獲得 7 内訳 (他業態は "" のまま、保存時 0)
    road_ad_count: "", road_repeat_count: "", road_referral_count: "",
    road_revisit_count: "", road_wellnest_count: "",
    road_seo_count: "", road_insurance_count: "",
    // PR #53: 探偵業態専用 面談ファネル (他業態は "" のまま、保存時 0)
    detective_meeting_count: "", detective_cancel_count: "",
    // PR #57: 探偵業態 入電 4 内訳 (他業態は "" のまま、保存時 0)
    detective_phone_only_call_count: "", detective_mail_only_call_count: "",
    detective_line_only_call_count: "", detective_wrong_call_count: "",
    // PR #58b: 探偵業態 獲得 6 内訳 + 販管費 (他業態は "" のまま、保存時 0)
    detective_phone_uwaki_acquisition_count: "", detective_phone_other_acquisition_count: "",
    detective_mail_uwaki_acquisition_count: "",  detective_mail_other_acquisition_count: "",
    detective_line_uwaki_acquisition_count: "",  detective_line_other_acquisition_count: "",
    detective_selling_admin_cost: "",
    // PR #58c: ロード業態 入電 7 内訳 + 保険売上 2 分割 + 販管費 (他業態は "" のまま、保存時 0)
    road_ad_call_count: "", road_repeat_call_count: "", road_referral_call_count: "",
    road_revisit_call_count: "", road_wellnest_call_count: "",
    road_seo_call_count: "", road_insurance_call_count: "",
    road_insurance_revenue: "", road_non_insurance_revenue: "",
    road_selling_admin_cost: "",
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

  // PR c6: 確定送信ボタンの視覚 feedback state machine
  //   idle    : "確定送信 →"
  //   sending : "送信中..."
  //   done    : "✓ 送信完了" (2 秒後 idle へ)
  const [submitFeedback, setSubmitFeedback] = useState<"idle" | "sending" | "done">("idle");

  const labels = BUSINESS_LABELS[category];

  const setField = (k: InputFieldKey, v: InputValue) => {
    setState((s) => ({ ...s, [k]: v }));
    setSaveResult("idle");
  };

  const setMeta = (k: "area_id" | "year" | "month" | "day", v: string | number) => {
    setState((s) => ({ ...s, [k]: v }));
    setSaveResult("idle");
  };

  // PR c6: カレンダーから「年/月/日」を一括変更 (3 値とも変わる可能性: 別月セルをタップした時)
  const handleCalendarChange = (y: number, m: number, d: number) => {
    setState((s) => ({ ...s, year: y, month: m, day: d }));
    setSaveResult("idle");
  };

  // PR c6: has-data days = 編集モードで既に DB に行があれば as_of_day の日のみ ●
  //   (Q1=A 採用: 月単位 1 行 schema のため、per-day 追跡は schema 変更が必要、
  //    本 PR では as_of_day の日にだけドット表示)
  const hasDataDays = useMemo(
    () => existingAsOfDay !== null ? new Set([existingAsOfDay]) : new Set<number>(),
    [existingAsOfDay]
  );

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
            switchboard_count: numOrEmpty(summary.switchboard_count),
            // PR #51: 鍵業態専用 6 列
            locksmith_car_lp_email_count: numOrEmpty(summary.locksmith_car_lp_email_count),
            locksmith_inhouse_count: numOrEmpty(summary.locksmith_inhouse_count),
            locksmith_repeat_count: numOrEmpty(summary.locksmith_repeat_count),
            locksmith_revisit_count: numOrEmpty(summary.locksmith_revisit_count),
            locksmith_construction_cost: numOrEmpty(summary.locksmith_construction_cost),
            locksmith_commission_fee: numOrEmpty(summary.locksmith_commission_fee),
            // PR #52: ロード業態専用 獲得 7 内訳
            road_ad_count: numOrEmpty(summary.road_ad_count),
            road_repeat_count: numOrEmpty(summary.road_repeat_count),
            road_referral_count: numOrEmpty(summary.road_referral_count),
            road_revisit_count: numOrEmpty(summary.road_revisit_count),
            road_wellnest_count: numOrEmpty(summary.road_wellnest_count),
            road_seo_count: numOrEmpty(summary.road_seo_count),
            road_insurance_count: numOrEmpty(summary.road_insurance_count),
            // PR #53: 探偵業態専用 面談ファネル
            detective_meeting_count: numOrEmpty(summary.detective_meeting_count),
            detective_cancel_count: numOrEmpty(summary.detective_cancel_count),
            // PR #57: 探偵業態 入電 4 内訳
            detective_phone_only_call_count: numOrEmpty(summary.detective_phone_only_call_count),
            detective_mail_only_call_count: numOrEmpty(summary.detective_mail_only_call_count),
            detective_line_only_call_count: numOrEmpty(summary.detective_line_only_call_count),
            detective_wrong_call_count: numOrEmpty(summary.detective_wrong_call_count),
            // PR #58b: 探偵業態 獲得 6 内訳 + 販管費
            detective_phone_uwaki_acquisition_count: numOrEmpty(summary.detective_phone_uwaki_acquisition_count),
            detective_phone_other_acquisition_count: numOrEmpty(summary.detective_phone_other_acquisition_count),
            detective_mail_uwaki_acquisition_count: numOrEmpty(summary.detective_mail_uwaki_acquisition_count),
            detective_mail_other_acquisition_count: numOrEmpty(summary.detective_mail_other_acquisition_count),
            detective_line_uwaki_acquisition_count: numOrEmpty(summary.detective_line_uwaki_acquisition_count),
            detective_line_other_acquisition_count: numOrEmpty(summary.detective_line_other_acquisition_count),
            detective_selling_admin_cost: numOrEmpty(summary.detective_selling_admin_cost),
            // PR #58c: ロード業態 入電 7 内訳 + 保険売上 2 分割 + 販管費
            road_ad_call_count: numOrEmpty(summary.road_ad_call_count),
            road_repeat_call_count: numOrEmpty(summary.road_repeat_call_count),
            road_referral_call_count: numOrEmpty(summary.road_referral_call_count),
            road_revisit_call_count: numOrEmpty(summary.road_revisit_call_count),
            road_wellnest_call_count: numOrEmpty(summary.road_wellnest_call_count),
            road_seo_call_count: numOrEmpty(summary.road_seo_call_count),
            road_insurance_call_count: numOrEmpty(summary.road_insurance_call_count),
            road_insurance_revenue: numOrEmpty(summary.road_insurance_revenue),
            road_non_insurance_revenue: numOrEmpty(summary.road_non_insurance_revenue),
            road_selling_admin_cost: numOrEmpty(summary.road_selling_admin_cost),
          }));
          const aod = Number(summary.as_of_day);
          setExistingAsOfDay(Number.isInteger(aod) ? aod : null);
        } else {
          // 既存データなし → 入力フィールドをクリア (メタは維持)
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
            switchboard_count: "",
            locksmith_car_lp_email_count: "", locksmith_inhouse_count: "",
            locksmith_repeat_count: "", locksmith_revisit_count: "",
            locksmith_construction_cost: "", locksmith_commission_fee: "",
            road_ad_count: "", road_repeat_count: "", road_referral_count: "",
            road_revisit_count: "", road_wellnest_count: "",
            road_seo_count: "", road_insurance_count: "",
            detective_meeting_count: "", detective_cancel_count: "",
            detective_phone_only_call_count: "", detective_mail_only_call_count: "",
            detective_line_only_call_count: "", detective_wrong_call_count: "",
            detective_phone_uwaki_acquisition_count: "", detective_phone_other_acquisition_count: "",
            detective_mail_uwaki_acquisition_count: "",  detective_mail_other_acquisition_count: "",
            detective_line_uwaki_acquisition_count: "",  detective_line_other_acquisition_count: "",
            detective_selling_admin_cost: "",
            road_ad_call_count: "", road_repeat_call_count: "", road_referral_call_count: "",
            road_revisit_call_count: "", road_wellnest_call_count: "",
            road_seo_call_count: "", road_insurance_call_count: "",
            road_insurance_revenue: "", road_non_insurance_revenue: "",
            road_selling_admin_cost: "",
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

  // PR c6: handleSave を Promise<boolean> 化 (auto-save hook 連動のため)
  //   - true: 保存成功 / false: validation 失敗 or API エラー
  //   - useCallback で参照固定 (auto-save の useEffect 依存配列対策)
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!validateAll(state)) {
      setSaveResult("error");
      setSaveMsg("入力内容を確認してください");
      return false;
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
        switchboard_count: numOrZero(state.switchboard_count),
        // PR #51: 鍵業態専用 6 列 (他業態は state="" → 0 で保存)
        locksmith_car_lp_email_count: numOrZero(state.locksmith_car_lp_email_count),
        locksmith_inhouse_count: numOrZero(state.locksmith_inhouse_count),
        locksmith_repeat_count: numOrZero(state.locksmith_repeat_count),
        locksmith_revisit_count: numOrZero(state.locksmith_revisit_count),
        locksmith_construction_cost: numOrZero(state.locksmith_construction_cost),
        locksmith_commission_fee: numOrZero(state.locksmith_commission_fee),
        // PR #52: ロード業態専用 獲得 7 内訳 (他業態は state="" → 0 で保存)
        road_ad_count: numOrZero(state.road_ad_count),
        road_repeat_count: numOrZero(state.road_repeat_count),
        road_referral_count: numOrZero(state.road_referral_count),
        road_revisit_count: numOrZero(state.road_revisit_count),
        road_wellnest_count: numOrZero(state.road_wellnest_count),
        road_seo_count: numOrZero(state.road_seo_count),
        road_insurance_count: numOrZero(state.road_insurance_count),
        // PR #53: 探偵業態専用 面談ファネル (他業態は state="" → 0 で保存)
        detective_meeting_count: numOrZero(state.detective_meeting_count),
        detective_cancel_count: numOrZero(state.detective_cancel_count),
        // PR #57: 探偵業態 入電 4 内訳 (他業態は state="" → 0 で保存)
        detective_phone_only_call_count: numOrZero(state.detective_phone_only_call_count),
        detective_mail_only_call_count: numOrZero(state.detective_mail_only_call_count),
        detective_line_only_call_count: numOrZero(state.detective_line_only_call_count),
        detective_wrong_call_count: numOrZero(state.detective_wrong_call_count),
        // PR #58b: 探偵業態 獲得 6 内訳 + 販管費 (他業態は state="" → 0 で保存)
        detective_phone_uwaki_acquisition_count: numOrZero(state.detective_phone_uwaki_acquisition_count),
        detective_phone_other_acquisition_count: numOrZero(state.detective_phone_other_acquisition_count),
        detective_mail_uwaki_acquisition_count: numOrZero(state.detective_mail_uwaki_acquisition_count),
        detective_mail_other_acquisition_count: numOrZero(state.detective_mail_other_acquisition_count),
        detective_line_uwaki_acquisition_count: numOrZero(state.detective_line_uwaki_acquisition_count),
        detective_line_other_acquisition_count: numOrZero(state.detective_line_other_acquisition_count),
        detective_selling_admin_cost: numOrZero(state.detective_selling_admin_cost),
        // PR #58c: ロード業態 入電 7 内訳 + 保険売上 2 分割 + 販管費 (他業態は state="" → 0 で保存)
        road_ad_call_count: numOrZero(state.road_ad_call_count),
        road_repeat_call_count: numOrZero(state.road_repeat_call_count),
        road_referral_call_count: numOrZero(state.road_referral_call_count),
        road_revisit_call_count: numOrZero(state.road_revisit_call_count),
        road_wellnest_call_count: numOrZero(state.road_wellnest_call_count),
        road_seo_call_count: numOrZero(state.road_seo_call_count),
        road_insurance_call_count: numOrZero(state.road_insurance_call_count),
        road_insurance_revenue: numOrZero(state.road_insurance_revenue),
        road_non_insurance_revenue: numOrZero(state.road_non_insurance_revenue),
        road_selling_admin_cost: numOrZero(state.road_selling_admin_cost),
        // auto 計算結果のうち、既存 DB 列に対応するものを送信
        // (新規 DB 列なしの total_construction_count / actual_construction_cost / profit は送らない)
        total_revenue: Math.round(calc.total_revenue),
        total_count: Math.round(calc.total_response_count),
        unit_price: Math.round(calc.unit_price),
        call_unit_price: Math.round(calc.call_unit_price),
        cpa: Math.round(calc.cpa),
        conv_rate: Math.round(calc.conv_rate * 10) / 10,
        help_unit_price: Math.round(calc.help_unit_price),
        // PR #51 (論点 1 案 A): 鍵業態は工事費・手数料が新カラムにあるため calc.total_profit
        // (total_labor_cost / sales_outsourcing_cost 参照) では正しく算出されない。
        // category-aware に locksmith 専用式で計算。
        total_profit: category === "locksmith"
          ? Math.round(computeLocksmithProfit(state))
          : Math.round(calc.total_profit),
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
      return true;
    } catch (e) {
      setSaveResult("error");
      setSaveMsg(`保存失敗: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setSaving(false);
    }
  }, [state, validateAll, clearErrors, calc, category]);

  // PR c6: state 変更 → 500ms debounce → 自動保存
  //   - isLoadingExisting 中は enabled=false で skip + indicator "読み込み中..."
  //   - triggerSave: 確定送信ボタンが debounce 待たず即時 save するために利用
  const { status: autoSaveStatus, triggerSave } = useDebouncedAutoSave({
    state, enabled: !isLoadingExisting, saveFn: handleSave,
  });

  // PR c6: 確定送信 — auto-save と同じ saveFn を即時 trigger + 視覚 feedback
  const handleConfirmSubmit = async () => {
    setSubmitFeedback("sending");
    const ok = await triggerSave();
    if (ok) {
      setSubmitFeedback("done");
      setTimeout(() => setSubmitFeedback("idle"), 2500);
    } else {
      setSubmitFeedback("idle");
    }
  };

  // PR c6: 旧 yearOptions / monthOptions / dayOptions は EntryCalendar に置換のため削除

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5f2", paddingBottom: 100 }}>
      {/* ヘッダー */}
      <div style={{ background: "linear-gradient(135deg, #059669, #047857)" }}>
        {/* PR #45: 業態切替タブ。Dashboard と同スタイルで統一。
            URL 変更で page.tsx 再描画 → EntryForm の category prop 更新 →
            state がリセットされる (タブ切替時はフォーム値破棄) */}
        <div style={{
          display: "flex", gap: 4, padding: "8px 24px 0", overflowX: "auto",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
        }}>
          {BUSINESSES.map((b) => {
            const isActive = b.id === category;
            return (
              <Link
                key={b.id}
                href={`/entry?category=${b.id}`}
                style={{
                  padding: "6px 14px", borderRadius: "8px 8px 0 0",
                  fontSize: 11, fontWeight: 700, textDecoration: "none",
                  background: isActive ? "rgba(255,255,255,0.25)" : "transparent",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.55)",
                  whiteSpace: "nowrap",
                }}
              >
                {b.label}
              </Link>
            );
          })}
        </div>
        <div style={{ padding: "14px 24px 18px" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>
            月次データ入力 — {CATEGORY_LABELS[category]}
          </h1>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
            仕様書 31 フィールド (入力 20 / 自動計算 11)。
            入力日（日付）時点までの累積データを入力してください。下部の「保存」ボタンで一括登録します。
          </p>
        </div>
      </div>

      <div style={{ padding: 20, maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* PR c6: エリア + カレンダー + auto-save indicator。
            旧 3 select (年/月/日) を EntryCalendar 1 つに統合。 */}
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #d1fae5", padding: 14 }}>
          {/* エリア + 自動保存 indicator (mobile mockup 風、横並び) */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
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
            </div>
            {/* PR c6: 自動保存 indicator (mockup .save-status pattern) */}
            <AutoSaveBadge status={autoSaveStatus} />
          </div>

          {/* PR c6: カレンダー UI (旧 3 select 年/月/日 を統合) */}
          <EntryCalendar
            year={state.year}
            month={state.month}
            day={state.day}
            hasDataDays={hasDataDays}
            onChange={handleCalendarChange}
            isLoading={isLoadingExisting}
          />

          {/* PR #44: 編集モード/新規入力モード/読込中のステータスバッジ */}
          <ModeBadge
            isLoading={isLoadingExisting}
            existingAsOfDay={existingAsOfDay}
            currentDay={state.day}
          />
          <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 8, lineHeight: 1.5 }}>
            ※ 編集中の値は保存前にエリアを変更すると失われます。
            日付の変更はカレンダーから行ってください (年/月をまたぐ変更で再読込)。
          </p>
        </div>

        {/* PR #48b c3: 業態別フォーム routing 層。
            現状は全業態 WaterForm にルーティング (動作変更ゼロを担保)。
            c4 で electric → ElectricForm、locksmith → LocksmithForm に分岐。
            c5 で road → RoadForm、detective → DetectiveForm に分岐。 */}
        {renderBusinessForm(category, {
          state, setField, validateField, errors, labels, calc,
        })}
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
        {/* PR c6: 確定送信ボタン (旧「保存」から rename + 視覚 feedback) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <button type="button" onClick={handleConfirmSubmit}
            disabled={saving || submitFeedback === "sending"}
            style={{
              padding: "10px 28px", fontSize: 13, fontWeight: 800,
              border: "none", borderRadius: 8,
              background: submitFeedback === "done" ? "#059669"
                : (saving || submitFeedback === "sending") ? "#9ca3af"
                : "#1B5E3F",
              color: "#fff",
              cursor: (saving || submitFeedback === "sending") ? "default" : "pointer",
              boxShadow: "0 2px 8px rgba(27,94,63,0.25)",
              transition: "background 0.2s ease",
              minWidth: 140,
            }}>
            {submitFeedback === "done" ? "✓ 送信完了"
              : submitFeedback === "sending" ? "送信中..."
              : "確定送信 →"}
          </button>
          <span style={{ fontSize: 10, color: "#6b7280" }}>
            {state.month}月{state.day}日のデータとして保存
          </span>
        </div>
      </div>
    </div>
  );
}

// PR c6: 自動保存 indicator (mockup .save-status pattern)
function AutoSaveBadge({ status }: { status: "idle" | "loading" | "saving" | "saved" | "error" }) {
  // status ごとの表示
  const config: Record<typeof status, { label: string; bg: string; color: string }> = {
    idle:    { label: "—",            bg: "transparent",  color: "#9ca3af" },
    loading: { label: "読み込み中...", bg: "#fef3c7",     color: "#854d0e" },
    saving:  { label: "保存中...",    bg: "#dbeafe",     color: "#1e40af" },
    saved:   { label: "✓ 自動保存済",  bg: "#d1fae5",     color: "#065f46" },
    error:   { label: "⚠ 保存失敗",    bg: "#fee2e2",     color: "#991b1b" },
  };
  const c = config[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", fontSize: 11, borderRadius: 4,
      background: c.bg, color: c.color,
      fontWeight: 500, minHeight: 22, whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
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
