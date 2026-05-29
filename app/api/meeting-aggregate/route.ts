// PR c94-A: /meeting 旬独立集計 read-only API。
//
// 設計:
//   - aggregateMonthlySummary (monthlyAggregation.ts) の SQL を流用 (Web Claude Q5=a 承認)
//   - WHERE 句に entry_date BETWEEN start_day〜end_day を追加し旬範囲に絞り込み
//   - INSERT INTO monthly_summaries は削除 (read-only、書き込みなし)
//   - SELECT FROM derived で ms 同形 JSON を返却 (各 Section 無修正で消費可)
//   - source: 'period_aggregation_in_memory' (虚偽の書き込みでないことを示す)
//
// 既存経路との分離:
//   - /api/monthly-summary: 月全体 1 行を SELECT (累積) — c94-A では /meeting 経路から外す
//   - /api/meeting-aggregate: 旬範囲を entries から SUM 集計して in-memory 返却 (新規)
//   - entries / monthly_summaries への書き込みは一切なし (read-only)
//
// 認証: なし (既存 /api/monthly-summary と一貫、Web Claude Q5=a 承認)
//
// TODO (技術負債、別 PR 候補): aggregateMonthlySummary の base/derived CTE と SQL コピー。
//   新フィールド追加時は両方を同期する必要 (AGENTS.md KNOWN_ISSUES §7 既存問題と同類)。
//   共通ヘルパー抽出は c94-A スコープ外、Web Claude Q5=a (コピーで進行) 判断。

import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureSchema } from "../../lib/db";
import type { BusinessCategory } from "../../lib/monthlyAggregation";

const VALID_CATEGORIES = ["water", "electric", "locksmith", "road", "detective"] as const;
const AREA_IDS = new Set([
  "kansai", "kanto", "nagoya", "kyushu",
  "kitakanto", "hokkaido", "chugoku", "shizuoka",
]);

