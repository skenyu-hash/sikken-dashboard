"use client";
// ① 新規対応 セクション: 入力 7 (f2/f3/f5/f6/f8/f9/f10) + auto 3 (inline 表示)

import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue } from "../types";
import type { FieldLabels } from "../../lib/business-labels";
import SectionShell from "./SectionShell";
import NumberField from "./NumberField";
import { fmtYen, fmtCount } from "./AutoCalcDisplay";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
};

export default function SectionSales({ state, setField, validateField, errors, labels, calc }: Props) {
  return (
    <SectionShell title={labels.section_sales} subtitle="入力 7項目 + 自動計算 3項目">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {/* 売上系 (f2, f3) → auto f1 */}
        <NumberField field="outsourced_sales_revenue" label={labels.outsourced_sales_revenue} unit="円"
          value={state.outsourced_sales_revenue} onChange={(v) => setField("outsourced_sales_revenue", v)}
          onBlur={validateField} state={state} error={errors.outsourced_sales_revenue} required />
        <NumberField field="internal_staff_revenue" label={labels.internal_staff_revenue} unit="円"
          value={state.internal_staff_revenue} onChange={(v) => setField("internal_staff_revenue", v)}
          onBlur={validateField} state={state} error={errors.internal_staff_revenue} />
      </div>
      {/* PR #48a: 内訳のない業態 (鍵・ロード・探偵等) 向けの運用ヒント。
          業態別フォーム化 (PR #48b) までの暫定ガイド。 */}
      <HelpHint />
      {/* auto: total_revenue */}
      <AutoRow label={labels.total_revenue} value={fmtYen(calc.total_revenue)} formula="= 業務委託売上 + 内勤社員売上" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 14 }}>
        {/* 件数系 (f5, f6) → auto f4 (PR #48a で必須を撤廃、対応件数 0 でも保存可能) */}
        <NumberField field="outsourced_response_count" label={labels.outsourced_response_count} unit="件"
          value={state.outsourced_response_count} onChange={(v) => setField("outsourced_response_count", v)}
          onBlur={validateField} state={state} error={errors.outsourced_response_count} />
        <NumberField field="internal_staff_response_count" label={labels.internal_staff_response_count} unit="件"
          value={state.internal_staff_response_count} onChange={(v) => setField("internal_staff_response_count", v)}
          onBlur={validateField} state={state} error={errors.internal_staff_response_count} />
      </div>
      <AutoRow label={labels.total_response_count} value={fmtCount(calc.total_response_count)} formula="= 業務委託対応件数 + 内勤社員対応件数" />
      <AutoRow label={labels.unit_price} value={fmtYen(calc.unit_price)} formula="= 全体売上 ÷ 合計対応件数" />

      {/* リピート/再訪問/口コミ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 14 }}>
        <NumberField field="repeat_count" label={labels.repeat_count} unit="件"
          value={state.repeat_count} onChange={(v) => setField("repeat_count", v)}
          onBlur={validateField} state={state} error={errors.repeat_count} />
        <NumberField field="revisit_count" label={labels.revisit_count} unit="件"
          value={state.revisit_count} onChange={(v) => setField("revisit_count", v)}
          onBlur={validateField} state={state} error={errors.revisit_count} />
        <NumberField field="review_count" label={labels.review_count} unit="件"
          value={state.review_count} onChange={(v) => setField("review_count", v)}
          onBlur={validateField} state={state} error={errors.review_count} />
      </div>
    </SectionShell>
  );
}

// PR #48a: 業態別フォーム移行 (PR #48b) までの緊急緩和向けヒント。
// 鍵・ロード・探偵など「業務委託 vs 内勤社員」の内訳を持たない業態の
// スタッフ向けに、合計値の入れ方を明示する。
function HelpHint() {
  return (
    <p style={{
      marginTop: 8, padding: "8px 10px",
      fontSize: 11, color: "#374151", lineHeight: 1.5,
      background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
    }}>
      💡 内訳がない業態（鍵・ロード・探偵等）の場合は、
      <strong>業務委託側に合計値を入力</strong>し、内勤社員側は <strong>0</strong> のままで OK です。
      対応件数も同様（0 件のままで保存可能）。
    </p>
  );
}

function AutoRow({ label, value, formula }: { label: string; value: string; formula: string }) {
  return (
    <div style={{
      marginTop: 10, padding: "8px 12px",
      background: "#f0fdf4", borderRadius: 6, border: "1px dashed #d1fae5",
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
    }}>
      <div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#065f46" }}>{label}</span>
        <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 8 }}>(自動計算 {formula})</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>{value}</span>
    </div>
  );
}
