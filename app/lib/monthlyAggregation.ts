// PR c90-1: 日次差分 (entries.data JSONB) → 月次集計 (monthly_summaries) の SUM 集計関数。
//
// 設計 (R2/R3 対応):
//   - 単一 SQL transaction (atomic、roundtrip 1 回)
//   - WITH base AS (...) で base 列を SUM、その結果から派生列を計算 → UPSERT
//   - source='entries_aggregation', updated_at=NOW() で書き込み出所を記録
//   - 累積置換経路 (/api/import-monthly) とは別関数として完全分離
//
// 全列マッピングは docs/AGGREGATION_MAPPING.md を参照 (R5)。新列追加時は
// 本ファイルと AGGREGATION_MAPPING.md を必ず同時更新すること。
//
// 派生計算の semantic 詳細:
//   - total_revenue = SUM(outsourced_sales_revenue + internal_staff_revenue)
//   - total_count   = SUM(outsourced_response_count + internal_staff_response_count)
//   - unit_price    = total_revenue / NULLIF(total_count, 0)
//   - cpa           = SUM(ad_cost) / NULLIF(SUM(acquisition_count), 0)
//   - conv_rate     = SUM(acquisition_count) / NULLIF(SUM(call_count), 0) * 100
//   - ad_rate       = SUM(ad_cost) / NULLIF(total_revenue, 0) * 100
//   - help_unit_price = SUM(help_revenue) / NULLIF(SUM(help_count), 0)
//   - total_profit  = 業態別分岐 (locksmith は専用コスト列を使う)
//   - profit_rate   = total_profit / NULLIF(total_revenue, 0) * 100
//   - as_of_day     = EXTRACT(DAY FROM MAX(entry_date))
//   - vehicle_count = MAX (車両数は累積でなくスナップショット)
//   - trainee_count = MAX (研修生数も同扱い、PR c94-C)
//   - 分母 0 はすべて NULLIF + COALESCE(_, 0) で 0 に戻す (NULL を DB に書き込まない)

import { getSql, ensureSchema } from "./db";
// PR c95-D-4 (slice 4): water 控除を自動 7.7% から手入力 sum_consultant_fee 直接控除に切替。
//   旧 CONSULTANT_FEE_RATE は本ファイルでは未使用に。月境界定数 (202605) のみ流用。
//   slice 6 で consultantFee.ts ごと撤去予定 → 本ファイルの import は CONSULTANT_FEE_APPLIED_FROM_YYYYMM のみ。
import { CONSULTANT_FEE_APPLIED_FROM_YYYYMM, toYyyyMm } from "./consultantFee";

export type BusinessCategory = "water" | "electric" | "locksmith" | "road" | "detective";

/**
 * 指定エリア × 業態 × 年月 の entries 行群を SUM 集計し、
 * monthly_summaries に UPSERT する。
 *
 * @returns 影響を受けた monthly_summaries 行数 (常に 0 または 1)
 *
 * 実装メモ:
 *   - entries が 0 行の月でも UPSERT 実行 (全 0 値の monthly_summaries 行を作る)
 *     → caller 側で empty 月を skip するかどうか判断
 *   - source は固定値 'entries_aggregation'
 *   - business_category 引数は WHERE 句 + UPSERT 両方に使用
 *
 * 注意: 本関数を /api/import-monthly から呼んではならない。/api/import-monthly は
 *   累積置換モデルで source='file_import' を別途付与する独立経路。両経路の混在は
 *   R2 で禁止されている。
 */
