"use client";
// 新フォーム /entry のメインコンテナ。
//
// 仕様書: docs/specs/spec-form-redesign.md §4
// 設計:
//   - 入力 20 + auto 11 = 31 フィールド (仕様書通り)
//   - 自動計算は useFormCalculations で useMemo (リアクティブ)
//   - バリデーションは onBlur + 保存時 (useFormValidation)
//
// PR c90-2: データモデル変更 — 累積置換から日次差分へ。
//   - 保存は POST /api/entries (日次差分入力) → /api/entries route が c90-1 の
//     aggregateMonthlySummary を後段で呼び出し、monthly_summaries を再集計
//   - 旧経路 (/api/import-monthly) は /import ページ専用に縮退
//   - 既存データの load は /api/entries で当該月の全行を取得し、選択 day の
//     entry を find/prefill (該当 day に entry 無ければフォーム空欄)
//   - カレンダー ● マーカーは全 entry_date を反映 (旧: as_of_day 単一)
//   - mode badge: 当該 day に entry あり → "修正モード" yellow、なし → "新規入力" green
//   - フォーム下部に CumulativePreview を mount (月初〜選択日累積を /api/monthly-summary で表示)
//
// auto-save は PR c89-p1 で OFF 維持 (useDebouncedAutoSave.AUTOSAVE_DISABLED_C89_P1=true)。
// c90-2 でも絶対に変更しない (致命的データ破壊事故の再発防止)。

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormCalculations } from "./hooks/useFormCalculations";
import { useFormValidation } from "./hooks/useFormValidation";
import { useDebouncedAutoSave, type SaveOutcome } from "./hooks/useDebouncedAutoSave";
import EntryCalendar from "./components/EntryCalendar";
import CumulativePreview from "./components/CumulativePreview";
import DailyReportModal from "./components/DailyReportModal"; // PR c95-A-3
import WaterForm from "./components/forms/WaterForm";
import ElectricForm from "./components/forms/ElectricForm";
import LocksmithForm from "./components/forms/LocksmithForm";
import RoadForm from "./components/forms/RoadForm";
import DetectiveForm from "./components/forms/DetectiveForm";
import { BUSINESS_LABELS, type BusinessCategory, type FieldLabels } from "../lib/business-labels";
import { BUSINESSES } from "../lib/businesses";
import type { DailyEntry } from "../lib/calculations";
import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue, HelpStaffEntry } from "./types";
import { cleanHelpStaffForSave } from "./lib/helpStaffUtils";

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
  // PR c95-A-2: HELP は配列のため専用 setter。SectionHelp が行追加/削除/更新を集約。
  setHelpStaff: (next: HelpStaffEntry[]) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
  // PR c94-C-2: ⑥ 体制の前回スナップショット (月内直前 entry 由来、null は継承なし)
  vehicleSnapshot: number | null;
  traineeSnapshot: number | null;
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
    // PR c95-D-1 (slice 1+2): water のみ UI 入力欄あり、他業態は "" のまま保存時 0
    consultant_fee: "",
    ad_cost: "", call_count: "", acquisition_count: "",
    construction_count: "", // PR c93-2: 新規入力 (対応ベース)
    outsourced_construction_count: "", internal_construction_count: "",
    outsourced_construction_cost: "", internal_construction_profit: "",
    // PR c95-A-2: HELP を担当者別配列に置換。emptyState では空配列 (G4)。
    help_staff: [],
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
    // PR c94-C-2: ⑥ 体制
    vehicle_count: "", trainee_count: "",
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

  // PR c90-2: 当月 entries 全件キャッシュ ("YYYY-MM-DD" → DailyEntry)。
  //   load effect (Q1=a 分離設計): Effect A が month 変化で entries[] を fetch して
  //   この Map にキャッシュ、Effect B が state.day 変化時にここから find して prefill する。
  //   カレンダー ● マーカー (hasDataDays) もこの Map から導出 (旧: existingAsOfDay 単一)。
  const [entriesByDate, setEntriesByDate] = useState<Map<string, DailyEntry>>(() => new Map());

  // PR c90-2: CumulativePreview が再 fetch するための trigger。
  //   確定送信成功時に ++ することで aggregation 後の最新 monthly_summaries を再表示。
  const [cumulativeRefetchCount, setCumulativeRefetchCount] = useState(0);

  // PR c6: 確定送信ボタンの視覚 feedback state machine
  //   idle    : "確定送信 →"
  //   sending : "送信中..."
  //   done    : "✓ 送信完了" (2 秒後 idle へ)
  const [submitFeedback, setSubmitFeedback] = useState<"idle" | "sending" | "done">("idle");

  // PR c95-A-3: 日報モーダル表示 state。confirm 成功後 (done feedback 完了後、G8) と
  //   ヘッダー「📋 日報を表示」pill (G12 常時表示) の両方から open される。
  const [showDailyReport, setShowDailyReport] = useState(false);

  const labels = BUSINESS_LABELS[category];

  const setField = (k: InputFieldKey, v: InputValue) => {
    setState((s) => ({ ...s, [k]: v }));
    setSaveResult("idle");
  };

  // PR c95-A-2: HELP は配列のため専用 setter。SectionHelp が行追加/削除/更新を集約。
  const setHelpStaff = (next: HelpStaffEntry[]) => {
    setState((s) => ({ ...s, help_staff: next }));
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

  // PR c90-2: カレンダー ● マーカーを entries 全行から導出。
  //   旧 (PR c6): existingAsOfDay 単一値から Set([asOfDay]) 生成 (1 ヶ月に最大 1 ドット)
  //   新       : entriesByDate Map の key (YYYY-MM-DD) から月内全 day を抽出
  //   c90 で entries が日次差分の真実のソースになったため、保存されている全日付に
  //   ドットを表示するのが正しい。
  const hasDataDays = useMemo(() => {
    const days = new Set<number>();
    for (const dateStr of entriesByDate.keys()) {
      // "2026-05-15" → 15
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const d = Number(parts[2]);
        if (Number.isInteger(d) && d >= 1 && d <= 31) days.add(d);
      }
    }
    return days;
  }, [entriesByDate]);

  // PR c90-2: 当該 day に既存 entry が DB にあるか (mode badge の判定基準、Q2=a)。
  //   true → "修正モード" yellow、false → "新規入力モード" green。
  //   過去/当日/未来の区別ではなく entry 存在で判定 (今日の entry を再編集する場合も
  //   修正モードになる、論理的に明快)。
  const currentDateStr = useMemo(() => {
    const m = String(state.month).padStart(2, "0");
    const d = String(state.day).padStart(2, "0");
    return `${state.year}-${m}-${d}`;
  }, [state.year, state.month, state.day]);
  const hasExistingEntryForCurrentDay = entriesByDate.has(currentDateStr);

  // PR c94-C-2: ⑥ 体制の「前回スナップショット」算出。
  //   現在選択日より前の最大日付 entry の vehicle_count / trainee_count を継承元にする。
  //   "YYYY-MM-DD" は辞書順比較が日付順と一致。月の最初の入力日は継承元なし (null)。
  const shiftSnapshot = useMemo(() => {
    let bestDate = "";
    let best: DailyEntry | undefined;
    for (const [dateStr, entry] of entriesByDate) {
      if (dateStr < currentDateStr && dateStr > bestDate) {
        bestDate = dateStr;
        best = entry;
      }
    }
    return {
      vehicle: best?.vehicle_count ?? null,
      trainee: best?.trainee_count ?? null,
    };
  }, [entriesByDate, currentDateStr]);

  // PR c92-2b: 進捗バッジ計算 (Q2=b 採用 — 今日までの経過日数を分母に使用)。
  //   現在月 (today.year/month == state.year/month) なら today.date を分母 (=「現時点で
  //   どれだけ catch-up できているか」を示す actionable 指標)。
  //   過去/未来月選択時は月内総日数を分母にフォールバック (経過日数概念が成立しない)。
  //   分子 = entriesByDate.size (当月内で entry が DB に保存されている日数)。
  const progressBadge = useMemo(() => {
    const today = new Date();
    const isCurrentMonth =
      today.getFullYear() === state.year && (today.getMonth() + 1) === state.month;
    const daysInMonth = new Date(state.year, state.month, 0).getDate();
    const denominator = isCurrentMonth ? today.getDate() : daysInMonth;
    const inputted = entriesByDate.size;
    const percent = denominator > 0 ? Math.round((inputted / denominator) * 100) : 0;
    return { inputted, denominator, percent, isCurrentMonth };
  }, [state.year, state.month, entriesByDate]);

  // existingAsOfDay は legacy compat 用に保持 (mode banner で「最終更新は X 日」表示用)
  // c90-2 では entriesByDate から MAX(day) で再計算する代替表示も検討余地ありだが、
  // 当面は monthly_summaries.as_of_day を fetch して同様の意味で扱う。
  void existingAsOfDay; // 旧 ModeBadge へ受け渡し用 (削除しない)

  // PR c90-2 Effect A (Q1=a 分離設計): area/year/month/category 変化で当月の
  //   entries 全件を fetch し、entriesByDate Map にキャッシュする。
  //   Effect B が state.day に応じて Map から該当 entry を find/prefill する。
  //   旧 (PR #44): /api/monthly-summary fetch → 月次累積を全フィールドに展開
  //              (累積置換モデル前提、c89-p1 で破壊事故を引き起こした構造)
  //   新       : /api/entries fetch → 日次差分の配列を取得、day 変化で個別 prefill
  //   day を依存配列に含めない設計は維持 (1 ヶ月分の entries を 1 度だけ load する)。
  //   存在 day のサブセットはカレンダー ● で可視化、mode badge も entry 存在で判定。
  useEffect(() => {
    let cancelled = false;
    async function fetchMonthEntries() {
      setIsLoadingExisting(true);
      try {
        const params = new URLSearchParams({
          area: state.area_id,
          year: String(state.year),
          month: String(state.month),
          category,
        });
        const res = await fetch(`/api/entries?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json() as { entries?: DailyEntry[] };
        if (cancelled) return;

        const entries = Array.isArray(json.entries) ? json.entries : [];
        const map = new Map<string, DailyEntry>();
        for (const e of entries) {
          if (e && typeof e.date === "string") map.set(e.date, e);
        }
        setEntriesByDate(map);

        // existingAsOfDay は最終 entry_date を表示用に流用 (mode banner の参考表示)
        const maxDay = entries.reduce<number | null>((acc, e) => {
          const d = Number(e.date?.slice(8, 10));
          if (!Number.isInteger(d)) return acc;
          return acc === null || d > acc ? d : acc;
        }, null);
        setExistingAsOfDay(maxDay);

        clearErrors();
      } catch (e) {
        if (!cancelled) {
          setEntriesByDate(new Map());
          setExistingAsOfDay(null);
        }
        console.error("/entry 当月 entries 取得エラー:", e);
      } finally {
        if (!cancelled) setIsLoadingExisting(false);
      }
    }
    fetchMonthEntries();
    return () => { cancelled = true; };
    // 注意: state.day は意図的に依存配列に含めない (Effect B が day を扱う)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.area_id, state.year, state.month, category]);

  // PR c90-2 Effect B: state.day 変化 (または entriesByDate 更新) で該当 entry を
  //   find して全フィールド prefill。該当 day に entry なし → 全フィールド空欄。
  //   markClean(next) で auto-save baseline 同期 (c89-p1 で auto-save は OFF だが
  //   将来再活性化時のため belt+suspenders として保持)。
  useEffect(() => {
    const entry = entriesByDate.get(currentDateStr);
    if (entry) {
      // 該当 day に既存 entry あり → 値をプレロード (修正モード)
      setState((s) => {
        const next: EntryFormState = {
          ...s,
          outsourced_sales_revenue: numOrEmpty(entry.outsourced_sales_revenue),
          internal_staff_revenue: numOrEmpty(entry.internal_staff_revenue),
          outsourced_response_count: numOrEmpty(entry.outsourced_response_count),
          internal_staff_response_count: numOrEmpty(entry.internal_staff_response_count),
          repeat_count: numOrEmpty(entry.repeat_count),
          revisit_count: numOrEmpty(entry.revisit_count),
          review_count: numOrEmpty(entry.review_count),
          total_labor_cost: numOrEmpty(entry.total_labor_cost),
          material_cost: numOrEmpty(entry.material_cost),
          sales_outsourcing_cost: numOrEmpty(entry.sales_outsourcing_cost),
          card_processing_fee: numOrEmpty(entry.card_processing_fee),
          // PR c95-D-1 (slice 1+2): water のみ UI 表示、他業態の既存行は consultant_fee 未保存→ "" になる
          consultant_fee: numOrEmpty(entry.consultant_fee),
          ad_cost: numOrEmpty(entry.ad_cost),
          call_count: numOrEmpty(entry.call_count),
          acquisition_count: numOrEmpty(entry.acquisition_count),
          construction_count: numOrEmpty(entry.construction_count), // PR c93-2
          outsourced_construction_count: numOrEmpty(entry.outsourced_construction_count),
          internal_construction_count: numOrEmpty(entry.internal_construction_count),
          outsourced_construction_cost: numOrEmpty(entry.outsourced_construction_cost),
          internal_construction_profit: numOrEmpty(entry.internal_construction_profit),
          // PR c95-A-2: HELP は help_staff 配列を優先、空または未保存なら旧 scalar から 1 行生成
          //   (自動移行行)、scalar も 0 なら空配列。G1 案 (b) で entries.data には併存している前提。
          help_staff: Array.isArray(entry.help_staff) && entry.help_staff.length > 0
            ? entry.help_staff.map((s) => ({
                staff_name: s.staff_name ?? "",
                help_sales: numOrEmpty(s.help_sales),
                help_count: numOrEmpty(s.help_count),
                help_close_count: numOrEmpty(s.help_close_count),
              }))
            : (numOrZero(numOrEmpty(entry.help_count)) > 0 || numOrZero(numOrEmpty(entry.help_revenue)) > 0
                ? [{
                    staff_name: "(不明・自動移行)",
                    help_sales: numOrEmpty(entry.help_revenue),
                    help_count: numOrEmpty(entry.help_count),
                    help_close_count: "" as InputValue,
                  }]
                : []),
          switchboard_count: numOrEmpty(entry.switchboard_count),
          locksmith_car_lp_email_count: numOrEmpty(entry.locksmith_car_lp_email_count),
          locksmith_inhouse_count: numOrEmpty(entry.locksmith_inhouse_count),
          locksmith_repeat_count: numOrEmpty(entry.locksmith_repeat_count),
          locksmith_revisit_count: numOrEmpty(entry.locksmith_revisit_count),
          locksmith_construction_cost: numOrEmpty(entry.locksmith_construction_cost),
          locksmith_commission_fee: numOrEmpty(entry.locksmith_commission_fee),
          road_ad_count: numOrEmpty(entry.road_ad_count),
          road_repeat_count: numOrEmpty(entry.road_repeat_count),
          road_referral_count: numOrEmpty(entry.road_referral_count),
          road_revisit_count: numOrEmpty(entry.road_revisit_count),
          road_wellnest_count: numOrEmpty(entry.road_wellnest_count),
          road_seo_count: numOrEmpty(entry.road_seo_count),
          road_insurance_count: numOrEmpty(entry.road_insurance_count),
          detective_meeting_count: numOrEmpty(entry.detective_meeting_count),
          detective_cancel_count: numOrEmpty(entry.detective_cancel_count),
          detective_phone_only_call_count: numOrEmpty(entry.detective_phone_only_call_count),
          detective_mail_only_call_count: numOrEmpty(entry.detective_mail_only_call_count),
          detective_line_only_call_count: numOrEmpty(entry.detective_line_only_call_count),
          detective_wrong_call_count: numOrEmpty(entry.detective_wrong_call_count),
          detective_phone_uwaki_acquisition_count: numOrEmpty(entry.detective_phone_uwaki_acquisition_count),
          detective_phone_other_acquisition_count: numOrEmpty(entry.detective_phone_other_acquisition_count),
          detective_mail_uwaki_acquisition_count: numOrEmpty(entry.detective_mail_uwaki_acquisition_count),
          detective_mail_other_acquisition_count: numOrEmpty(entry.detective_mail_other_acquisition_count),
          detective_line_uwaki_acquisition_count: numOrEmpty(entry.detective_line_uwaki_acquisition_count),
          detective_line_other_acquisition_count: numOrEmpty(entry.detective_line_other_acquisition_count),
          detective_selling_admin_cost: numOrEmpty(entry.detective_selling_admin_cost),
          road_ad_call_count: numOrEmpty(entry.road_ad_call_count),
          road_repeat_call_count: numOrEmpty(entry.road_repeat_call_count),
          road_referral_call_count: numOrEmpty(entry.road_referral_call_count),
          road_revisit_call_count: numOrEmpty(entry.road_revisit_call_count),
          road_wellnest_call_count: numOrEmpty(entry.road_wellnest_call_count),
          road_seo_call_count: numOrEmpty(entry.road_seo_call_count),
          road_insurance_call_count: numOrEmpty(entry.road_insurance_call_count),
          road_insurance_revenue: numOrEmpty(entry.road_insurance_revenue),
          road_non_insurance_revenue: numOrEmpty(entry.road_non_insurance_revenue),
          road_selling_admin_cost: numOrEmpty(entry.road_selling_admin_cost),
          // PR c94-C-2: ⑥ 体制
          vehicle_count: numOrEmpty(entry.vehicle_count),
          trainee_count: numOrEmpty(entry.trainee_count),
        };
        markClean(next); // baseline 同期 (c89-p1 で auto-save OFF だが将来防御)
        return next;
      });
    } else {
      // 該当 day に entry なし → 全入力フィールド空欄 (新規入力モード)
      setState((s) => {
        const next: EntryFormState = {
          ...s,
          outsourced_sales_revenue: "", internal_staff_revenue: "",
          outsourced_response_count: "", internal_staff_response_count: "",
          repeat_count: "", revisit_count: "", review_count: "",
          total_labor_cost: "", material_cost: "", sales_outsourcing_cost: "", card_processing_fee: "",
          // PR c95-D-1 (slice 1+2): water のみ UI 入力欄あり、他業態は "" のまま保存時 0
          consultant_fee: "",
          ad_cost: "", call_count: "", acquisition_count: "",
          construction_count: "", // PR c93-2
          outsourced_construction_count: "", internal_construction_count: "",
          outsourced_construction_cost: "", internal_construction_profit: "",
          help_staff: [], // PR c95-A-2: HELP 配列リセット
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
          // PR c94-C-2: ⑥ 体制
          vehicle_count: "", trainee_count: "",
        };
        markClean(next);
        return next;
      });
    }
    clearErrors();
    // markClean / clearErrors は useCallback で安定 (依存に含めない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDateStr, entriesByDate]);

  // PR c6 / PR c90-2: handleSave を Promise<SaveOutcome> 化 (auto-save hook 連動 + 確定送信ボタン共通)。
  //   戻り値: "success" / "skip" (validation 失敗) / "error" (API 失敗)
  //
  // PR c90-2 仕様変更:
  //   - POST 先を /api/import-monthly (累積置換) → /api/entries (日次差分) に切替
  //   - payload は DailyEntry shape: state.year-state.month-state.day を date として、
  //     入力 50+ フィールドを optional numeric として格納
  //   - /api/entries route 後段で c90-1 の aggregateMonthlySummary が呼ばれて
  //     monthly_summaries が再集計される (副作用)
  //   - 確定送信成功後、cumulativeRefetchCount を ++ して CumulativePreview を更新
  //   - read-back verify は monthly_summaries を読み、aggregation 完了を確認
  //
  // auto-save は AUTOSAVE_DISABLED_C89_P1=true で OFF (絶対変更しない)。
  // 確定送信ボタンのみが本関数を triggerSave 経由で呼ぶ。
  //
  // useCallback で参照固定 (useDebouncedAutoSave の effect 依存配列対策、c89-p1 後も保持)。
  const handleSave = useCallback(async (): Promise<SaveOutcome> => {
    if (!validateAll(state)) {
      setSaveResult("error");
      setSaveMsg("入力内容を確認してください");
      return "skip";
    }

    // PR c95-A-2: HELP 担当者配列を整形 (G4: 全項目空の行を除外、G5: 数値入力時 staff_name 必須)。
    //   ここで判定して fail-fast。本体送信は派生 scalar 含む二重書込 (G1 案 b)。
    //   ロジックは helpStaffUtils に集約 (純関数、test:integration:c95-a-2-help-staff で検証)。
    const { cleaned: helpStaffWrite, nameMissingIndex, sumSales: helpRevenueSum, sumCount: helpCountSum } =
      cleanHelpStaffForSave(state.help_staff);
    if (nameMissingIndex >= 0) {
      setSaveResult("error");
      setSaveMsg(`HELP 担当者 ${nameMissingIndex + 1}: 数値入力時は氏名が必須です`);
      return "skip";
    }

    setSaving(true);
    setSaveResult("idle");
    setSaveMsg(null);

    try {
      // PR c90-2: DailyEntry shape を構築。date は state.year-month-day を ISO 形式に整形。
      //   全 50+ 入力フィールドを numOrZero 経由で number 化、空文字や NaN は 0 扱い。
      //   業態によらず全フィールドを送信 (他業態未使用は state="" → 0 で保存)。
      //   旧 import-monthly では total_revenue 等の auto 計算結果も送信していたが、
      //   c90 では aggregation 関数が SUM + 派生計算するため不要 (送ると無視される)。
      const m = String(state.month).padStart(2, "0");
      const d = String(state.day).padStart(2, "0");
      const dateStr = `${state.year}-${m}-${d}`;
      const entry: DailyEntry = {
        date: dateStr,
        // 旧 DailyEntry 必須フィールド (互換性、c90 aggregation では参照されない):
        totalCount: 0, constructionCount: 0,
        selfRevenue: 0, selfProfit: 0, selfCount: 0,
        newRevenue: 0, newMaterial: 0, newLabor: 0, newCount: 0,
        addRevenue: 0, addMaterial: 0, addLabor: 0, addCount: 0,
        // PR c90-2: 日次差分入力フィールド (aggregation の SUM 対象、AGGREGATION_MAPPING.md 準拠)
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
        // PR c95-D-1 (slice 1+2): water 以外も "" → 0 で送信 (aggregation で他業態 0 固定)
        consultant_fee: numOrZero(state.consultant_fee),
        ad_cost: numOrZero(state.ad_cost),
        call_count: numOrZero(state.call_count),
        acquisition_count: numOrZero(state.acquisition_count),
        construction_count: numOrZero(state.construction_count), // PR c93-2 新規入力
        outsourced_construction_count: numOrZero(state.outsourced_construction_count),
        internal_construction_count: numOrZero(state.internal_construction_count),
        outsourced_construction_cost: numOrZero(state.outsourced_construction_cost),
        internal_construction_profit: numOrZero(state.internal_construction_profit),
        // PR c95-A-2 (G1 案 b): help_staff 配列 + 派生 scalar の二重書込。
        //   配列が新規 source of truth、scalar は aggregation 既存 SQL 互換 + export 互換のため併存。
        help_staff: helpStaffWrite,
        help_count: helpCountSum,
        help_revenue: helpRevenueSum,
        switchboard_count: numOrZero(state.switchboard_count),
        locksmith_car_lp_email_count: numOrZero(state.locksmith_car_lp_email_count),
        locksmith_inhouse_count: numOrZero(state.locksmith_inhouse_count),
        locksmith_repeat_count: numOrZero(state.locksmith_repeat_count),
        locksmith_revisit_count: numOrZero(state.locksmith_revisit_count),
        locksmith_construction_cost: numOrZero(state.locksmith_construction_cost),
        locksmith_commission_fee: numOrZero(state.locksmith_commission_fee),
        road_ad_count: numOrZero(state.road_ad_count),
        road_repeat_count: numOrZero(state.road_repeat_count),
        road_referral_count: numOrZero(state.road_referral_count),
        road_revisit_count: numOrZero(state.road_revisit_count),
        road_wellnest_count: numOrZero(state.road_wellnest_count),
        road_seo_count: numOrZero(state.road_seo_count),
        road_insurance_count: numOrZero(state.road_insurance_count),
        detective_meeting_count: numOrZero(state.detective_meeting_count),
        detective_cancel_count: numOrZero(state.detective_cancel_count),
        detective_phone_only_call_count: numOrZero(state.detective_phone_only_call_count),
        detective_mail_only_call_count: numOrZero(state.detective_mail_only_call_count),
        detective_line_only_call_count: numOrZero(state.detective_line_only_call_count),
        detective_wrong_call_count: numOrZero(state.detective_wrong_call_count),
        detective_phone_uwaki_acquisition_count: numOrZero(state.detective_phone_uwaki_acquisition_count),
        detective_phone_other_acquisition_count: numOrZero(state.detective_phone_other_acquisition_count),
        detective_mail_uwaki_acquisition_count: numOrZero(state.detective_mail_uwaki_acquisition_count),
        detective_mail_other_acquisition_count: numOrZero(state.detective_mail_other_acquisition_count),
        detective_line_uwaki_acquisition_count: numOrZero(state.detective_line_uwaki_acquisition_count),
        detective_line_other_acquisition_count: numOrZero(state.detective_line_other_acquisition_count),
        detective_selling_admin_cost: numOrZero(state.detective_selling_admin_cost),
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
        // PR c94-C-2: ⑥ 体制 (snake、aggregation が MAX 集計)
        vehicle_count: numOrZero(state.vehicle_count),
        trainee_count: numOrZero(state.trainee_count),
      };

      // calc / computeLocksmithProfit は c90-2 では送信不要 (aggregation 関数が再計算)。
      // /entry UI 上の表示には引き続き calc を使用するので意図的に void で参照保持。
      void calc;

      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaId: state.area_id, entry, category }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const errMsg = j?.error ?? `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      // PR c90-2: /api/entries が aggregation を後段で呼ぶため verify は monthly-summary を読む。
      //   aggregation 完了 (同期) で monthly_summaries に最新値が反映されている想定。
      //   念のため 300ms sleep でデータ整合性 buffer を確保 (旧 500ms から短縮、同期呼出のため)。
      await new Promise((r) => setTimeout(r, 300));
      const verifyRes = await fetch(
        `/api/monthly-summary?area=${state.area_id}&year=${state.year}&month=${state.month}&category=${category}`
      );
      if (!verifyRes.ok) throw new Error("保存後の検証取得に失敗");
      const verifyJson = await verifyRes.json();
      if (!verifyJson?.summary) throw new Error("保存後に DB 行が見つかりません");

      // PR c90-2: entriesByDate に該当 entry を即時 merge (UI 反映の即応性)。
      //   Effect A の re-fetch を待たずに、save 直後に「修正モード badge / カレンダー ●」が
      //   即座に更新される。次回 area/year/month/category 変化時に再 fetch で整合性確保。
      setEntriesByDate((prev) => {
        const next = new Map(prev);
        next.set(dateStr, entry);
        return next;
      });

      // CumulativePreview を refetch trigger
      setCumulativeRefetchCount((n) => n + 1);

      setSaveResult("success");
      setSaveMsg(`保存しました（${state.year}年${state.month}月 / ${AREA_NAMES[state.area_id] ?? state.area_id} / ${CATEGORY_LABELS[category]}）`);
      clearErrors();
      return "success";
    } catch (e) {
      setSaveResult("error");
      setSaveMsg(`保存失敗: ${e instanceof Error ? e.message : String(e)}`);
      return "error";
    } finally {
      setSaving(false);
    }
  }, [state, validateAll, clearErrors, calc, category]);

  // PR c6: state 変更 → debounce → 自動保存 (c89-p1 で OFF 維持中)
  //   - triggerSave: 確定送信ボタンが debounce 待たず即時 save するために利用
  // PR c6.2: hook が markClean を公開 (fetchExisting で baseline 同期捕捉に使う)
  // PR c92-2a (R4): status は AutoSaveBadge 削除に伴い destructure から除外。
  //   c89-p1 で auto-save OFF のため saving/saved 遷移なし、表示用途なし。
  const { triggerSave, markClean } = useDebouncedAutoSave({
    state, enabled: !isLoadingExisting, saveFn: handleSave,
  });

  // PR c6: 確定送信 — auto-save と同じ saveFn を即時 trigger + 視覚 feedback
  // PR c6.2: triggerSave 戻り値が SaveOutcome に変更、"success" 時のみ done feedback
  const handleConfirmSubmit = async () => {
    setSubmitFeedback("sending");
    const result = await triggerSave();
    if (result === "success") {
      setSubmitFeedback("done");
      setTimeout(() => setSubmitFeedback("idle"), 2500);
      // PR c95-A-3 (G8): done feedback 完了 (2.5 秒) 後に日報モーダルを自動表示
      setTimeout(() => setShowDailyReport(true), 2500);
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
        {/* PR c92-2b: ヘッダー title + pill 3 つ (area / date / progress) を flex row で配置。
            旧 c90-2 までは累積モデル時代の subtitle が残っていたが c92-2b で日次差分前提に
            文言更新。Pill は右寄せで area dropdown / 日付表示 / 進捗バッジを 3 連表示。 */}
        <div style={{ padding: "14px 24px 18px", maxWidth: 1400, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>
                月次データ入力 — {CATEGORY_LABELS[category]}
                {state.area_id && (
                  <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginLeft: 8 }}>
                    / {AREA_NAMES[state.area_id] ?? state.area_id}エリア
                  </span>
                )}
              </h1>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                日次差分を入力 ・ 月初〜選択日の累積はダッシュボードで自動計算
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* area pill: dropdown (canSelectArea=false は disabled 表示、Q3=a) */}
              <HeaderAreaPill
                value={state.area_id}
                canSelect={canSelectArea}
                availableAreas={availableAreas}
                onChange={(v) => setMeta("area_id", v)}
              />
              {/* date pill: 表示専用 (Calendar はサイドバーで編集) */}
              <HeaderDatePill year={state.year} month={state.month} day={state.day} />
              {/* progress pill: N/M日 (X%) */}
              <HeaderProgressPill
                inputted={progressBadge.inputted}
                denominator={progressBadge.denominator}
                percent={progressBadge.percent}
              />
              {/* PR c95-A-3 (G12): 「📋 日報を表示」pill、常時表示。過去日も日付ナビで閲覧可能。 */}
              <button
                type="button"
                onClick={() => setShowDailyReport(true)}
                style={{
                  padding: "6px 12px", borderRadius: 999,
                  background: "rgba(255,255,255,0.18)", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.35)", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                }}
              >📋 日報を表示</button>
            </div>
          </div>
        </div>
      </div>

      {/* PR c92-2a: wide-screen 2-column layout (max-width 1400px、左 sidebar 320 + 右 main flex-1)。
          1024px 未満は globals.css .entry-2col の @media で 1-column に自動切替。
          旧 (max-width 960、縦並び 1-column) を解体し、Calendar / ModeBadge /
          CumulativePreview をサイドバーに移動。AutoSaveBadge は c89-p1 で auto-save OFF
          のため機能せず → R4 に従い完全削除 (確定送信が代替)。 */}
      <main
        className="entry-2col"
        style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}
      >
        {/* ===== 左サイドバー (320px / 1024px 未満は上に積む) ===== */}
        <aside style={{
          display: "flex", flexDirection: "column", gap: 12,
          // sticky で form スクロール中もカレンダー常時表示 (R2)
          position: "sticky", top: 16,
          // sticky の高さが超えた場合用に max-height + overflow
          maxHeight: "calc(100vh - 32px)", overflowY: "auto",
        }}>
          {/* PR c92-2b: エリア選択は header pill に昇格 (HeaderAreaPill)、サイドバー版は削除。
              state.area_id は EntryForm 側の single source of truth (R1) で維持されており、
              header pill / sidebar Calendar 共通参照。setMeta による更新で Effect A の
              entries 再 fetch が trigger される。 */}

          {/* PR c6: カレンダー UI (旧 3 select 年/月/日 を統合)。c92-2a で sidebar 移動 */}
          <EntryCalendar
            year={state.year}
            month={state.month}
            day={state.day}
            hasDataDays={hasDataDays}
            onChange={handleCalendarChange}
            isLoading={isLoadingExisting}
          />

          {/* PR c90-2: 日次差分モデル対応の mode badge */}
          <ModeBadge
            isLoading={isLoadingExisting}
            hasExistingEntry={hasExistingEntryForCurrentDay}
            year={state.year}
            month={state.month}
            day={state.day}
          />

          {/* PR c90-2: 累積プレビュー (c92-2b で 6 指標化予定、c92-2a では現状 4 指標維持) */}
          <CumulativePreview
            areaId={state.area_id}
            category={category}
            year={state.year}
            month={state.month}
            refetchTrigger={cumulativeRefetchCount}
          />

          <p style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.5, padding: "0 4px" }}>
            ※ 「その日の差分」を入力してください (例: 5/2 なら 5/2 一日分の数字)。
            月初〜選択日までの累積はダッシュボードで自動計算されます。
            日付の変更はカレンダーから行ってください。
          </p>
        </aside>

        {/* ===== 右メイン (flex-1 / 1024px 未満は sidebar 下に積む) ===== */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {/* PR #48b c3: 業態別フォーム routing 層。
              現状は全業態 WaterForm にルーティング (動作変更ゼロを担保)。
              c4 で electric → ElectricForm、locksmith → LocksmithForm に分岐。
              c5 で road → RoadForm、detective → DetectiveForm に分岐。 */}
          {renderBusinessForm(category, {
            state, setField, setHelpStaff, validateField, errors, labels, calc,
            vehicleSnapshot: shiftSnapshot.vehicle, traineeSnapshot: shiftSnapshot.trainee,
          })}
        </div>
      </main>

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
      {/* PR c95-A-3: 日報モーダル。確定送信成功後 (done feedback 完了 2.5 秒後、G8) または
          ヘッダー「📋 日報を表示」pill (G12) から open される。 */}
      {showDailyReport && state.area_id && (
        <DailyReportModal
          date={`${state.year}-${String(state.month).padStart(2, "0")}-${String(state.day).padStart(2, "0")}`}
          areaId={state.area_id}
          category={category}
          onClose={() => setShowDailyReport(false)}
        />
      )}
    </div>
  );
}

