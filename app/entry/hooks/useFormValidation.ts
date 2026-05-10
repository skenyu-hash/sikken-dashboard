// useFormValidation: onBlur リアルタイムエラー + 保存時必須チェック
//
// バリデーションルール:
//   - 数値は非負 (負値は不可)
//   - 業務委託対応件数 + 内勤社員対応件数 ≤ 合計対応件数 (該当 3 フィールド連動)
//     → 仕様書 §4.2 ① で f5+f6 = f4 (合計) のため、入力時の整合性チェック
//   - 保存時: 売上 (f2 or f3 のいずれか) と 対応件数 (f5 or f6 のいずれか) は必須
//
// 注: 入力ベースのチェック。auto 計算結果との突合は不要 (常に整合)。

import { useState, useCallback } from "react";
import type {
  EntryFormState,
  ValidationErrors,
  InputFieldKey,
  InputValue,
} from "../types";

const num = (v: InputValue): number => (v === "" ? 0 : v);

function checkNonNegative(v: InputValue): string | undefined {
  if (v === "") return undefined;
  if (typeof v === "number" && v < 0) return "負の値は入力できません";
  return undefined;
}

export function useFormValidation() {
  const [errors, setErrors] = useState<ValidationErrors>({});

  // state 引数は将来のクロスフィールド検証で利用予定 (現状は単項のみ)。
  // 仕様書 §4.2 で f4 = f5 + f6 が auto のため、入力フィールドの整合チェックは
  // 上限式が不要 (auto が常に等式を満たす)。
  const validateField = useCallback(
    (field: InputFieldKey, value: InputValue, _state: EntryFormState): boolean => {
      void _state;
      const negErr = checkNonNegative(value);
      if (negErr) {
        setErrors((prev) => ({ ...prev, [field]: negErr }));
        return false;
      }
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      return true;
    },
    []
  );

  const validateAll = useCallback((state: EntryFormState): boolean => {
    const errs: ValidationErrors = {};

    // 売上必須: f2 (業務委託売上) または f3 (内勤社員売上) のどちらかは > 0
    const totalRev = num(state.outsourced_sales_revenue) + num(state.internal_staff_revenue);
    if (totalRev <= 0) {
      errs.outsourced_sales_revenue = "業務委託売上または内勤社員売上のいずれかを入力してください";
      errs.internal_staff_revenue = "業務委託売上または内勤社員売上のいずれかを入力してください";
    }

    // 対応件数必須: f5 (業務委託対応件数) または f6 (内勤社員対応件数) のどちらかは > 0
    const totalCnt = num(state.outsourced_response_count) + num(state.internal_staff_response_count);
    if (totalCnt <= 0) {
      errs.outsourced_response_count = "業務委託対応件数または内勤社員対応件数のいずれかを入力してください";
      errs.internal_staff_response_count = "業務委託対応件数または内勤社員対応件数のいずれかを入力してください";
    }

    // 各フィールド非負チェック
    (Object.keys(state) as Array<keyof EntryFormState>).forEach((k) => {
      if (k === "area_id" || k === "year" || k === "month" || k === "category") return;
      const v = state[k] as InputValue;
      const negErr = checkNonNegative(v);
      if (negErr) errs[k] = negErr;
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, []);

  const clearErrors = useCallback(() => setErrors({}), []);

  return { errors, validateField, validateAll, clearErrors };
}
