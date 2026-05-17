"use client";
// PR #51 (PR #48b c4-locksmith 改修): 鍵業態フォーム。
//
// 仕様確定 (Web Claude 5/16 / 5/18):
//   ① 新規対応: 売上、工事費、材料費、広告費、手数料、販管費 (販管費は記録のみ Phase 4)
//   ② 入電  : 車LP+メール / インハウス + 自動 (総入電件数 / 入電単価)
//   ③ 獲得  : 車LP+メール / インハウス / リピート(紹介) / 再訪問 / HELP + 自動 (総獲得件数 / 獲得単価 / 成約率)
//   ④ HELP : HELP 売上のみ + 自動 (HELP 客単価 / HELP 率)
//   ⑤ SectionConstruction: 非表示
//
// PR #51 で変更点:
//   - 獲得 4 内訳 (車LP+メール / インハウス / リピート / 再訪問) を DB 保存化
//     * 専用カラム: locksmith_car_lp_email_count / locksmith_inhouse_count /
//       locksmith_repeat_count / locksmith_revisit_count
//     * 編集モードで内訳が DB から復元される (PR #48b の既知制限を解消)
//   - 工事費・手数料を専用カラムへ切替
//     * 旧: state.total_labor_cost / state.sales_outsourcing_cost (流用)
//     * 新: state.locksmith_construction_cost / state.locksmith_commission_fee
//   - 粗利は LocksmithForm 内でローカル計算 (旧 calc.profit が total_labor_cost を
//     参照していたが、locksmith では 0 になるため独自式が必要)
//     式: 売上 - (工事費 + 材料費 + 広告費 + 手数料)
//   - DB 保存時の total_profit は EntryForm.handleSave 側で category==='locksmith' の
//     時のみ独自式で計算 (論点 1 案 A、Web Claude 承認 5/18)
//
// DB マッピング (PR #51 適用後):
//   売上          → outsourced_sales_revenue (locksmith 単独入力)
//   工事費        → locksmith_construction_cost (新、PR #51)
//   材料費        → material_cost
//   広告費        → ad_cost
//   手数料        → locksmith_commission_fee (新、PR #51)
//   販管費        → 保存しない (LocksmithForm-local state、Phase 4 候補)
//   総入電件数 (自動) → call_count   (内訳の和、内訳自体は LocalState のまま Phase B 後続)
//   総獲得件数 (自動) → acquisition_count (5 内訳の和)
//   獲得 4 内訳   → locksmith_car_lp_email_count / locksmith_inhouse_count /
//                  locksmith_repeat_count / locksmith_revisit_count
//   HELP 件数     → help_count (獲得 5 の HELP スロット = state.help_count を共有)
//   HELP 売上     → help_revenue
//   粗利 (自動)   → total_profit (= 売上 - 4 コスト、handleSave で category-aware)
//
// 既知制限 (PR #51 後も残る):
//   - 入電 2 内訳 (車LP+メール 入電 / インハウス 入電) は依然 UI only。編集モードで
//     state.call_count は復元されるが、内訳ローカル state はブランクに戻る。
//     ユーザーが内訳を 1 つでも入力すると call_count が sum で上書きされる。
//     → Phase B 後続で DB 化検討。

import { useMemo, useState } from "react";
import SectionShell from "../SectionShell";
import NumberField from "../NumberField";
import LocalNumberField from "../LocalNumberField";
import { AutoRow, fmtYen, fmtCount, fmtPct } from "../AutoCalcDisplay";
import type { EntryFormState, ValidationErrors, AutoCalcResult, InputFieldKey, InputValue } from "../../types";
import type { FieldLabels } from "../../../lib/business-labels";

type Props = {
  state: EntryFormState;
  setField: (k: InputFieldKey, v: InputValue) => void;
  validateField: (field: InputFieldKey, value: InputValue, state: EntryFormState) => boolean;
  errors: ValidationErrors;
  labels: FieldLabels;
  calc: AutoCalcResult;
};

const num = (v: InputValue): number => (v === "" ? 0 : v);
const safePct = (a: number, b: number): number => (b === 0 ? 0 : (a / b) * 100);

/** 鍵業態の粗利式 (LocksmithForm 表示 + handleSave 保存値で共有): 売上 - (工事費+材料費+広告費+手数料) */
export function computeLocksmithProfit(state: EntryFormState): number {
  return num(state.outsourced_sales_revenue)
    - num(state.locksmith_construction_cost)
    - num(state.material_cost)
    - num(state.ad_cost)
    - num(state.locksmith_commission_fee);
}

