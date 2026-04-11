import { NextResponse } from "next/server";
import { currentUser, canAccessArea, canEditArea, logAudit } from "../../lib/auth";
import { listEntries, upsertEntry } from "../../lib/db";
import type { DailyEntry } from "../../lib/calculations";

export const runtime = "nodejs";

const AREA_IDS = new Set([
  "kansai", "kanto", "nagoya", "kyushu",
  "kitakanto", "hokkaido", "chugoku", "shizuoka",
]);

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area") ?? "";
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const category = searchParams.get("category") ?? "water";
  if (!AREA_IDS.has(area) || !year || !month) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  if (!canAccessArea(user, area)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const entries = await listEntries(area, year, month, category);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    areaId?: string; entry?: DailyEntry; category?: string;
  } | null;

  if (!body?.areaId || !body.entry || !AREA_IDS.has(body.areaId)) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!canEditArea(user, body.areaId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.entry.date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }

  try {
    const cat = body.category ?? "water";
    // 既存値を取得して監査ログのbeforeに記録
    const before = (await listEntries(
      body.areaId,
      Number(body.entry.date.slice(0, 4)),
      Number(body.entry.date.slice(5, 7)),
      cat
    )).find((e) => e.date === body.entry!.date) ?? null;

    await upsertEntry(body.areaId, body.entry, cat);
    await logAudit({
      user, action: before ? "entry_edit" : "entry_create",
      areaId: body.areaId, targetDate: body.entry.date,
      before, after: body.entry,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
