import { NextRequest, NextResponse } from "next/server";
import { getSql } from "../../../lib/db";
import { currentRole } from "../../../lib/auth";
import { hasPageAccess } from "../../../lib/permissions";
import { AREA_NAMES, BUSINESSES } from "../../../lib/businesses";

export const runtime = "nodejs";

const MAX_DAYS = 186; // 約6ヶ月

const FLAT_FIELDS = [
  "totalCount", "constructionCount",
  "selfRevenue", "selfProfit", "selfCount",
  "newRevenue", "newMaterial", "newLabor", "newCount",
  "addRevenue", "addMaterial", "addLabor", "addCount",
  "insourceCount", "outsourceCount", "reviewCount",
  "helpRevenue", "helpCount",
  "adCost", "laborCost", "materialCost", "outsourceCost",
  "vehicleCount",
] as const;

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((b - a) / (1000 * 60 * 60 * 24)) + 1;
}

export async function GET(req: NextRequest) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasPageAccess({ role }, "data-io", "view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const defaultFrom = `${y}-${m}-01`;
  const defaultTo = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? defaultTo;
  if (!isYmd(from) || !isYmd(to)) {
    return NextResponse.json({ error: "invalid from/to (YYYY-MM-DD)" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "from must be <= to" }, { status: 400 });
  }
  if (diffDays(from, to) > MAX_DAYS) {
    return NextResponse.json(
      { error: `period too long: max ${MAX_DAYS} days (~6 months)` },
      { status: 400 }
    );
  }

  const allCategories = BUSINESSES.map((b) => b.id);
  const categoriesParam = searchParams.get("categories");
  const categories = categoriesParam
    ? categoriesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : allCategories;
  const allAreas = Object.keys(AREA_NAMES);
  const areasParam = searchParams.get("areas");
  const areas = areasParam
    ? areasParam.split(",").map((s) => s.trim()).filter(Boolean)
    : allAreas;

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        area_id, entry_date,
        COALESCE(business_category, 'water') AS business_category,
        data, updated_at
      FROM entries
      WHERE entry_date BETWEEN ${from}::date AND ${to}::date
        AND COALESCE(business_category, 'water') = ANY(${categories})
        AND area_id = ANY(${areas})
      ORDER BY entry_date DESC, area_id, business_category
    `) as Array<{
      area_id: string;
      entry_date: string | Date;
      business_category: string;
      data: Record<string, unknown> | null;
      updated_at: string | Date;
    }>;

    const businessLabel = (id: string) =>
      BUSINESSES.find((b) => b.id === id)?.label ?? id;

    const data = rows.map((r) => {
      const d: Record<string, unknown> = r.data ?? {};
      const flat: Record<string, unknown> = {};
      for (const k of FLAT_FIELDS) {
        flat[k] = d[k] ?? null;
      }
      const entryDate =
        r.entry_date instanceof Date
          ? r.entry_date.toISOString().slice(0, 10)
          : String(r.entry_date).slice(0, 10);
      return {
        entry_date: entryDate,
        area_id: r.area_id,
        area_name: AREA_NAMES[r.area_id] ?? r.area_id,
        business_category: r.business_category,
        business_label: businessLabel(r.business_category),
        ...flat,
        data_raw: JSON.stringify(d),
        updated_at:
          r.updated_at instanceof Date
            ? r.updated_at.toISOString()
            : String(r.updated_at),
      };
    });

    return NextResponse.json({
      ok: true,
      data,
      meta: {
        count: data.length,
        from,
        to,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error("/api/export/daily-entries:", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
