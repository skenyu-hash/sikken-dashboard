import { NextResponse } from "next/server";
import { currentUser, ensureAuthSchema } from "../../lib/auth";
import { getSql } from "../../lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (u.role !== "executive") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await ensureAuthSchema();

  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area");
  const format = searchParams.get("format");
  const limit = Number(searchParams.get("limit") ?? 200);

  const rows = area
    ? (await getSql()`
        SELECT id, user_id, user_email, user_name, action, area_id, target_date,
               before_value, after_value, ip_address, created_at
        FROM audit_logs WHERE area_id = ${area}
        ORDER BY created_at DESC LIMIT ${limit}
      `)
    : (await getSql()`
        SELECT id, user_id, user_email, user_name, action, area_id, target_date,
               before_value, after_value, ip_address, created_at
        FROM audit_logs ORDER BY created_at DESC LIMIT ${limit}
      `);

  const logs = (rows as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    userId: r.user_id ? Number(r.user_id) : null,
    userEmail: r.user_email ?? null,
    userName: r.user_name ?? null,
    action: String(r.action),
    areaId: r.area_id ?? null,
    targetDate: r.target_date ?? null,
    before: r.before_value ?? null,
    after: r.after_value ?? null,
    ipAddress: r.ip_address ?? null,
    createdAt: String(r.created_at),
  }));

  if (format === "csv") {
    const header = "id,createdAt,user,email,action,areaId,targetDate,ip\n";
    const body = logs.map((l) =>
      [l.id, l.createdAt, l.userName ?? "", l.userEmail ?? "", l.action,
        l.areaId ?? "", l.targetDate ?? "", l.ipAddress ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    return new Response(header + body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="audit_${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({ logs });
}