// PR c92-2a (R4): AutoSaveBadge は削除済。
//   c89-p1 で auto-save OFF (AUTOSAVE_DISABLED_C89_P1=true) のため saving/saved 状態に
//   遷移せず、"—" と "読み込み中..." しか出ない死に駒だった。c92-2b で header の
//   進捗バッジが代替指標として実装される予定。

// PR c92-2b: header に並べる pill 3 つ。共通スタイル: 白半透明 bg + 細白 border。
//   いずれもグラデーション緑 header 上で視認できる軽量 chip 形状。

const PILL_BASE: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "6px 12px", fontSize: 12, fontWeight: 600,
  background: "rgba(255,255,255,0.18)", color: "#fff",
  border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999,
  whiteSpace: "nowrap", lineHeight: 1.2,
};

function HeaderAreaPill({
  value, canSelect, availableAreas, onChange,
}: {
  value: string;
  canSelect: boolean;
  availableAreas: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  if (!canSelect) {
    // R: 非 executive は disabled で「(自エリア固定)」表示 (Q3=a)
    const name = availableAreas.find((a) => a.id === value)?.name ?? value;
    return (
      <span style={{ ...PILL_BASE, opacity: 0.7 }} title="自エリア固定">
        📍 {name}（固定）
      </span>
    );
  }
  return (
    <label style={{ ...PILL_BASE, cursor: "pointer", padding: "4px 8px 4px 12px" }}>
      <span>📍</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "transparent", color: "#fff", border: "none",
          fontSize: 12, fontWeight: 600, outline: "none", cursor: "pointer",
          paddingRight: 4,
        }}
      >
        {availableAreas.map((a) => (
          <option key={a.id} value={a.id} style={{ color: "#111", background: "#fff" }}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"] as const;

function HeaderDatePill({ year, month, day }: { year: number; month: number; day: number }) {
  // 表示専用: Calendar (サイドバー) で日付編集する想定。
  // 視覚的に「クリッカブルに見えない」非インタラクティブな display chip。
  const dow = DOW[new Date(year, month - 1, day).getDay()];
  return (
    <span style={PILL_BASE} aria-label={`選択中の日付 ${year}年${month}月${day}日 ${dow}曜日`}>
      📅 {year}年{month}月{day}日 ({dow})
    </span>
  );
}

function HeaderProgressPill({
  inputted, denominator, percent,
}: { inputted: number; denominator: number; percent: number }) {
  // 進捗 % で色合いを微変化 (高いほど緑色濃度を上げる)
  const tone = percent >= 80 ? "rgba(255,255,255,0.30)"
    : percent >= 40 ? "rgba(255,255,255,0.22)"
    : "rgba(255,255,255,0.14)";
  return (
    <span
      style={{ ...PILL_BASE, background: tone }}
      title={`今月 ${denominator} 日のうち ${inputted} 日入力済み`}
    >
      進捗 {inputted}/{denominator}日 ({percent}%)
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

// PR c90-2: 日次差分入力モデルの mode badge (Q2=a)。
//   旧 (PR #44): 月次 1 行運用前提、as_of_day 差分を警告表示
//   新       : entries に当該 day の行あり → "修正モード" yellow
//             entries に当該 day の行なし → "新規入力モード" green
//   判定は entry 存在で行う (今日の既存 entry を再編集する場合も修正モード)。
//   論理的に明快で、過去/当日の区別とは独立。
function ModeBadge({
  isLoading, hasExistingEntry, year, month, day,
}: { isLoading: boolean; hasExistingEntry: boolean; year: number; month: number; day: number }) {
  if (isLoading) {
    return (
      <div style={{
        marginTop: 12, padding: "10px 14px", borderRadius: 6,
        background: "#eff6ff", borderLeft: "4px solid #3b82f6", fontSize: 12,
      }}>
        <span style={{ fontSize: 14, marginRight: 6 }}>📡</span>
        <span style={{ color: "#1e40af", fontWeight: 600 }}>当月の日次データを読み込み中...</span>
      </div>
    );
  }
  if (hasExistingEntry) {
    return (
      <div style={{
        marginTop: 12, padding: "10px 14px", borderRadius: 6,
        background: "#fffbeb", borderLeft: "4px solid #f59e0b", fontSize: 12,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 16 }}>✏️</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#78350f", fontWeight: 700, marginBottom: 2 }}>
              修正モード
            </div>
            <div style={{ color: "#92400e", lineHeight: 1.6 }}>
              <strong>{year}年{month}月{day}日</strong>の日次データを既に保存済みです。
              値を更新して確定送信すると、月初〜選択日までの累積がダッシュボードで再計算されます。
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
            <strong>{year}年{month}月{day}日</strong>の日次データを新規に入力します。
            「その日の差分」(例: 5/2 なら 5/2 一日分の数字)を入力して確定送信してください。
          </div>
        </div>
      </div>
    </div>
  );
}

