import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";
import { num } from "../../lib/utils/numberCoerce";

type ImportRow = Record<string, unknown>;
type RowError = { index: number; error: string; area_id?: string };

// 受け入れキー名のエイリアス解決。プライマリキー（DB真キー）を最優先で
// 拾い、無ければレガシー命名（外部 JSON 由来）にフォールバック。
// PR #29 で発生した API キー名ミスマッチ事故（売上系が ¥0 で保存される）
// を再発させないための後方互換レイヤ。両方ある場合は必ずプライマリ勝ち。
const pick = (row: ImportRow, ...keys: string[]): unknown =>
  keys.map((k) => row[k]).find((v) => v !== undefined && v !== null && v !== "");

export async function POST(req: NextRequest) {
  let rows: ImportRow[] = [];
  let cat: string = "water";
  let asOfDay: number = 0;
  try {
    const body = await req.json();
    rows = Array.isArray(body?.rows) ? body.rows : [];
    cat = typeof body?.category === "string" && body.category ? body.category : "water";
    asOfDay = Number(body?.as_of_day);
  } catch {
    return NextResponse.json(
      { success: false, imported: 0, errors: [{ index: -1, error: "invalid JSON body" }] },
      { status: 400 }
    );
  }

  // Phase 9.5: as_of_day はリクエストトップレベルの必須フィールド。
  // 「このインポートが何日時点のスナップショットか」を画面に表示するため。
  if (!Number.isInteger(asOfDay) || asOfDay < 1 || asOfDay > 31) {
    return NextResponse.json(
      { success: false, imported: 0, errors: [{ index: -1, error: "as_of_day is required (1-31)" }] },
      { status: 400 }
    );
  }

  const sql = getSql();
  let imported = 0;
  const errors: RowError[] = [];

  // 各行を独立した try/catch で処理。1件失敗しても他行は継続。
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? {};
    try {
      if (!row.area_id || typeof row.area_id !== "string") {
        throw new Error("missing or invalid area_id");
      }
      const year = num(row.year);
      const month = num(row.month);
      if (year < 2000 || year > 2100) {
        throw new Error(`invalid year: ${row.year}`);
      }
      if (month < 1 || month > 12) {
        throw new Error(`invalid month: ${row.month}`);
      }

      await sql`
        INSERT INTO monthly_summaries (
          area_id, business_category, year, month,
          total_revenue, total_profit, total_count, unit_price,
          ad_cost, ad_rate, acquisition_count, cpa,
          call_count, call_unit_price, conv_rate, profit_rate,
          help_revenue, help_count, help_unit_price, vehicle_count,
          as_of_day
        ) VALUES (
          ${row.area_id}, ${cat}, ${year}, ${month},
          ${num(pick(row, "total_revenue", "revenue"))},
          ${num(pick(row, "total_profit", "gross_profit"))},
          ${num(pick(row, "total_count"))},
          ${num(pick(row, "unit_price"))},
          ${num(pick(row, "ad_cost"))}, ${num(pick(row, "ad_rate"))},
          ${num(pick(row, "acquisition_count"))},
          ${num(pick(row, "cpa", "acquisition_unit_price"))},
          ${num(pick(row, "call_count"))}, ${num(pick(row, "call_unit_price"))},
          ${num(pick(row, "conv_rate", "acquisition_rate"))},
          ${num(pick(row, "profit_rate", "gross_margin_rate"))},
          ${num(pick(row, "help_revenue"))}, ${num(pick(row, "help_count"))},
          ${num(pick(row, "help_unit_price"))}, ${num(pick(row, "vehicle_count"))},
          ${asOfDay}
        )
        ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
          total_revenue=EXCLUDED.total_revenue, total_profit=EXCLUDED.total_profit,
          total_count=EXCLUDED.total_count, unit_price=EXCLUDED.unit_price,
          ad_cost=EXCLUDED.ad_cost, ad_rate=EXCLUDED.ad_rate,
          acquisition_count=EXCLUDED.acquisition_count, cpa=EXCLUDED.cpa,
          call_count=EXCLUDED.call_count, call_unit_price=EXCLUDED.call_unit_price,
          conv_rate=EXCLUDED.conv_rate, profit_rate=EXCLUDED.profit_rate,
          help_revenue=EXCLUDED.help_revenue, help_count=EXCLUDED.help_count,
          help_unit_price=EXCLUDED.help_unit_price, vehicle_count=EXCLUDED.vehicle_count,
          as_of_day=EXCLUDED.as_of_day
      `;
      imported++;
    } catch (e) {
      errors.push({
        index: i,
        error: String(e instanceof Error ? e.message : e),
        area_id: typeof row.area_id === "string" ? row.area_id : undefined,
      });
    }
  }

  // 既存クライアント互換: success フラグと imported カウントは従来通り。
  // 加えて errors 配列で部分失敗を返却（既存の json.error は廃止）。
  const success = errors.length === 0;
  return NextResponse.json({ success, imported, errors });
}