export default function LocksmithForm({ state, setField, validateField, errors, labels, calc }: Props) {
  // 販管費 + 入電 2 内訳は引き続き UI only (Phase B 後続で対応)。
  const [sellingAdmin, setSellingAdmin] = useState<InputValue>("");
  const [callLpMail, setCallLpMail] = useState<InputValue>("");
  const [callInhouse, setCallInhouse] = useState<InputValue>("");

  // 入電 内訳 → state.call_count 同期 (直接代入、useEffect は使わない:
  // マウント時に DB-loaded 値を 0 に上書きするのを防ぐため)
  const syncCallCount = (lp: InputValue, ih: InputValue) => {
    setField("call_count", num(lp) + num(ih));
  };
  // 獲得 5 内訳 → state.acquisition_count 同期
  const syncAcquisitionCount = (lp: InputValue, ih: InputValue, rep: InputValue, rev: InputValue, help: InputValue) => {
    setField("acquisition_count", num(lp) + num(ih) + num(rep) + num(rev) + num(help));
  };

  // 売上比% (UI 表示用、ローカル計算)
  const sales = num(state.outsourced_sales_revenue);
  const ratios = useMemo(() => ({
    construction: safePct(num(state.locksmith_construction_cost), sales),
    material: safePct(num(state.material_cost), sales),
    ad: safePct(num(state.ad_cost), sales),
    commission: safePct(num(state.locksmith_commission_fee), sales),
  }), [sales, state.locksmith_construction_cost, state.material_cost, state.ad_cost, state.locksmith_commission_fee]);

  // 粗利 = 売上 - (工事費 + 材料費 + 広告費 + 手数料)
  // calc.profit (= total_revenue - total_labor_cost - material - ad - sales_outsourcing - card)
  // は locksmith の total_labor_cost / sales_outsourcing_cost が 0 のため使えない。
  const profit = useMemo(() => computeLocksmithProfit(state), [state]);

  const helpRate = useMemo(() => safePct(num(state.help_revenue), sales), [sales, state.help_revenue]);

  return (
    <>
      {/* ① 新規対応セクション */}
      <SectionShell title={labels.section_sales} subtitle="入力 6項目 (販管費は記録のみ) + 自動計算 (売上比 / 粗利)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <NumberField field="outsourced_sales_revenue" label={labels.total_revenue} unit="円"
            value={state.outsourced_sales_revenue} onChange={(v) => setField("outsourced_sales_revenue", v)}
            onBlur={validateField} state={state} error={errors.outsourced_sales_revenue} required />
          <NumberField field="locksmith_construction_cost" label={labels.total_labor_cost} unit="円"
            value={state.locksmith_construction_cost} onChange={(v) => setField("locksmith_construction_cost", v)}
            onBlur={validateField} state={state} error={errors.locksmith_construction_cost} />
          <NumberField field="material_cost" label={labels.material_cost} unit="円"
            value={state.material_cost} onChange={(v) => setField("material_cost", v)}
            onBlur={validateField} state={state} error={errors.material_cost} />
          <NumberField field="ad_cost" label={labels.ad_cost} unit="円"
            value={state.ad_cost} onChange={(v) => setField("ad_cost", v)}
            onBlur={validateField} state={state} error={errors.ad_cost} />
          <NumberField field="locksmith_commission_fee" label={labels.sales_outsourcing_cost} unit="円"
            value={state.locksmith_commission_fee} onChange={(v) => setField("locksmith_commission_fee", v)}
            onBlur={validateField} state={state} error={errors.locksmith_commission_fee} />
          <LocalNumberField label="販管費" unit="円" value={sellingAdmin} onChange={setSellingAdmin} />
        </div>

        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 販管費は現在は記録のみ。粗利計算への反映は Phase 4 で対応予定。
        </p>

        <AutoRow label="工事費 売上比" value={fmtPct(ratios.construction)} formula="= 工事費 ÷ 売上 × 100" />
        <AutoRow label="材料費 売上比" value={fmtPct(ratios.material)} formula="= 材料費 ÷ 売上 × 100" />
        <AutoRow label="広告費 売上比" value={fmtPct(ratios.ad)} formula="= 広告費 ÷ 売上 × 100" />
        <AutoRow label="手数料 売上比" value={fmtPct(ratios.commission)} formula="= 手数料 ÷ 売上 × 100" />
        <AutoRow label="粗利" value={fmtYen(profit)} formula="= 売上 − (工事費 + 材料費 + 広告費 + 手数料)" />
      </SectionShell>

      {/* ② 入電セクション */}
      <SectionShell title="② 入電" subtitle="入力 2項目 + 自動計算 (総入電件数 / 入電単価)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <LocalNumberField label="車LP+メール" unit="件" value={callLpMail}
            onChange={(v) => { setCallLpMail(v); syncCallCount(v, callInhouse); }} />
          <LocalNumberField label="インハウス" unit="件" value={callInhouse}
            onChange={(v) => { setCallInhouse(v); syncCallCount(callLpMail, v); }} />
        </div>
        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると総入電件数が自動更新されます。内訳自体は DB 保存対象外 (Phase B 後続予定)。
        </p>
        <AutoRow label={labels.call_count} value={fmtCount(num(state.call_count))} formula="= 車LP+メール + インハウス" />
        <AutoRow label={labels.call_unit_price} value={fmtYen(calc.call_unit_price)} formula="= 広告費 ÷ 総入電件数" />
      </SectionShell>

      {/* ③ 獲得セクション (PR #51 で 4 内訳を DB 保存化) */}
      <SectionShell title="③ 獲得" subtitle="入力 5項目 + 自動計算 (総獲得件数 / 獲得単価 / 成約率)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <NumberField field="locksmith_car_lp_email_count" label="車LP+メール" unit="件"
            value={state.locksmith_car_lp_email_count}
            onChange={(v) => {
              setField("locksmith_car_lp_email_count", v);
              syncAcquisitionCount(v, state.locksmith_inhouse_count, state.locksmith_repeat_count, state.locksmith_revisit_count, state.help_count);
            }}
            onBlur={validateField} state={state} error={errors.locksmith_car_lp_email_count} />
          <NumberField field="locksmith_inhouse_count" label="インハウス" unit="件"
            value={state.locksmith_inhouse_count}
            onChange={(v) => {
              setField("locksmith_inhouse_count", v);
              syncAcquisitionCount(state.locksmith_car_lp_email_count, v, state.locksmith_repeat_count, state.locksmith_revisit_count, state.help_count);
            }}
            onBlur={validateField} state={state} error={errors.locksmith_inhouse_count} />
          <NumberField field="locksmith_repeat_count" label="リピート（紹介）" unit="件"
            value={state.locksmith_repeat_count}
            onChange={(v) => {
              setField("locksmith_repeat_count", v);
              syncAcquisitionCount(state.locksmith_car_lp_email_count, state.locksmith_inhouse_count, v, state.locksmith_revisit_count, state.help_count);
            }}
            onBlur={validateField} state={state} error={errors.locksmith_repeat_count} />
          <NumberField field="locksmith_revisit_count" label="再訪問" unit="件"
            value={state.locksmith_revisit_count}
            onChange={(v) => {
              setField("locksmith_revisit_count", v);
              syncAcquisitionCount(state.locksmith_car_lp_email_count, state.locksmith_inhouse_count, state.locksmith_repeat_count, v, state.help_count);
            }}
            onBlur={validateField} state={state} error={errors.locksmith_revisit_count} />
          <NumberField field="help_count" label="HELP件数" unit="件"
            value={state.help_count}
            onChange={(v) => {
              setField("help_count", v);
              syncAcquisitionCount(state.locksmith_car_lp_email_count, state.locksmith_inhouse_count, state.locksmith_repeat_count, state.locksmith_revisit_count, v);
            }}
            onBlur={validateField} state={state} error={errors.help_count} />
        </div>

        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると総獲得件数が自動更新されます。PR #51 で 5 内訳すべて DB 保存対象。
        </p>

        <AutoRow label={labels.acquisition_count} value={fmtCount(num(state.acquisition_count))} formula="= 5 内訳の合計" />
        <AutoRow label={labels.cpa} value={fmtYen(calc.cpa)} formula="= 広告費 ÷ 総獲得件数" />
        <AutoRow label={labels.conv_rate} value={fmtPct(calc.conv_rate)} formula="= 総獲得件数 ÷ 総入電件数 × 100" />
      </SectionShell>

      {/* ④ HELP セクション */}
      <SectionShell title="④ HELP" subtitle="入力 1項目 + 自動計算 (HELP 客単価 / HELP 率)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <NumberField field="help_revenue" label={labels.help_revenue} unit="円"
            value={state.help_revenue} onChange={(v) => setField("help_revenue", v)}
            onBlur={validateField} state={state} error={errors.help_revenue} />
        </div>
        <AutoRow label={labels.help_unit_price} value={fmtYen(calc.help_unit_price)} formula="= HELP売上 ÷ HELP件数" />
        <AutoRow label="HELP 率" value={fmtPct(helpRate)} formula="= HELP売上 ÷ 売上 × 100" />
      </SectionShell>
    </>
  );
}
