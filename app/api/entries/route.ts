import { NextResponse } from "next/server";
import { isAuthed, currentRole } from "../../lib/auth";
import { listEntries, upsertEntry } from "../../lib/db";
import type { DailyEntry } from "../../lib/calculations";

export const runtime = "nodejs";

const AREA_IDS = new Set([
  "kansai",
  "kanto",
  "nagoya",
  "kyushu",
  "kitakanto",
  "hokkaido",
  "chugoku",
  "shizuoka",
]);

async function requireAuth() {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: Request) {
  const unauth = await requireAuth();
  if (unauth) return unauth;

  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area") ?? "";
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!AREA_IDS.has(area) || !year || !month) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  try {
    const entries = await listEntries(area, year, month);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (role === "manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    areaId?: string;
    entry?: DailyEntry;
  } | null;

  if (!body?.areaId || !body.entry || !AREA_IDS.has(body.areaId)) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.entry.date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }

  try {
    await upsertEntry(body.areaId, body.entry);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
