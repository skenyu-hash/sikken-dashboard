import { NextResponse } from "next/server";
import { currentRole } from "../../lib/auth";
import { getTargets, upsertTargets } from "../../lib/db";
import type { Targets } from "../../lib/calculations";

export const runtime = "nodejs";

const AREA_IDS = new Set([
  "kansai", "kanto", "nagoya", "kyushu",
  "kitakanto", "hokkaido", "chugoku", "shizuoka",
]);

export async function GET(req: Request) {
  const role = await currentRole();
  if (!role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area") ?? "";
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!AREA_IDS.has(area) || !year || !month) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  try {
    const targets = await getTargets(area, year, month);
    return NextResponse.json({ targets });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const role = await currentRole();
  if (role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as {
    areaId?: string; year?: number; month?: number; targets?: Targets;
  } | null;
  if (!body?.areaId || !body.year || !body.month || !body.targets || !AREA_IDS.has(body.areaId)) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  try {
    await upsertTargets(body.areaId, body.year, body.month, body.targets);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
