import { NextResponse } from "next/server";
import { getSql } from "../../lib/db";

export async function GET() {
  const sql = getSql();
  try {
    await sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS business_category VARCHAR(20) DEFAULT 'water'`;
    await sql`ALTER TABLE targets ADD COLUMN IF NOT EXISTS business_category VARCHAR(20) DEFAULT 'water'`;
    await sql`ALTER TABLE monthly_summaries ADD COLUMN IF NOT EXISTS business_category VARCHAR(20) DEFAULT 'water'`;

    // entries: unique constraint に business_category を追加
    await sql`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entries_area_id_entry_date_key') THEN
          ALTER TABLE entries DROP CONSTRAINT entries_area_id_entry_date_key;
        END IF;
      END $$
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS entries_area_cat_date_key
      ON entries (area_id, business_category, entry_date)
    `;

    // targets: unique constraint に business_category を追加
    await sql`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'targets_area_id_year_month_key') THEN
          ALTER TABLE targets DROP CONSTRAINT targets_area_id_year_month_key;
        END IF;
      END $$
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS targets_area_cat_year_month_key
      ON targets (area_id, business_category, year, month)
    `;

    // monthly_summaries: unique constraint に business_category を追加
    await sql`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monthly_summaries_area_id_year_month_key') THEN
          ALTER TABLE monthly_summaries DROP CONSTRAINT monthly_summaries_area_id_year_month_key;
        END IF;
      END $$
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS monthly_summaries_area_cat_year_month_key
      ON monthly_summaries (area_id, business_category, year, month)
    `;

    return NextResponse.json({ ok: true, message: "Migration completed" });
  } catch (e) {
    console.error("Migration error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
