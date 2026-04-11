import { NextResponse } from "next/server";
import { currentUser, hashPassword, ensureAuthSchema, logAudit, type Role } from "../../lib/auth";
import { getSql } from "../../lib/db";

export const runtime = "nodejs";

async function requireAdmin() {
  const u = await currentUser();
  if (!u) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (u.role !== "admin") return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { user: u };
}

export async function GET() {
  const r = await requireAdmin();
  if ("error" in r) return r.error;
  await ensureAuthSchema();
  const rows = (await getSql()`
    SELECT id, email, name, role, area_id,
      COALESCE(business_category, 'water') AS business_category,
      is_active, last_login_at, locked_until, created_at
    FROM users ORDER BY created_at ASC
  `) as Record<string, string | number | boolean | null>[];
  return NextResponse.json({
    users: rows.map((u) => ({
      id: Number(u.id),
      email: String(u.email),
      name: String(u.name),
      role: u.role as Role,
      areaId: u.area_id ? String(u.area_id) : null,
      businessCategory: u.business_category ? String(u.business_category) : "water",
      isActive: Boolean(u.is_active),
      lastLoginAt: u.last_login_at ? String(u.last_login_at) : null,
      lockedUntil: u.locked_until ? String(u.locked_until) : null,
      createdAt: String(u.created_at),
    })),
  });
}

export async function POST(req: Request) {
  const r = await requireAdmin();
  if ("error" in r) return r.error;
  await ensureAuthSchema();

  const body = await req.json().catch(() => null) as {
    email?: string; password?: string; name?: string;
    role?: Role; areaId?: string | null; businessCategory?: string;
  } | null;
  if (!body?.email || !body.password || !body.name || !body.role) {
    return NextResponse.json({ error: "必須項目が不足しています" }, { status: 400 });
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: "パスワードは8文字以上で設定してください" }, { status: 400 });
  }

  try {
    const hash = await hashPassword(body.password);
    const email = body.email.trim().toLowerCase();
    const cat = body.businessCategory ?? "water";
    await getSql()`
      INSERT INTO users (email, password_hash, name, role, area_id, business_category, is_active)
      VALUES (${email}, ${hash}, ${body.name}, ${body.role}, ${body.areaId ?? null}, ${cat}, TRUE)
    `;
    await logAudit({
      user: r.user, action: "user_create",
      after: { email, name: body.name, role: body.role, areaId: body.areaId ?? null, businessCategory: cat },
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message ?? "db error";
    if (msg.includes("duplicate")) {
      return NextResponse.json({ error: "このメールアドレスは既に登録されています" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const r = await requireAdmin();
  if ("error" in r) return r.error;
  await ensureAuthSchema();

  const body = await req.json().catch(() => null) as {
    id?: number; name?: string; role?: Role;
    areaId?: string | null; businessCategory?: string;
    isActive?: boolean; password?: string;
  } | null;
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    if (body.password) {
      if (body.password.length < 8) {
        return NextResponse.json({ error: "パスワードは8文字以上" }, { status: 400 });
      }
      const hash = await hashPassword(body.password);
      await getSql()`UPDATE users SET password_hash = ${hash}, updated_at = NOW() WHERE id = ${body.id}`;
    }
    if (body.name !== undefined) {
      await getSql()`UPDATE users SET name = ${body.name}, updated_at = NOW() WHERE id = ${body.id}`;
    }
    if (body.role !== undefined) {
      await getSql()`UPDATE users SET role = ${body.role}, updated_at = NOW() WHERE id = ${body.id}`;
    }
    if (body.areaId !== undefined) {
      await getSql()`UPDATE users SET area_id = ${body.areaId}, updated_at = NOW() WHERE id = ${body.id}`;
    }
    if (body.businessCategory !== undefined) {
      await getSql()`UPDATE users SET business_category = ${body.businessCategory}, updated_at = NOW() WHERE id = ${body.id}`;
    }
    if (body.isActive !== undefined) {
      await getSql()`UPDATE users SET is_active = ${body.isActive}, updated_at = NOW() WHERE id = ${body.id}`;
      // 無効化したらセッションも切る
      if (!body.isActive) {
        await getSql()`DELETE FROM user_sessions WHERE user_id = ${body.id}`;
      }
    }
    await logAudit({ user: r.user, action: "user_update", after: body });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
