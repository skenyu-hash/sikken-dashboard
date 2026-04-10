import { NextRequest, NextResponse } from "next/server";
import { getSql, ensureSchema } from "../../lib/db";
import { currentUser } from "../../lib/auth";

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { actionType, targetArea, targetPage, detail } = await req.json();
    const sql = getSql();
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    await sql`
      INSERT INTO access_logs (user_id, user_name, action_type, target_area, target_page, detail, ip_address)
      VALUES (${String(user.id)}, ${user.name}, ${actionType}, ${targetArea ?? null}, ${targetPage ?? null}, ${detail ?? null}, ${ip})
    `;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const user = await currentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const actionType = searchParams.get("type");
    const sql = getSql();
    const logs = actionType
      ? await sql`SELECT * FROM access_logs WHERE action_type = ${actionType} ORDER BY created_at DESC LIMIT 200`
      : await sql`SELECT * FROM access_logs ORDER BY created_at DESC LIMIT 200`;
    return NextResponse.json({ logs });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
