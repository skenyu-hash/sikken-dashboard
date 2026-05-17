"use client";
// PR #48b c5-detective: 探偵業態フォーム。
//
// 仕様確定 (Web Claude 5/16):
//   ① 新規対応: 売上 / 広告費（探偵LP）/ 販管費 + 営業利益 (自動)
//   ② 入電  : 4 内訳 (電のみ / メールのみ / LINEのみ / 間違い電話) + 入電数 / 入電単価
//   ③ 獲得  : 6 内訳 (3 媒体 × 2 カテゴリ) + 合計獲得件数 / 獲得単価
//   ④ 面談プロセス: 面談事前キャンセル数 / 面談数 / 成約件数
//                  + アポ獲得率 / 面談率 / 成約率 (自動)
//   ⑤ HELP / ⑥ 施工 : 非表示
//
// DB マッピング (既存列流用):
//   売上          → outsourced_sales_revenue (internal=0 → calc.total_revenue = 売上)
//   広告費        → ad_cost
//   入電数 (自動) → call_count (4 内訳合計)
//   合計獲得件数 (自動) → acquisition_count (6 内訳合計、= 面談予定数)
//   成約件数      → outsourced_response_count (internal=0 → calc.total_response_count
//                  = 成約件数 → DB total_count として保存)
//   営業利益 (自動) → total_profit (calc.profit 式 = 売上 - 材料 - 工事 - 広告 - 手数料 - カード
//                  探偵では 材料=工事=手数料=カード=0 → 売上 - 広告 と一致)
//   販管費        → 保存しない (Phase B、注記表示)
//   4 入電内訳 / 6 獲得内訳 / 事前キャンセル数 / 面談数 → UI のみ (Phase B 化候補)
//
// state 配置 (c4-locksmith / c5-road と同パターン):
//   - 共通 EntryFormState 列流用: outsourced_sales_revenue / ad_cost / outsourced_response_count
//   - 業態固有 UI-only (販管費 + 4+6 チャネル内訳 + キャンセル数 + 面談数) は
//     DetectiveForm-local useState
//   - 内訳 onChange → setField("call_count" / "acquisition_count", sum) 直接同期
//
// 既存 calc 流用:
//   - calc.profit = 売上 - 広告 (他コスト 0 のため探偵仕様と一致) → 営業利益
//   - calc.call_unit_price = 広告費 ÷ call_count → 入電単価
//   - calc.cpa = 広告費 ÷ acquisition_count → 獲得単価
//   - calc.conv_rate = acquisition_count ÷ call_count × 100 → アポ獲得率
// 探偵固有 (ローカル計算):
//   - 面談率 = 面談数 ÷ 合計獲得件数 × 100
//   - 成約率 = 成約件数 ÷ 面談数 × 100
//
// バリデーション (warning のみ、エラーにせず保存可):
//   - 面談数 > 合計獲得件数 → warning
//   - 成約件数 > 面談数 → warning
//
// 注: 入電内訳 ≠ 入電数 の不一致は warning 出さない (実機運用での仕様、5/17 確認)

import { useState } from "react";
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

// 入電 4 チャネル
type CallChannelKey = "phoneOnly" | "mailOnly" | "lineOnly" | "wrong";
const CALL_CHANNEL_KEYS: readonly CallChannelKey[] = [
  "phoneOnly", "mailOnly", "lineOnly", "wrong",
] as const;
const CALL_CHANNEL_LABELS: Record<CallChannelKey, string> = {
  phoneOnly: "電のみ件数",
  mailOnly: "メールのみ件数",
  lineOnly: "LINEのみ件数",
  wrong: "間違い電話件数",
};

// 獲得 6 チャネル (3 媒体 × 2 カテゴリ)
type AcqChannelKey =
  | "phone_uwaki" | "phone_other"
  | "mail_uwaki" | "mail_other"
  | "line_uwaki" | "line_other";
const ACQ_CHANNEL_KEYS: readonly AcqChannelKey[] = [
  "phone_uwaki", "phone_other",
  "mail_uwaki", "mail_other",
  "line_uwaki", "line_other",
] as const;
const ACQ_CHANNEL_LABELS: Record<AcqChannelKey, string> = {
  phone_uwaki: "電話 × 浮気",
  phone_other: "電話 × その他",
  mail_uwaki: "メール × 浮気",
  mail_other: "メール × その他",
  line_uwaki: "LINE × 浮気",
  line_other: "LINE × その他",
};

