// c96-1: /api/range-aggregate (READ ONLY)。
//
// /daily-report の 2 軸拡張 (集計範囲 単日/期間 × 表示モード 合算/一覧) のためのバックエンド API。
//
// 設計:
//   - 既存 /api/meeting-aggregate を base にして拡張:
//     - 単一 area / 単一 category → 配列 + ANY による複数選択対応
//     - WHERE 句に from/to (YYYY-MM-DD) を追加 (単日は from=to)
//     - groupBy オプション追加 ("none" = 全 SUM 1 行 / "category_area" = 業態×エリア別 行配列)
//     - water 控除を c95-D-4 monthlyAggregation.ts と同形 (3 段 CASE: water+applyConsult /
//       water+4月以前 / その他) で実装 — meeting-aggregate は c95-B 時代のまま (2 段) で
//       本 API はそれを修正した最新仕様。
//   - 既存 /api/entries, /api/monthly-summary, /api/cross-matrix, /api/meeting-aggregate は
//     untouch (本 API は並走、後方互換維持)。
//   - 認証なし (既存 /api/meeting-aggregate と一貫)。
//
// 月境界の controle 判定:
//   from の yyyymm で applyConsult 判定 (water かつ from_yyyymm >= 202605)。
//   UI 側で「期間は同一月内限定」のガード必須 (月またぎは未定義動作)。
//
// 不変条件 (絶対制約):
//   - READ ONLY (entries / monthly_summaries 書き込み 0 件、SELECT のみ)
//   - 2026/4 以前データ保護: applyConsult ガードで yyyymm < 202605 のとき controle 0
//   - 不変条件 3 (monthly_summaries 優先 / entries.length>0 早期 return) は本 API では非該当
//     (caller 側で「合算月累計は monthly_summaries 経由」を別途実装する)
//
// パラメータ:
//   from        : YYYY-MM-DD (必須)
//   to          : YYYY-MM-DD (必須、単日は from と同値)
//   categories  : カンマ区切り (省略 / "all" = 全 5 業態)
//   areas       : カンマ区切り (省略 / "all" = 全 8 エリア)
//   group_by    : "none" (default) | "category_area"
//
// レスポンス:
//   group_by=none         : { rows: [{ ...monthly_summaries 同形 1 行 }] }
//   group_by=category_area: { rows: [{ business_category, area_id, ...集約値 }, ...] }
//   いずれも total_profit / total_revenue / 等の単位は既存 monthly_summaries と同じ。

import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureSchema } from "../../lib/db";

const VALID_CATEGORIES = ["water", "electric", "locksmith", "road", "detective"] as const;
const ALL_AREAS = [
  "kansai", "kanto", "nagoya", "kyushu",
  "kitakanto", "hokkaido", "chugoku", "shizuoka",
] as const;

const CONSULTANT_FEE_APPLIED_FROM_YYYYMM = 202605; // c95-D 月境界、4 月以前データ絶対不変ガード

type GroupBy = "none" | "category_area";

export const runtime = "nodejs";

