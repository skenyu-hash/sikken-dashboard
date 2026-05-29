# Monthly Aggregation Mapping (PR c90-1)

`app/lib/monthlyAggregation.ts` の `aggregateMonthlySummary()` が、
`entries.data` (JSONB、日次差分) を `monthly_summaries` (月次集計、1 行 / 業態 / 月) に
SUM 集計する際の **列マッピング全件表**。

新列を追加する PR では本ファイルを必ず更新すること (R5、KNOWN_ISSUES.md §7 の
「monthly_summaries 新列追加時の必須 E2E 検証手順」と整合)。

---

## A. base SUM columns (entries.data → monthly_summaries 直接 SUM)

各列は `SUM(COALESCE((data->>'<json_field>')::numeric, 0))` で集計。
JSON フィールド名は `app/entry/types.ts#EntryFormState` のキーと一致。

### A-1. 共通 (water/electric/locksmith/road/detective 全業態で発生)

| monthly_summaries 列 | entries.data フィールド | 集計 |
|---|---|---|
| outsourced_sales_revenue | outsourced_sales_revenue | SUM |
| internal_staff_revenue | internal_staff_revenue | SUM |
| outsourced_response_count | outsourced_response_count | SUM |
| internal_staff_response_count | internal_staff_response_count | SUM |
| repeat_count | repeat_count | SUM |
| revisit_count | revisit_count | SUM |
| review_count | review_count | SUM |
| total_labor_cost | total_labor_cost | SUM |
| material_cost | material_cost | SUM |
| sales_outsourcing_cost | sales_outsourcing_cost | SUM |
| card_processing_fee | card_processing_fee | SUM |
| ad_cost | ad_cost | SUM |
| call_count | call_count | SUM |
| acquisition_count | acquisition_count | SUM |
| outsourced_construction_count | outsourced_construction_count | SUM |
| internal_construction_count | internal_construction_count | SUM |
| outsourced_construction_cost | outsourced_construction_cost | SUM |
| internal_construction_profit | internal_construction_profit | SUM |
| help_count | help_count | SUM |
| help_revenue | help_revenue | SUM |

### A-2. 電気業態専用 (PR #48b)

| 列 | フィールド | 集計 |
|---|---|---|
| switchboard_count | switchboard_count | SUM |

### A-3. 鍵業態専用 (PR #51)

| 列 | フィールド | 集計 |
|---|---|---|
| locksmith_car_lp_email_count | locksmith_car_lp_email_count | SUM |
| locksmith_inhouse_count | locksmith_inhouse_count | SUM |
| locksmith_repeat_count | locksmith_repeat_count | SUM |
| locksmith_revisit_count | locksmith_revisit_count | SUM |
| locksmith_construction_cost | locksmith_construction_cost | SUM |
| locksmith_commission_fee | locksmith_commission_fee | SUM |

### A-4. ロード業態専用 (PR #52 + #58c)

| 列 | フィールド | 集計 |
|---|---|---|
| road_ad_count | road_ad_count | SUM |
| road_repeat_count | road_repeat_count | SUM |
| road_referral_count | road_referral_count | SUM |
| road_revisit_count | road_revisit_count | SUM |
| road_wellnest_count | road_wellnest_count | SUM |
| road_seo_count | road_seo_count | SUM |
| road_insurance_count | road_insurance_count | SUM |
| road_ad_call_count | road_ad_call_count | SUM |
| road_repeat_call_count | road_repeat_call_count | SUM |
| road_referral_call_count | road_referral_call_count | SUM |
| road_revisit_call_count | road_revisit_call_count | SUM |
| road_wellnest_call_count | road_wellnest_call_count | SUM |
| road_seo_call_count | road_seo_call_count | SUM |
| road_insurance_call_count | road_insurance_call_count | SUM |
| road_insurance_revenue | road_insurance_revenue | SUM |
| road_non_insurance_revenue | road_non_insurance_revenue | SUM |
| road_selling_admin_cost | road_selling_admin_cost | SUM |

### A-5. 探偵業態専用 (PR #53 + #57 + #58b)

| 列 | フィールド | 集計 |
|---|---|---|
| detective_meeting_count | detective_meeting_count | SUM |
| detective_cancel_count | detective_cancel_count | SUM |
| detective_phone_only_call_count | detective_phone_only_call_count | SUM |
| detective_mail_only_call_count | detective_mail_only_call_count | SUM |
| detective_line_only_call_count | detective_line_only_call_count | SUM |
| detective_wrong_call_count | detective_wrong_call_count | SUM |
| detective_phone_uwaki_acquisition_count | detective_phone_uwaki_acquisition_count | SUM |
| detective_phone_other_acquisition_count | detective_phone_other_acquisition_count | SUM |
| detective_mail_uwaki_acquisition_count | detective_mail_uwaki_acquisition_count | SUM |
| detective_mail_other_acquisition_count | detective_mail_other_acquisition_count | SUM |
| detective_line_uwaki_acquisition_count | detective_line_uwaki_acquisition_count | SUM |
| detective_line_other_acquisition_count | detective_line_other_acquisition_count | SUM |
| detective_selling_admin_cost | detective_selling_admin_cost | SUM |

---

## B. 派生列 (base SUM から SQL 内で計算)