type CallChannels = Record<CallChannelKey, InputValue>;
type AcqChannels = Record<AcqChannelKey, InputValue>;

const emptyCallChannels: CallChannels = { phoneOnly: "", mailOnly: "", lineOnly: "", wrong: "" };
const emptyAcqChannels: AcqChannels = {
  phone_uwaki: "", phone_other: "",
  mail_uwaki: "", mail_other: "",
  line_uwaki: "", line_other: "",
};

const num = (v: InputValue): number => (v === "" ? 0 : v);
const safePct = (a: number, b: number): number => (b === 0 ? 0 : (a / b) * 100);

const sumCallChannels = (c: CallChannels): number =>
  CALL_CHANNEL_KEYS.reduce((sum, k) => sum + num(c[k]), 0);
const sumAcqChannels = (c: AcqChannels): number =>
  ACQ_CHANNEL_KEYS.reduce((sum, k) => sum + num(c[k]), 0);

export default function DetectiveForm({ state, setField, validateField, errors, labels, calc }: Props) {
  // PR #53: 面談数 / キャンセル数 を shared state に切替 (DB 保存対応)
  // 他の UI-only state (販管費 / 入電 4 内訳 / 獲得 6 内訳) は引き続き local
  const [sellingAdmin, setSellingAdmin] = useState<InputValue>("");
  const [callBreakdown, setCallBreakdown] = useState<CallChannels>(emptyCallChannels);
  const [acqBreakdown, setAcqBreakdown] = useState<AcqChannels>(emptyAcqChannels);

  const updateCallChannel = (key: CallChannelKey, v: InputValue) => {
    const next = { ...callBreakdown, [key]: v };
    setCallBreakdown(next);
    setField("call_count", sumCallChannels(next));
  };
  const updateAcqChannel = (key: AcqChannelKey, v: InputValue) => {
    const next = { ...acqBreakdown, [key]: v };
    setAcqBreakdown(next);
    setField("acquisition_count", sumAcqChannels(next));
  };

  // 探偵固有のローカル auto-calc
  // PR #53: meetings / cancels は state から読む (DB 保存対象)
  const totalAcq = num(state.acquisition_count);
  const meetings = num(state.detective_meeting_count);
  const cancels = num(state.detective_cancel_count);
  const closes = num(state.outsourced_response_count); // = 成約件数
  const meetingRate = safePct(meetings, totalAcq); // 面談率
  const cancelRate = safePct(cancels, totalAcq);   // キャンセル率 (参考)
  const closeRate = safePct(closes, meetings);     // 成約率

  // Warning checks (エラーにせず表示のみ、保存ブロックなし)
  const meetingOverAcq = meetings > 0 && totalAcq > 0 && meetings > totalAcq;
  const closeOverMeeting = closes > 0 && meetings > 0 && closes > meetings;

  return (
    <>
      {/* ① 新規対応セクション */}
      <SectionShell title={labels.section_sales} subtitle="入力 3項目 (販管費は記録のみ) + 自動計算 (営業利益)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <NumberField field="outsourced_sales_revenue" label={labels.total_revenue} unit="円"
            value={state.outsourced_sales_revenue} onChange={(v) => setField("outsourced_sales_revenue", v)}
            onBlur={validateField} state={state} error={errors.outsourced_sales_revenue} required />
          <NumberField field="ad_cost" label={labels.ad_cost} unit="円"
            value={state.ad_cost} onChange={(v) => setField("ad_cost", v)}
            onBlur={validateField} state={state} error={errors.ad_cost} />
          <LocalNumberField label="販管費" unit="円" value={sellingAdmin} onChange={setSellingAdmin} />
        </div>

        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 販管費は現在は記録のみ。営業利益計算への反映は Phase B (PR #49 以降) で対応予定。
        </p>

        <AutoRow label="営業利益" value={fmtYen(calc.profit)} formula="= 売上 − 広告費" />
      </SectionShell>

      {/* ② 入電セクション */}
      <SectionShell title="② 入電" subtitle="入力 4項目 + 自動計算 (入電数 / 入電単価)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {CALL_CHANNEL_KEYS.map((key) => (
            <LocalNumberField key={key} label={CALL_CHANNEL_LABELS[key]} unit="件"
              value={callBreakdown[key]}
              onChange={(v) => updateCallChannel(key, v)} />
          ))}
        </div>
        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると入電数が自動更新されます。内訳自体は DB 保存対象外 (Phase B 予定)。
        </p>
        <AutoRow label="入電数" value={fmtCount(num(state.call_count))} formula="= 4 内訳合計" />
        <AutoRow label={labels.call_unit_price} value={fmtYen(calc.call_unit_price)} formula="= 広告費 ÷ 入電数" />
      </SectionShell>

      {/* ③ 獲得セクション */}
      <SectionShell title="③ 獲得" subtitle="入力 6項目 (3 媒体 × 2 カテゴリ) + 自動計算 (合計獲得件数 / 獲得単価)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {ACQ_CHANNEL_KEYS.map((key) => (
            <LocalNumberField key={key} label={ACQ_CHANNEL_LABELS[key]} unit="件"
              value={acqBreakdown[key]}
              onChange={(v) => updateAcqChannel(key, v)} />
          ))}
        </div>
        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 内訳を入力すると合計獲得件数が自動更新されます。内訳自体は DB 保存対象外 (Phase B 予定)。
        </p>
        <AutoRow label="合計獲得件数 (面談予定数)" value={fmtCount(totalAcq)} formula="= 6 内訳合計" />
        <AutoRow label={labels.cpa} value={fmtYen(calc.cpa)} formula="= 広告費 ÷ 合計獲得件数" />
      </SectionShell>

      {/* ④ 面談プロセス セクション (PR #53 で面談数/キャンセル数を DB 化) */}
      <SectionShell title="④ 面談プロセス" subtitle="入力 3項目 + 自動計算 (アポ獲得率 / 面談率 / 成約率)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <NumberField field="detective_cancel_count" label="面談事前キャンセル数" unit="件"
            value={state.detective_cancel_count}
            onChange={(v) => setField("detective_cancel_count", v)}
            onBlur={validateField} state={state} error={errors.detective_cancel_count} />
          <NumberField field="detective_meeting_count" label="面談数" unit="件"
            value={state.detective_meeting_count}
            onChange={(v) => setField("detective_meeting_count", v)}
            onBlur={validateField} state={state} error={errors.detective_meeting_count} />
          <NumberField field="outsourced_response_count" label={labels.outsourced_response_count} unit="件"
            value={state.outsourced_response_count}
            onChange={(v) => setField("outsourced_response_count", v)}
            onBlur={validateField} state={state} error={errors.outsourced_response_count} />
        </div>

        {meetingOverAcq && (
          <p style={{
            marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#92400e", lineHeight: 1.5,
            background: "#fffbeb", borderRadius: 6, border: "1px solid #fde68a",
          }}>
            ⚠ 面談数 ({fmtCount(meetings)}) が合計獲得件数 ({fmtCount(totalAcq)}) を超えています。
            保存はブロックされませんが数値を確認してください。
          </p>
        )}
        {closeOverMeeting && (
          <p style={{
            marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#92400e", lineHeight: 1.5,
            background: "#fffbeb", borderRadius: 6, border: "1px solid #fde68a",
          }}>
            ⚠ 成約件数 ({fmtCount(closes)}) が面談数 ({fmtCount(meetings)}) を超えています。
            保存はブロックされませんが数値を確認してください。
          </p>
        )}
        <p style={{
          marginTop: 8, padding: "8px 10px", fontSize: 11, color: "#374151", lineHeight: 1.5,
          background: "#f9fafb", borderRadius: 6, border: "1px solid #e5e7eb",
        }}>
          💡 PR #53 で面談事前キャンセル数・面談数も DB 保存対象になりました。
          成約件数は DB total_count として保存されます (既存挙動)。
        </p>

        <AutoRow label="アポ獲得率" value={fmtPct(calc.conv_rate)} formula="= 合計獲得件数 ÷ 入電数 × 100" />
        <AutoRow label="キャンセル率" value={fmtPct(cancelRate)} formula="= 面談事前キャンセル数 ÷ 合計獲得件数 × 100" />
        <AutoRow label="面談率" value={fmtPct(meetingRate)} formula="= 面談数 ÷ 合計獲得件数 × 100" />
        <AutoRow label="成約率" value={fmtPct(closeRate)} formula="= 成約件数 ÷ 面談数 × 100" />
      </SectionShell>
    </>
  );
}