function parseDateList(raw: string | null, allowed: readonly string[]): string[] {
  if (!raw || raw === "all") return Array.from(allowed);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allowed.includes(s));
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const categories = parseDateList(searchParams.get("categories"), VALID_CATEGORIES);
  const areas = parseDateList(searchParams.get("areas"), ALL_AREAS);
  const groupBy: GroupBy = searchParams.get("group_by") === "category_area" ? "category_area" : "none";

  if (!isValidDate(from)) return NextResponse.json({ error: "bad from (YYYY-MM-DD)" }, { status: 400 });
  if (!isValidDate(to)) return NextResponse.json({ error: "bad to (YYYY-MM-DD)" }, { status: 400 });
  if (from > to) return NextResponse.json({ error: "from > to" }, { status: 400 });
  if (categories.length === 0) return NextResponse.json({ error: "no valid categories" }, { status: 400 });
  if (areas.length === 0) return NextResponse.json({ error: "no valid areas" }, { status: 400 });

  // controle 判定: from の yyyymm 基準 (月またぎは UI ガード前提で未定義動作)
  const fromYear = Number(from.slice(0, 4));
  const fromMonth = Number(from.slice(5, 7));
  const fromYyyymm = fromYear * 100 + fromMonth;
  const applyConsult = fromYyyymm >= CONSULTANT_FEE_APPLIED_FROM_YYYYMM;
  // categories に water が含まれない場合は controle 完全 OFF (他業態のみの集計)
  const applyConsultEff = applyConsult && categories.includes("water");

  await ensureSchema();
  const sql = getSql();

  // SUM 集計用の SELECT 列リスト (CTE base 共通)。
  // 全 GROUP BY モードで同じ式を使うため変数化。
  // entries.data JSONB から numeric 抽出 + COALESCE で NULL を 0 に。
  //
  // 注: meeting-aggregate と完全同一の base 列 + c95-D-4 monthlyAggregation の sum_consultant_fee 追加。
  // 業態固有内訳項目 (locksmith_*, road_*, detective_*, switchboard_count 等) は groupBy="category_area"
  // で必要なため全て含める。groupBy="none" でも一緒に SUM するが、合算側 UI は表示しない方針 (Step 2)。

  const result = groupBy === "category_area"
    ? await sql`
        WITH base AS (
          SELECT
            business_category,
            area_id,
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
            COALESCE(SUM(COALESCE((data->>'consultant_fee')::numeric, 0)), 0) AS sum_consultant_fee,
            COALESCE(SUM(COALESCE((data->>'ad_cost')::numeric, 0)), 0) AS sum_ad_cost,
            COALESCE(SUM(COALESCE((data->>'call_count')::numeric, 0)), 0) AS sum_call_count,
            COALESCE(SUM(COALESCE((data->>'acquisition_count')::numeric, 0)), 0) AS sum_acquisition_count,
            COALESCE(SUM(COALESCE((data->>'help_revenue')::numeric, 0)), 0) AS sum_help_revenue,
            COALESCE(SUM(COALESCE((data->>'help_count')::numeric, 0)), 0) AS sum_help_count,
            COALESCE(SUM(COALESCE((data->>'locksmith_construction_cost')::numeric, 0)), 0) AS sum_locksmith_construction_cost,
            COALESCE(SUM(COALESCE((data->>'locksmith_commission_fee')::numeric, 0)), 0) AS sum_locksmith_commission_fee,
            COALESCE(MAX(COALESCE((data->>'vehicle_count')::int, 0)), 0) AS max_vehicle_count,
            COALESCE(MAX(COALESCE((data->>'trainee_count')::int, 0)), 0) AS max_trainee_count
          FROM entries
          WHERE business_category = ANY(${categories}::text[])
            AND area_id = ANY(${areas}::text[])
            AND entry_date >= ${from}::date
            AND entry_date <= ${to}::date
          GROUP BY business_category, area_id
        ),
        derived AS (
          SELECT
            b.*,
            (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue) AS d_total_revenue,
            (b.sum_outsourced_response_count + b.sum_internal_staff_response_count) AS d_total_count,
            -- water + applyConsult: c95-D-4 と同形 (sum_consultant_fee 直接控除)
            -- water + 4月以前    : sum_consultant_fee 完全除外 (絶対不変)
            -- locksmith          : 専用式
            -- ELSE               : 共通式
            CASE
              WHEN b.business_category = 'locksmith' THEN
                (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
                - b.sum_locksmith_construction_cost
                - b.sum_material_cost
                - b.sum_ad_cost
                - b.sum_locksmith_commission_fee
              WHEN b.business_category = 'water' AND ${applyConsult}::boolean THEN
                (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
                - b.sum_total_labor_cost
                - b.sum_material_cost
                - b.sum_ad_cost
                - b.sum_sales_outsourcing_cost
                - b.sum_card_processing_fee
                - b.sum_consultant_fee
              WHEN b.business_category = 'water' THEN
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
        SELECT
          d.business_category,
          d.area_id,
          ROUND(d.d_total_revenue)::BIGINT AS total_revenue,
          ROUND(d.d_total_profit)::BIGINT AS total_profit,
          ROUND(d.d_total_count)::INT AS total_count,
          COALESCE(ROUND(d.d_total_revenue / NULLIF(d.d_total_count, 0))::INT, 0) AS unit_price,
          ROUND(d.sum_ad_cost)::BIGINT AS ad_cost,
          ROUND(d.sum_acquisition_count)::INT AS acquisition_count,
          ROUND(d.sum_call_count)::INT AS call_count,
          COALESCE(ROUND(d.d_total_profit / NULLIF(d.d_total_revenue, 0) * 100 * 10) / 10, 0) AS profit_rate,
          ROUND(d.sum_help_revenue)::BIGINT AS help_revenue,
          ROUND(d.sum_help_count)::INT AS help_count,
          ROUND(d.sum_consultant_fee)::BIGINT AS consultant_fee,
          d.max_vehicle_count AS vehicle_count,
          d.max_trainee_count AS trainee_count
        FROM derived d
        ORDER BY d.business_category, d.area_id
      `
    : await sql`
        WITH base AS (
          SELECT
            -- 業態混在を想定、業態固有列も SUM するが UI 側で表示制御 (Step 2 方針)。
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
            -- water 限定 consultant_fee SUM (他業態は controle 対象外、誤って引かれないように FILTER)
            COALESCE(SUM(CASE WHEN business_category = 'water' THEN COALESCE((data->>'consultant_fee')::numeric, 0) ELSE 0 END), 0) AS sum_water_consultant_fee,
            COALESCE(SUM(COALESCE((data->>'ad_cost')::numeric, 0)), 0) AS sum_ad_cost,
            COALESCE(SUM(COALESCE((data->>'call_count')::numeric, 0)), 0) AS sum_call_count,
            COALESCE(SUM(COALESCE((data->>'acquisition_count')::numeric, 0)), 0) AS sum_acquisition_count,
            COALESCE(SUM(COALESCE((data->>'help_revenue')::numeric, 0)), 0) AS sum_help_revenue,
            COALESCE(SUM(COALESCE((data->>'help_count')::numeric, 0)), 0) AS sum_help_count,
            -- 業態混在合算では locksmith 専用コストも一緒に引く (他業態は 0 なので影響なし)
            COALESCE(SUM(COALESCE((data->>'locksmith_construction_cost')::numeric, 0)), 0) AS sum_locksmith_construction_cost,
            COALESCE(SUM(COALESCE((data->>'locksmith_commission_fee')::numeric, 0)), 0) AS sum_locksmith_commission_fee,
            COALESCE(MAX(COALESCE((data->>'vehicle_count')::int, 0)), 0) AS max_vehicle_count,
            COALESCE(MAX(COALESCE((data->>'trainee_count')::int, 0)), 0) AS max_trainee_count
          FROM entries
          WHERE business_category = ANY(${categories}::text[])
            AND area_id = ANY(${areas}::text[])
            AND entry_date >= ${from}::date
            AND entry_date <= ${to}::date
        ),
        derived AS (
          SELECT
            b.*,
            (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue) AS d_total_revenue,
            (b.sum_outsourced_response_count + b.sum_internal_staff_response_count) AS d_total_count,
            -- 業態混在の合算 profit:
            --   revenue - 共通コスト (labor/material/ad/sales_outsourcing/card) - locksmith 専用コスト
            --   - applyConsultEff のとき controle (water + 5月以降の場合のみ非 0)
            -- 業態混在で locksmith コストも引く: 他業態は 0 なので影響なし
            (b.sum_outsourced_sales_revenue + b.sum_internal_staff_revenue)
            - b.sum_total_labor_cost
            - b.sum_material_cost
            - b.sum_ad_cost
            - b.sum_sales_outsourcing_cost
            - b.sum_card_processing_fee
            - b.sum_locksmith_construction_cost
            - b.sum_locksmith_commission_fee
            - CASE WHEN ${applyConsultEff}::boolean THEN b.sum_water_consultant_fee ELSE 0 END
            AS d_total_profit
          FROM base b
        )
        SELECT
          'merged' AS business_category,
          'merged' AS area_id,
          ROUND(d.d_total_revenue)::BIGINT AS total_revenue,
          ROUND(d.d_total_profit)::BIGINT AS total_profit,
          ROUND(d.d_total_count)::INT AS total_count,
          COALESCE(ROUND(d.d_total_revenue / NULLIF(d.d_total_count, 0))::INT, 0) AS unit_price,
          ROUND(d.sum_ad_cost)::BIGINT AS ad_cost,
          ROUND(d.sum_acquisition_count)::INT AS acquisition_count,
          ROUND(d.sum_call_count)::INT AS call_count,
          COALESCE(ROUND(d.d_total_profit / NULLIF(d.d_total_revenue, 0) * 100 * 10) / 10, 0) AS profit_rate,
          ROUND(d.sum_help_revenue)::BIGINT AS help_revenue,
          ROUND(d.sum_help_count)::INT AS help_count,
          ROUND(d.sum_water_consultant_fee)::BIGINT AS consultant_fee,
          d.max_vehicle_count AS vehicle_count,
          d.max_trainee_count AS trainee_count
        FROM derived d
      `;

  return NextResponse.json({
    rows: result,
    meta: {
      from, to,
      categories,
      areas,
      group_by: groupBy,
      apply_consult: applyConsultEff,
      source: "range_aggregate_in_memory",
    },
  });
}