export async function aggregateMonthlySummary(
  areaId: string,
  category: BusinessCategory,
  year: number,
  month: number,
): Promise<number> {
  await ensureSchema();
  const sql = getSql();

  // PR c95-D-4 (slice 4): 水道 consultant fee 控除を「自動 7.7%」から「手入力 sum_consultant_fee」に切替。
  //   旧 c95-B-2: water + yyyymm >= 202605 で revenue × 0.077 を控除
  //   新 c95-D-4: water + yyyymm >= 202605 で SUM(entries.data.consultant_fee) を直接控除
  //   - 月境界 (yyyymm >= 202605) は維持: 4 月以前 entries (109 行) は applyConsult=false で控除式従来通り → 絶対不変
  //   - 他業態 (electric/locksmith/road/detective): applyConsult=false で控除なし、従来通り
  //   - sum_consultant_fee は base CTE で常に SUM 計算済 (slice 1 で追加、entries.data に
  //     キー無いと COALESCE で 0、water 以外も UI 非表示 + 送信時 0 で実質 0)
  //   - 本 slice 4 で本番 DB の water 5 月以降 7 行を re-aggregate 必須 (別スクリプト)
  //     未 re-aggregate なら DB 値は旧 c95-B-2 自動 7.7% 控除値のまま (脆い両立期間)
  const yyyymm = toYyyyMm(year, month);
  const applyConsult = (category === "water" && yyyymm >= CONSULTANT_FEE_APPLIED_FROM_YYYYMM);

  // 業態別 total_profit 計算 (PR c95-D-4 で water 分岐を手入力ベースに改修):
  //   - locksmith: revenue - locksmith_construction_cost - material_cost - ad_cost - locksmith_commission_fee
  //   - water + yyyymm >= 202605: revenue - total_labor_cost - material_cost - ad_cost - sales_outsourcing_cost - card_processing_fee
  //                              - sum_consultant_fee (D-4 で 手入力 SUM に切替)
  //   - water + yyyymm <  202605: revenue - total_labor_cost - material_cost - ad_cost - sales_outsourcing_cost - card_processing_fee
  //                              (4 月以前、絶対不変。consultant_fee は SUM=0 だが式から完全に除外)
  //   - その他   : revenue - total_labor_cost - material_cost - ad_cost - sales_outsourcing_cost - card_processing_fee
  //               (electric/road/detective、コンサル費控除 対象外、従来通り)
  //
  // PR c93-1: internal_construction_profit (f25) 加算は廃止済 (二重計上排除)。
  // SQL CASE WHEN で分岐。base CTE で両方分の構成要素を SUM しておき、SELECT 時に CASE で切替。
  // applyConsult を JS-side で評価し、SQL bind で渡す (SQL 内ハードコード回避)。

  // entries.data JSONB から numeric 抽出するヘルパは SQL inline で記述。
  // 不在フィールドは COALESCE(.., 0) で 0 に置き換え。
  const result = await sql`
    WITH base AS (
      SELECT
        -- A-1 共通 base 列
        COALESCE(SUM(COALESCE((data->>'outsourced_sales_revenue')::numeric, 0)), 0) AS sum_outsourced_sales_revenue,
        COALESCE(SUM(COALESCE((data->>'internal_staff_revenue')::numeric, 0)), 0) AS sum_internal_staff_revenue,
        COALESCE(SUM(COALESCE((data->>'outsourced_response_count')::numeric, 0)), 0) AS sum_outsourced_response_count,
        COALESCE(SUM(COALESCE((data->>'internal_staff_response_count')::numeric, 0)), 0) AS sum_internal_staff_response_count,
        COALESCE(SUM(COALESCE((data->>'repeat_count')::numeric, 0)), 0) AS sum_repeat_count,
        COALESCE(SUM(COALESCE((data->>'revisit_count')::numeric, 0)), 0) AS sum_revisit_count,
        COALESCE(SUM(COALESCE((data->>'review_count')::numeric, 0)), 0) AS sum_review_count,
        COALESCE(SUM(COALESCE((data->>'total_labor_cost')::numeric, 0)), 0) AS sum_total_labor_cost,
        COALESCE(SUM(COALESCE((data->>'material_cost')::numeric, 0)), 0) AS sum_material_cost,
        COALESCE(SUM(COALESCE((data->>'sales_outsourcing_cost')::numeric, 0)), 0) AS sum_sales_outsourcing_cost,
        COALESCE(SUM(COALESCE((data->>'card_processing_fee')::numeric, 0)), 0) AS sum_card_processing_fee,
        -- PR c95-D-1 (slice 1+2): water のみ手入力、他業態は entries.data に無 / 0 で集約も 0。
        --   slice 1+2 では SUM のみ実行し monthly_summaries.consultant_fee に保存。
        --   d_total_profit には未組込 (旧 c95-B-2 の 7.7% 自動控除が water 分には残ったまま)。
        --   slice 3 で d_total_profit の water 分岐を sum_consultant_fee 直接控除に切替予定。
        COALESCE(SUM(COALESCE((data->>'consultant_fee')::numeric, 0)), 0) AS sum_consultant_fee,
        COALESCE(SUM(COALESCE((data->>'ad_cost')::numeric, 0)), 0) AS sum_ad_cost,
        COALESCE(SUM(COALESCE((data->>'call_count')::numeric, 0)), 0) AS sum_call_count,
        COALESCE(SUM(COALESCE((data->>'acquisition_count')::numeric, 0)), 0) AS sum_acquisition_count,
        COALESCE(SUM(COALESCE((data->>'outsourced_construction_count')::numeric, 0)), 0) AS sum_outsourced_construction_count,
        COALESCE(SUM(COALESCE((data->>'internal_construction_count')::numeric, 0)), 0) AS sum_internal_construction_count,
        -- PR c93-2: 工事件数 (対応ベース) は construction_count を優先、欠落時は旧 sum で fallback。
        --   旧 5月 entries (construction_count キー未保存) → outsourced + internal の合算で初期化。
        --   c93-2 deploy 後の新規 entries → construction_count 直接使用。
        --   COALESCE chain: data->>construction_count IS NOT NULL なら値を採用 (0 でも)、
        --   それ以外で outsourced+internal の sum (両方欠落なら 0)。
        COALESCE(SUM(
          COALESCE(
            (data->>'construction_count')::numeric,
            COALESCE((data->>'outsourced_construction_count')::numeric, 0)
              + COALESCE((data->>'internal_construction_count')::numeric, 0)
          )
        ), 0) AS sum_construction_count,
        COALESCE(SUM(COALESCE((data->>'outsourced_construction_cost')::numeric, 0)), 0) AS sum_outsourced_construction_cost,
        COALESCE(SUM(COALESCE((data->>'internal_construction_profit')::numeric, 0)), 0) AS sum_internal_construction_profit,
        COALESCE(SUM(COALESCE((data->>'help_count')::numeric, 0)), 0) AS sum_help_count,
        COALESCE(SUM(COALESCE((data->>'help_revenue')::numeric, 0)), 0) AS sum_help_revenue,
        -- A-2 電気業態
        COALESCE(SUM(COALESCE((data->>'switchboard_count')::numeric, 0)), 0) AS sum_switchboard_count,
        -- A-3 鍵業態
        COALESCE(SUM(COALESCE((data->>'locksmith_car_lp_email_count')::numeric, 0)), 0) AS sum_locksmith_car_lp_email_count,
        COALESCE(SUM(COALESCE((data->>'locksmith_inhouse_count')::numeric, 0)), 0) AS sum_locksmith_inhouse_count,
        COALESCE(SUM(COALESCE((data->>'locksmith_repeat_count')::numeric, 0)), 0) AS sum_locksmith_repeat_count,
        COALESCE(SUM(COALESCE((data->>'locksmith_revisit_count')::numeric, 0)), 0) AS sum_locksmith_revisit_count,
        COALESCE(SUM(COALESCE((data->>'locksmith_construction_cost')::numeric, 0)), 0) AS sum_locksmith_construction_cost,
        COALESCE(SUM(COALESCE((data->>'locksmith_commission_fee')::numeric, 0)), 0) AS sum_locksmith_commission_fee,
        -- A-4 ロード業態 (獲得 7 + 入電 7 + 保険 2 + 販管費)
        COALESCE(SUM(COALESCE((data->>'road_ad_count')::numeric, 0)), 0) AS sum_road_ad_count,
        COALESCE(SUM(COALESCE((data->>'road_repeat_count')::numeric, 0)), 0) AS sum_road_repeat_count,
        COALESCE(SUM(COALESCE((data->>'road_referral_count')::numeric, 0)), 0) AS sum_road_referral_count,
        COALESCE(SUM(COALESCE((data->>'road_revisit_count')::numeric, 0)), 0) AS sum_road_revisit_count,
        COALESCE(SUM(COALESCE((data->>'road_wellnest_count')::numeric, 0)), 0) AS sum_road_wellnest_count,
        COALESCE(SUM(COALESCE((data->>'road_seo_count')::numeric, 0)), 0) AS sum_road_seo_count,
        COALESCE(SUM(COALESCE((data->>'road_insurance_count')::numeric, 0)), 0) AS sum_road_insurance_count,
        COALESCE(SUM(COALESCE((data->>'road_ad_call_count')::numeric, 0)), 0) AS sum_road_ad_call_count,
        COALESCE(SUM(COALESCE((data->>'road_repeat_call_count')::numeric, 0)), 0) AS sum_road_repeat_call_count,
        COALESCE(SUM(COALESCE((data->>'road_referral_call_count')::numeric, 0)), 0) AS sum_road_referral_call_count,
        COALESCE(SUM(COALESCE((data->>'road_revisit_call_count')::numeric, 0)), 0) AS sum_road_revisit_call_count,
        COALESCE(SUM(COALESCE((data->>'road_wellnest_call_count')::numeric, 0)), 0) AS sum_road_wellnest_call_count,
        COALESCE(SUM(COALESCE((data->>'road_seo_call_count')::numeric, 0)), 0) AS sum_road_seo_call_count,
        COALESCE(SUM(COALESCE((data->>'road_insurance_call_count')::numeric, 0)), 0) AS sum_road_insurance_call_count,
        COALESCE(SUM(COALESCE((data->>'road_insurance_revenue')::numeric, 0)), 0) AS sum_road_insurance_revenue,
        COALESCE(SUM(COALESCE((data->>'road_non_insurance_revenue')::numeric, 0)), 0) AS sum_road_non_insurance_revenue,
        COALESCE(SUM(COALESCE((data->>'road_selling_admin_cost')::numeric, 0)), 0) AS sum_road_selling_admin_cost,
        -- A-5 探偵業態 (面談 2 + 入電 4 + 獲得 6 + 販管費)
        COALESCE(SUM(COALESCE((data->>'detective_meeting_count')::numeric, 0)), 0) AS sum_detective_meeting_count,
        COALESCE(SUM(COALESCE((data->>'detective_cancel_count')::numeric, 0)), 0) AS sum_detective_cancel_count,
        COALESCE(SUM(COALESCE((data->>'detective_phone_only_call_count')::numeric, 0)), 0) AS sum_detective_phone_only_call_count,
        COALESCE(SUM(COALESCE((data->>'detective_mail_only_call_count')::numeric, 0)), 0) AS sum_detective_mail_only_call_count,
        COALESCE(SUM(COALESCE((data->>'detective_line_only_call_count')::numeric, 0)), 0) AS sum_detective_line_only_call_count,
        COALESCE(SUM(COALESCE((data->>'detective_wrong_call_count')::numeric, 0)), 0) AS sum_detective_wrong_call_count,
        COALESCE(SUM(COALESCE((data->>'detective_phone_uwaki_acquisition_count')::numeric, 0)), 0) AS sum_detective_phone_uwaki_acquisition_count,
        COALESCE(SUM(COALESCE((data->>'detective_phone_other_acquisition_count')::numeric, 0)), 0) AS sum_detective_phone_other_acquisition_count,
        COALESCE(SUM(COALESCE((data->>'detective_mail_uwaki_acquisition_count')::numeric, 0)), 0) AS sum_detective_mail_uwaki_acquisition_count,
        COALESCE(SUM(COALESCE((data->>'detective_mail_other_acquisition_count')::numeric, 0)), 0) AS sum_detective_mail_other_acquisition_count,
        COALESCE(SUM(COALESCE((data->>'detective_line_uwaki_acquisition_count')::numeric, 0)), 0) AS sum_detective_line_uwaki_acquisition_count,
        COALESCE(SUM(COALESCE((data->>'detective_line_other_acquisition_count')::numeric, 0)), 0) AS sum_detective_line_other_acquisition_count,
        COALESCE(SUM(COALESCE((data->>'detective_selling_admin_cost')::numeric, 0)), 0) AS sum_detective_selling_admin_cost,
        -- C 特殊扱い
        COALESCE(MAX(COALESCE((data->>'vehicle_count')::int, 0)), 0) AS max_vehicle_count,
        COALESCE(MAX(COALESCE((data->>'trainee_count')::int, 0)), 0) AS max_trainee_count,
        COALESCE(EXTRACT(DAY FROM MAX(entry_date))::INT, 1) AS as_of_day_calc
      FROM entries
      WHERE area_id = ${areaId}
        AND business_category = ${category}
        AND entry_date >= MAKE_DATE(${year}, ${month}, 1)
        AND entry_date < (MAKE_DATE(${year}, ${month}, 1) + INTERVAL '1 month')
    ),
    derived AS (
      SELECT
        b.*,
        -- 派生: total_revenue / total_count
        (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue) AS d_total_revenue,
        (b.sum_outsourced_response_count + b.sum_internal_staff_response_count) AS d_total_count,
        -- 派生: total_profit (業態別分岐)
        -- PR c93-1: ELSE 分岐から内製化ボーナス加算 (+ sum_internal_construction_profit) を
        --   撤去。各社統計で既に自社施工分を粗利に織り込み済 → 二重計上だった。
        --   monthly_summaries.internal_construction_profit カラムは保持し、SUM 結果も
        --   引き続き格納 (把握用)。total_profit にだけ加算しない設計に変更。
        --   locksmith 分岐は元から加算なしのため変更不要。
        -- PR c95-D-4 (slice 4): water 分岐を「revenue × 0.077」から「sum_consultant_fee」直接控除に切替。
        --   applyConsult は JS-side で評価しパラメータ binding (water + yyyymm >= 202605 で true、それ以外で false)。
        --   water + applyConsult=true: 末尾 - b.sum_consultant_fee (= 手入力 SUM)
        --   water + applyConsult=false (= 4 月以前): 控除式から sum_consultant_fee を完全に除外
        --     (sum_consultant_fee は base CTE で常に SUM 計算されるが、ここで参照しないので 4 月以前 entries
        --      に consultant_fee キーが偶然書き込まれても粗利には絶対に反映されない = 絶対不変ガード)
        --   electric/road/detective の ELSE 分岐は無変更 (c93-1 / c95-B-2 と完全互換)。
        --   locksmith 分岐も無変更 (元から consultant_fee 概念なし)。
        CASE
          WHEN ${category} = 'locksmith' THEN
            (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
            - b.sum_locksmith_construction_cost
            - b.sum_material_cost
            - b.sum_ad_cost
            - b.sum_locksmith_commission_fee
          WHEN ${category} = 'water' AND ${applyConsult}::boolean THEN
            (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
            - b.sum_total_labor_cost
            - b.sum_material_cost
            - b.sum_ad_cost
            - b.sum_sales_outsourcing_cost
            - b.sum_card_processing_fee
            - b.sum_consultant_fee
          WHEN ${category} = 'water' THEN
            -- water + yyyymm < 202605 (4 月以前): consultant_fee 完全除外 (絶対不変)
            (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
            - b.sum_total_labor_cost
            - b.sum_material_cost
            - b.sum_ad_cost
            - b.sum_sales_outsourcing_cost
            - b.sum_card_processing_fee
          ELSE
            (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
            - b.sum_total_labor_cost
            - b.sum_material_cost
            - b.sum_ad_cost
            - b.sum_sales_outsourcing_cost
            - b.sum_card_processing_fee
        END AS d_total_profit
      FROM base b
    )
    -- PR c91 (root cause fix): 派生計算で divisor=0 のとき NULLIF → NULL → ROUND(NULL) → NULL
    --   になり、INT NOT NULL / NUMERIC NOT NULL の monthly_summaries 列に NULL を
    --   挿入しようとして "null value in column ... violates not-null constraint" で失敗
    --   していた (user 本番再現: outsourced_sales_revenue=1 のみで他 0 のため分母 0)。
    --   各派生列を COALESCE(..., 0) で wrap し、NULL → 0 に正規化する。
    --   c91 edge-case test で再発防止検証済。
    INSERT INTO monthly_summaries (
      area_id, business_category, year, month,
      -- 派生 + base
      total_revenue, total_profit, total_count, unit_price,
      ad_cost, ad_rate, acquisition_count, cpa,
      call_count, call_unit_price, conv_rate, profit_rate,
      help_revenue, help_count, help_unit_price,
      vehicle_count, trainee_count, as_of_day,
      -- A-1 共通 base 列で monthly_summaries に列がある分
      outsourced_sales_revenue, internal_staff_revenue,
      outsourced_response_count, internal_staff_response_count,
      repeat_count, revisit_count, review_count,
      total_labor_cost, material_cost, sales_outsourcing_cost, card_processing_fee,
      consultant_fee, -- PR c95-D-1 (slice 1+2): water 専用手入力。他業態は SUM=0 で保存。
      outsourced_construction_count, internal_construction_count,
      outsourced_construction_cost, internal_construction_profit,
      construction_count, -- PR c93-2: 対応ベース工事件数
      -- A-2 電気
      switchboard_count,
      -- A-3 鍵
      locksmith_car_lp_email_count, locksmith_inhouse_count,
      locksmith_repeat_count, locksmith_revisit_count,
      locksmith_construction_cost, locksmith_commission_fee,
      -- A-4 ロード
      road_ad_count, road_repeat_count, road_referral_count, road_revisit_count,
      road_wellnest_count, road_seo_count, road_insurance_count,
      road_ad_call_count, road_repeat_call_count, road_referral_call_count,
      road_revisit_call_count, road_wellnest_call_count, road_seo_call_count,
      road_insurance_call_count, road_insurance_revenue, road_non_insurance_revenue,
      road_selling_admin_cost,
      -- A-5 探偵
      detective_meeting_count, detective_cancel_count,
      detective_phone_only_call_count, detective_mail_only_call_count,
      detective_line_only_call_count, detective_wrong_call_count,
      detective_phone_uwaki_acquisition_count, detective_phone_other_acquisition_count,
      detective_mail_uwaki_acquisition_count, detective_mail_other_acquisition_count,
      detective_line_uwaki_acquisition_count, detective_line_other_acquisition_count,
      detective_selling_admin_cost,
      -- R3 出所追跡
      source, updated_at
    )
    SELECT
      ${areaId}, ${category}, ${year}, ${month},
      ROUND(d.d_total_revenue)::BIGINT,
      ROUND(d.d_total_profit)::BIGINT,
      ROUND(d.d_total_count)::INT,
      -- PR c91: divisor=0 で NULL になる派生列を COALESCE(..., 0) で wrap
      COALESCE(ROUND(d.d_total_revenue / NULLIF(d.d_total_count, 0))::INT, 0),
      ROUND(d.sum_ad_cost)::BIGINT,
      COALESCE(ROUND(d.sum_ad_cost / NULLIF(d.d_total_revenue, 0) * 100 * 10) / 10, 0),
      ROUND(d.sum_acquisition_count)::INT,
      COALESCE(ROUND(d.sum_ad_cost / NULLIF(d.sum_acquisition_count, 0))::INT, 0),
      ROUND(d.sum_call_count)::INT,
      COALESCE(ROUND(d.sum_ad_cost / NULLIF(d.sum_call_count, 0))::INT, 0),
      COALESCE(ROUND(d.sum_acquisition_count / NULLIF(d.sum_call_count, 0) * 100 * 10) / 10, 0),
      COALESCE(ROUND(d.d_total_profit / NULLIF(d.d_total_revenue, 0) * 100 * 10) / 10, 0),
      ROUND(d.sum_help_revenue)::BIGINT,
      ROUND(d.sum_help_count)::INT,
      COALESCE(ROUND(d.sum_help_revenue / NULLIF(d.sum_help_count, 0))::INT, 0),
      d.max_vehicle_count,
      d.max_trainee_count,
      COALESCE(d.as_of_day_calc, 1),  -- PR c91: entries 0 行のとき MAX(date)=NULL → 1 にフォールバック
      d.sum_outsourced_sales_revenue, d.sum_internal_staff_revenue,
      d.sum_outsourced_response_count, d.sum_internal_staff_response_count,
      d.sum_repeat_count, d.sum_revisit_count, d.sum_review_count,
      d.sum_total_labor_cost, d.sum_material_cost, d.sum_sales_outsourcing_cost, d.sum_card_processing_fee,
      d.sum_consultant_fee, -- PR c95-D-1 (slice 1+2)
      d.sum_outsourced_construction_count, d.sum_internal_construction_count,
      d.sum_outsourced_construction_cost, d.sum_internal_construction_profit,
      d.sum_construction_count, -- PR c93-2
      d.sum_switchboard_count,
      d.sum_locksmith_car_lp_email_count, d.sum_locksmith_inhouse_count,
      d.sum_locksmith_repeat_count, d.sum_locksmith_revisit_count,
      d.sum_locksmith_construction_cost, d.sum_locksmith_commission_fee,
      d.sum_road_ad_count, d.sum_road_repeat_count, d.sum_road_referral_count, d.sum_road_revisit_count,
      d.sum_road_wellnest_count, d.sum_road_seo_count, d.sum_road_insurance_count,
      d.sum_road_ad_call_count, d.sum_road_repeat_call_count, d.sum_road_referral_call_count,
      d.sum_road_revisit_call_count, d.sum_road_wellnest_call_count, d.sum_road_seo_call_count,
      d.sum_road_insurance_call_count, d.sum_road_insurance_revenue, d.sum_road_non_insurance_revenue,
      d.sum_road_selling_admin_cost,
      d.sum_detective_meeting_count, d.sum_detective_cancel_count,
      d.sum_detective_phone_only_call_count, d.sum_detective_mail_only_call_count,
      d.sum_detective_line_only_call_count, d.sum_detective_wrong_call_count,
      d.sum_detective_phone_uwaki_acquisition_count, d.sum_detective_phone_other_acquisition_count,
      d.sum_detective_mail_uwaki_acquisition_count, d.sum_detective_mail_other_acquisition_count,
      d.sum_detective_line_uwaki_acquisition_count, d.sum_detective_line_other_acquisition_count,
      d.sum_detective_selling_admin_cost,
      'entries_aggregation', NOW()
    FROM derived d
    ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
      total_revenue = EXCLUDED.total_revenue,
      total_profit = EXCLUDED.total_profit,
      total_count = EXCLUDED.total_count,
      unit_price = EXCLUDED.unit_price,
      ad_cost = EXCLUDED.ad_cost,
      ad_rate = EXCLUDED.ad_rate,
      acquisition_count = EXCLUDED.acquisition_count,
      cpa = EXCLUDED.cpa,
      call_count = EXCLUDED.call_count,
      call_unit_price = EXCLUDED.call_unit_price,
      conv_rate = EXCLUDED.conv_rate,
      profit_rate = EXCLUDED.profit_rate,
      help_revenue = EXCLUDED.help_revenue,
      help_count = EXCLUDED.help_count,
      help_unit_price = EXCLUDED.help_unit_price,
      vehicle_count = EXCLUDED.vehicle_count,
      trainee_count = EXCLUDED.trainee_count,
      as_of_day = EXCLUDED.as_of_day,
      outsourced_sales_revenue = EXCLUDED.outsourced_sales_revenue,
      internal_staff_revenue = EXCLUDED.internal_staff_revenue,
      outsourced_response_count = EXCLUDED.outsourced_response_count,
      internal_staff_response_count = EXCLUDED.internal_staff_response_count,
      repeat_count = EXCLUDED.repeat_count,
      revisit_count = EXCLUDED.revisit_count,
      review_count = EXCLUDED.review_count,
      total_labor_cost = EXCLUDED.total_labor_cost,
      material_cost = EXCLUDED.material_cost,
      sales_outsourcing_cost = EXCLUDED.sales_outsourcing_cost,
      card_processing_fee = EXCLUDED.card_processing_fee,
      consultant_fee = EXCLUDED.consultant_fee, -- PR c95-D-1 (slice 1+2)
      outsourced_construction_count = EXCLUDED.outsourced_construction_count,
      internal_construction_count = EXCLUDED.internal_construction_count,
      outsourced_construction_cost = EXCLUDED.outsourced_construction_cost,
      internal_construction_profit = EXCLUDED.internal_construction_profit,
      construction_count = EXCLUDED.construction_count, -- PR c93-2
      switchboard_count = EXCLUDED.switchboard_count,
      locksmith_car_lp_email_count = EXCLUDED.locksmith_car_lp_email_count,
      locksmith_inhouse_count = EXCLUDED.locksmith_inhouse_count,
      locksmith_repeat_count = EXCLUDED.locksmith_repeat_count,
      locksmith_revisit_count = EXCLUDED.locksmith_revisit_count,
      locksmith_construction_cost = EXCLUDED.locksmith_construction_cost,
      locksmith_commission_fee = EXCLUDED.locksmith_commission_fee,
      road_ad_count = EXCLUDED.road_ad_count,
      road_repeat_count = EXCLUDED.road_repeat_count,
      road_referral_count = EXCLUDED.road_referral_count,
      road_revisit_count = EXCLUDED.road_revisit_count,
      road_wellnest_count = EXCLUDED.road_wellnest_count,
      road_seo_count = EXCLUDED.road_seo_count,
      road_insurance_count = EXCLUDED.road_insurance_count,
      road_ad_call_count = EXCLUDED.road_ad_call_count,
      road_repeat_call_count = EXCLUDED.road_repeat_call_count,
      road_referral_call_count = EXCLUDED.road_referral_call_count,
      road_revisit_call_count = EXCLUDED.road_revisit_call_count,
      road_wellnest_call_count = EXCLUDED.road_wellnest_call_count,
      road_seo_call_count = EXCLUDED.road_seo_call_count,
      road_insurance_call_count = EXCLUDED.road_insurance_call_count,
      road_insurance_revenue = EXCLUDED.road_insurance_revenue,
      road_non_insurance_revenue = EXCLUDED.road_non_insurance_revenue,
      road_selling_admin_cost = EXCLUDED.road_selling_admin_cost,
      detective_meeting_count = EXCLUDED.detective_meeting_count,
      detective_cancel_count = EXCLUDED.detective_cancel_count,
      detective_phone_only_call_count = EXCLUDED.detective_phone_only_call_count,
      detective_mail_only_call_count = EXCLUDED.detective_mail_only_call_count,
      detective_line_only_call_count = EXCLUDED.detective_line_only_call_count,
      detective_wrong_call_count = EXCLUDED.detective_wrong_call_count,
      detective_phone_uwaki_acquisition_count = EXCLUDED.detective_phone_uwaki_acquisition_count,
      detective_phone_other_acquisition_count = EXCLUDED.detective_phone_other_acquisition_count,
      detective_mail_uwaki_acquisition_count = EXCLUDED.detective_mail_uwaki_acquisition_count,
      detective_mail_other_acquisition_count = EXCLUDED.detective_mail_other_acquisition_count,
      detective_line_uwaki_acquisition_count = EXCLUDED.detective_line_uwaki_acquisition_count,
      detective_line_other_acquisition_count = EXCLUDED.detective_line_other_acquisition_count,
      detective_selling_admin_cost = EXCLUDED.detective_selling_admin_cost,
      source = EXCLUDED.source,
      updated_at = EXCLUDED.updated_at
  `;

  // neon driver は INSERT/UPDATE で rowCount を返さないが、INSERT ... SELECT FROM derived
  // は base CTE が常に 1 行なので 必ず 1 行 UPSERT される。明示返却:
  void result;
  return 1;
}
