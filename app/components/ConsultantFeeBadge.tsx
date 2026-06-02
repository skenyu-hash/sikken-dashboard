// PR c95-D-6 (slice 6): 水道コンサル費「手入力」控除済の注記バッジ (共通コンポーネント)。
//
// 旧 c95-B-4b: 「コンサル費 7.7% 控除済」表記 (自動計算前提)
// 新 c95-D-6 : 「コンサル費 (手入力) 控除済」表記 (実額手入力に方針転換)
//
// 用途: Dashboard / 推移 / 損益分岐 で「この粗利は 手入力 コンサル費 控除後」をユーザーに告知。
//   c95-D-3 (form-level) / D-4 (aggregation) / D-5 (day-level + read fallback) で
//   手入力ベース controle 済の値が画面に出ているため、UI 側で「コンサル費が控除されている」旨を告知。
//
// 表示条件:
//   - category === "water" のみ (他業態はコンサル費概念なし)
//   - month > 0 (month view): yyyymm >= 202605 のみ
//   - month = 0 (year-only view、trends 用): year >= 2026 のみ (年内に控除月を含む)
//   - year = 0 / 欠落: バッジ非表示 (安全側、誤誘導回避)
//
// 過去月閲覧時 (yyyymm < 202605) には表示しない設計。4 月以前データへの遡及適用と
// 誤認されるリスクを排除 (絶対不変項目保護)。

import type { CSSProperties } from "react";
import { CONSULTANT_FEE_APPLIED_FROM_YYYYMM, toYyyyMm } from "../lib/consultantFee";

type Props = {
  category: string | null | undefined;
  year: number | string | null | undefined;
  /** 0 / 未指定 = year-only mode (trends 等の年単位 view 用) */
  month: number | string | null | undefined;
  /** dark bg 等で text/bg を override する用 (breakeven ヘッダー用途) */
  style?: CSSProperties;
};

const numOf = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

export default function ConsultantFeeBadge({ category, year, month, style }: Props) {
  if (category !== "water") return null;
  const y = numOf(year);
  if (y === 0) return null;
  const m = numOf(month);
  if (m === 0) {
    // year-only mode: 2026 年以降の年で控除月を含むため表示
    if (y < 2026) return null;
  } else {
    // month mode: yyyymm 厳格判定
    if (toYyyyMm(y, m) < CONSULTANT_FEE_APPLIED_FROM_YYYYMM) return null;
  }
  return (
    <span style={{
      display: "inline-block",
      fontSize: 10,
      fontWeight: 700,
      color: "#1B5E3F",
      background: "#ecfdf5",
      border: "1px solid #d1fae5",
      borderRadius: 4,
      padding: "2px 8px",
      whiteSpace: "nowrap",
      ...style,
    }}>
      ⓘ コンサル費（手入力）控除済（2026年5月〜）
    </span>
  );
}