function toBusinessCategory(s: string): BusinessCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(s)
    ? (s as BusinessCategory) : "water";
}

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area") ?? "";
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const category = toBusinessCategory(searchParams.get("category") ?? "water");
  const startDay = Number(searchParams.get("start_day"));
  const endDay = Number(searchParams.get("end_day"));

  if (!AREA_IDS.has(area)) return NextResponse.json({ error: "bad area" }, { status: 400 });
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    return NextResponse.json({ error: "bad year" }, { status: 400 });
  if (!Number.isInteger(month) || month < 1 || month > 12)
    return NextResponse.json({ error: "bad month" }, { status: 400 });
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31)
    return NextResponse.json({ error: "bad start_day" }, { status: 400 });
  if (!Number.isInteger(endDay) || endDay < startDay || endDay > 31)
    return NextResponse.json({ error: "bad end_day" }, { status: 400 });

  await ensureSchema();
  const sql = getSql();

  // base CTE / derived CTE は aggregateMonthlySummary と完全同一 (列追加時両方同期必要)。
  // WHERE 句のみ entry_date BETWEEN start_day〜end_day に変更。
  // INSERT INTO monthly_summaries は削除し SELECT FROM derived で ms 同形 JSON を返却。
  const rows = await sql`
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
        COALESCE(SUM(COALESCE((data->>'ad_cost')::numeric, 0)), 0) AS sum_ad_cost,
        COALESCE(SUM(COALESCE((data->>'call_count')::numeric, 0)), 0) AS sum_call_count,
        COALESCE(SUM(COALESCE((data->>'acquisition_count')::numeric, 0)), 0) AS sum_acquisition_count,
        COALESCE(SUM(COALESCE((data->>'outsourced_construction_count')::numeric, 0)), 0) AS sum_outsourced_construction_count,
        COALESCE(SUM(COALESCE((data->>'internal_construction_count')::numeric, 0)), 0) AS sum_internal_construction_count,
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
        -- A-4 ロード業態
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
        -- A-5 探偵業態
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
        EXTRACT(DAY FROM MAX(entry_date))::INT AS as_of_day_calc
      FROM entries
      WHERE area_id = ${area}
        AND business_category = ${category}
        AND entry_date >= MAKE_DATE(${year}, ${month}, ${startDay})
        AND entry_date < (MAKE_DATE(${year}, ${month}, ${endDay}) + INTERVAL '1 day')
    ),
    derived AS (
      SELECT
        b.*,
        (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue) AS d_total_revenue,
        (b.sum_outsourced_response_count + b.sum_internal_staff_response_count) AS d_total_count,
        CASE
          WHEN ${category} = 'locksmith' THEN
            (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
            - b.sum_locksmith_construction_cost
            - b.sum_material_cost
            - b.sum_ad_cost
            - b.sum_locksmith_commission_fee
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
    SELECT
      ${area} AS area_id, ${category} AS business_category, ${year} AS year, ${month} AS month,
      ROUND(d.d_total_revenue)::BIGINT AS total_revenue,
      ROUND(d.d_total_profit)::BIGINT AS total_profit,
      ROUND(d.d_total_count)::INT AS total_count,
      COALESCE(ROUND(d.d_total_revenue / NULLIF(d.d_total_count, 0))::INT, 0) AS unit_price,
      ROUND(d.sum_ad_cost)::BIGINT AS ad_cost,
      COALESCE(ROUND(d.sum_ad_cost / NULLIF(d.d_total_revenue, 0) * 100 * 10) / 10, 0) AS ad_rate,
      ROUND(d.sum_acquisition_count)::INT AS acquisition_count,
      COALESCE(ROUND(d.sum_ad_cost / NULLIF(d.sum_acquisition_count, 0))::INT, 0) AS cpa,
      ROUND(d.sum_call_count)::INT AS call_count,
      COALESCE(ROUND(d.sum_ad_cost / NULLIF(d.sum_call_count, 0))::INT, 0) AS call_unit_price,
      COALESCE(ROUND(d.sum_acquisition_count / NULLIF(d.sum_call_count, 0) * 100 * 10) / 10, 0) AS conv_rate,
      COALESCE(ROUND(d.d_total_profit / NULLIF(d.d_total_revenue, 0) * 100 * 10) / 10, 0) AS profit_rate,
      ROUND(d.sum_help_revenue)::BIGINT AS help_revenue,
      ROUND(d.sum_help_count)::INT AS help_count,
      COALESCE(ROUND(d.sum_help_revenue / NULLIF(d.sum_help_count, 0))::INT, 0) AS help_unit_price,
      d.max_vehicle_count AS vehicle_count,
      d.max_trainee_count AS trainee_count,
      COALESCE(d.as_of_day_calc, ${startDay}) AS as_of_day,
      d.sum_outsourced_sales_revenue AS outsourced_sales_revenue,
      d.sum_internal_staff_revenue AS internal_staff_revenue,
      d.sum_outsourced_response_count AS outsourced_response_count,
      d.sum_internal_staff_response_count AS internal_staff_response_count,
      d.sum_repeat_count AS repeat_count,
      d.sum_revisit_count AS revisit_count,
      d.sum_review_count AS review_count,
      d.sum_total_labor_cost AS total_labor_cost,
      d.sum_material_cost AS material_cost,
      d.sum_sales_outsourcing_cost AS sales_outsourcing_cost,
      d.sum_card_processing_fee AS card_processing_fee,
      d.sum_outsourced_construction_count AS outsourced_construction_count,
      d.sum_internal_construction_count AS internal_construction_count,
      d.sum_outsourced_construction_cost AS outsourced_construction_cost,
      d.sum_internal_construction_profit AS internal_construction_profit,
      d.sum_construction_count AS construction_count,
      d.sum_switchboard_count AS switchboard_count,
      d.sum_locksmith_car_lp_email_count AS locksmith_car_lp_email_count,
      d.sum_locksmith_inhouse_count AS locksmith_inhouse_count,
      d.sum_locksmith_repeat_count AS locksmith_repeat_count,
      d.sum_locksmith_revisit_count AS locksmith_revisit_count,
      d.sum_locksmith_construction_cost AS locksmith_construction_cost,
      d.sum_locksmith_commission_fee AS locksmith_commission_fee,
      d.sum_road_ad_count AS road_ad_count,
      d.sum_road_repeat_count AS road_repeat_count,
      d.sum_road_referral_count AS road_referral_count,
      d.sum_road_revisit_count AS road_revisit_count,
      d.sum_road_wellnest_count AS road_wellnest_count,
      d.sum_road_seo_count AS road_seo_count,
      d.sum_road_insurance_count AS road_insurance_count,
      d.sum_road_ad_call_count AS road_ad_call_count,
      d.sum_road_repeat_call_count AS road_repeat_call_count,
      d.sum_road_referral_call_count AS road_referral_call_count,
      d.sum_road_revisit_call_count AS road_revisit_call_count,
      d.sum_road_wellnest_call_count AS road_wellnest_call_count,
      d.sum_road_seo_call_count AS road_seo_call_count,
      d.sum_road_insurance_call_count AS road_insurance_call_count,
      d.sum_road_insurance_revenue AS road_insurance_revenue,
      d.sum_road_non_insurance_revenue AS road_non_insurance_revenue,
      d.sum_road_selling_admin_cost AS road_selling_admin_cost,
      d.sum_detective_meeting_count AS detective_meeting_count,
      d.sum_detective_cancel_count AS detective_cancel_count,
      d.sum_detective_phone_only_call_count AS detective_phone_only_call_count,
      d.sum_detective_mail_only_call_count AS detective_mail_only_call_count,
      d.sum_detective_line_only_call_count AS detective_line_only_call_count,
      d.sum_detective_wrong_call_count AS detective_wrong_call_count,
      d.sum_detective_phone_uwaki_acquisition_count AS detective_phone_uwaki_acquisition_count,
      d.sum_detective_phone_other_acquisition_count AS detective_phone_other_acquisition_count,
      d.sum_detective_mail_uwaki_acquisition_count AS detective_mail_uwaki_acquisition_count,
      d.sum_detective_mail_other_acquisition_count AS detective_mail_other_acquisition_count,
      d.sum_detective_line_uwaki_acquisition_count AS detective_line_uwaki_acquisition_count,
      d.sum_detective_line_other_acquisition_count AS detective_line_other_acquisition_count,
      d.sum_detective_selling_admin_cost AS detective_selling_admin_cost,
      'period_aggregation_in_memory' AS source
    FROM derived d
  `;

  return NextResponse.json({ summary: rows[0] ?? null });
}