分母 0 ガードは `NULLIF(分母, 0)` で除算結果を NULL → `COALESCE(..., 0)` で 0 に戻す。

| 列 | 算出式 | 備考 |
|---|---|---|
| total_revenue | `SUM(outsourced_sales_revenue) + SUM(internal_staff_revenue)` | f1 = f2 + f3 (types.ts AutoCalcResult) |
| total_count | `SUM(outsourced_response_count) + SUM(internal_staff_response_count)` | f4 = f5 + f6 |
| unit_price | `total_revenue / NULLIF(total_count, 0)` | f7 = f1 / f4 |
| cpa | `SUM(ad_cost) / NULLIF(SUM(acquisition_count), 0)` | f19 = f15 / f18 |
| call_unit_price | `SUM(ad_cost) / NULLIF(SUM(call_count), 0)` | f17 = f15 / f16 |
| conv_rate | `SUM(acquisition_count) / NULLIF(SUM(call_count), 0) * 100` | f20 = f18 / f16 × 100 |
| ad_rate | `SUM(ad_cost) / NULLIF(total_revenue, 0) * 100` | UI: 広告費率 |
| help_unit_price | `SUM(help_revenue) / NULLIF(SUM(help_count), 0)` | f29 = f28 / f27 |
| profit_rate | `total_profit / NULLIF(total_revenue, 0) * 100` | UI: 粗利率 |
| total_profit | **業態別分岐** (下記 B-1) | f31 = f30 + f25 (auto) |
| as_of_day | `EXTRACT(DAY FROM MAX(entry_date))::INT` | 入力日の最大値 |

### B-1. total_profit 業態別分岐

| business_category | 算出式 |
|---|---|
| water / electric / road / detective | `total_revenue - SUM(total_labor_cost + material_cost + ad_cost + sales_outsourcing_cost + card_processing_fee)` (f30) + `SUM(internal_construction_profit)` (f25) |
| locksmith | `total_revenue - SUM(locksmith_construction_cost + material_cost + ad_cost + locksmith_commission_fee)` (鍵業態は工事費・手数料が専用列、PR #51) |

SQL では `CASE WHEN business_category = 'locksmith' THEN ... ELSE ... END` で切替。

---

## C. 集計しない / 特殊扱い

| 列 | 扱い |
|---|---|
| vehicle_count | **MAX**(`(data->>'vehicle_count')::int`) — 車両数は累積でなく当日スナップショット最大値 |
| trainee_count | **MAX**(`(data->>'trainee_count')::int`) — 研修生(営業マン)数も累積でなくスナップショット (PR c94-C) |
| source | 定数 `'entries_aggregation'` (R3) |
| updated_at | 定数 `NOW()` (R3) |
| created_at | 既存値保持 (UPSERT で更新しない) |

---

## D. SQL 単一 transaction 構造

```sql
WITH base AS (
  SELECT
    -- base SUMs (A-1 〜 A-5)
    COALESCE(SUM((data->>'outsourced_sales_revenue')::numeric), 0) AS sum_outsourced_sales_revenue,
    -- ... 60+ 列 ...
    -- 特殊
    COALESCE(MAX((data->>'vehicle_count')::int), 0) AS max_vehicle_count,
    COALESCE(MAX((data->>'trainee_count')::int), 0) AS max_trainee_count,
    EXTRACT(DAY FROM MAX(entry_date))::INT AS as_of_day_calc
  FROM entries
  WHERE area_id = $1 AND business_category = $2
    AND entry_date >= MAKE_DATE($3, $4, 1)
    AND entry_date < MAKE_DATE($3, $4, 1) + INTERVAL '1 month'
)
INSERT INTO monthly_summaries (
  area_id, business_category, year, month,
  -- base 列群 + 派生列群 ...
  source, updated_at
)
SELECT
  $1, $2, $3, $4,
  -- 派生列 (B): NULLIF ガード付き
  -- base 列 (A): そのまま base.sum_xxx
  'entries_aggregation', NOW()
FROM base
ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
  -- 全列を EXCLUDED で上書き、source と updated_at も更新
  ...;
```

- 単一 SQL → atomic
- entries が 0 行でも INSERT (全 0 値 + as_of_day=NULL) → なお、空の月は集計不要なので caller 側で skip 推奨

---

## E. 新列を追加する PR では

1. **entries.data 側** — `EntryFormState` (`app/entry/types.ts`) にフィールド追加
2. **monthly_summaries 側** — `app/lib/db.ts` ensureSchema に ALTER ADD COLUMN
3. **本ファイル** — 該当セクション (A-1 〜 A-5 or B) に列を追加
4. **`app/lib/monthlyAggregation.ts`** — SUM/MAX/派生計算ロジックに列を追加
5. **`app/api/import-monthly/route.ts`** — INSERT/VALUES/ON CONFLICT 3 セクションに列追加 (KNOWN_ISSUES §7)
6. **`scripts/test-monthly-aggregation.ts`** — 新列が SUM される検証ケース追加
7. **`scripts/test-import-monthly-integration.ts`** — `PR38_NEW_COLUMNS` 等に追加

漏れがあると「データは保存されるが画面に値が出ない」事故 (PR #38/#41/#42 同型) が再発する。
