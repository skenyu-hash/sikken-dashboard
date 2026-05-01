import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../lib/db";
import { num } from "../../lib/utils/numberCoerce";

type ImportRow = Record<string, unknown>;
type RowError = { index: number; error: string; area_id?: string };

export async function POST(req: NextRequest) {
  let rows: ImportRow[] = [];
  let cat: string = "water";
  try {
    const body = await req.json();
    rows = Array.isArray(body?.rows) ? body.rows : [];
    cat = typeof body?.category === "string" && body.category ? body.category : "water";
  } catch {
    return NextResponse.json(
      { success: false, imported: 0, errors: [{ index: -1, error: "invalid JSON body" }] },
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
          help_revenue, help_count, help_unit_price, vehicle_count
        ) VALUES (
          ${row.area_id}, ${cat}, ${year}, ${month},
          ${num(row.total_revenue)}, ${num(row.total_profit)}, ${num(row.total_count)}, ${num(row.unit_price)},
          ${num(row.ad_cost)}, ${num(row.ad_rate)}, ${num(row.acquisition_count)}, ${num(row.cpa)},
          ${num(row.call_count)}, ${num(row.call_unit_price)}, ${num(row.conv_rate)}, ${num(row.profit_rate)},
          ${num(row.help_revenue)}, ${num(row.help_count)}, ${num(row.help_unit_price)}, ${num(row.vehicle_count)}
        )
        ON CONFLICT (area_id, business_category, year, month) DO UPDATE SET
          total_revenue=EXCLUDED.total_revenue, total_profit=EXCLUDED.total_profit,
          total_count=EXCLUDED.total_count, unit_price=EXCLUDED.unit_price,
          ad_cost=EXCLUDED.ad_cost, ad_rate=EXCLUDED.ad_rate,
          acquisition_count=EXCLUDED.acquisition_count, cpa=EXCLUDED.cpa,
          call_count=EXCLUDED.call_count, call_unit_price=EXCLUDED.call_unit_price,
          conv_rate=EXCLUDED.conv_rate, profit_rate=EXCLUDED.profit_rate,
          help_revenue=EXCLUDED.help_revenue, help_count=EXCLUDED.help_count,
          help_unit_price=EXCLUDED.help_unit_price, vehicle_count=EXCLUDED.vehicle_count
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
