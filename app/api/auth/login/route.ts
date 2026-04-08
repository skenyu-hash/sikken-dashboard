import { NextResponse } from "next/server";
import {
  AUTH_COOKIE, TOKEN_TTL_SEC,
  authenticate, signSession, logAudit, getClientIp,
} from "../../../lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String((body as { email?: string }).email ?? "").trim().toLowerCase();
  const password = String((body as { password?: string }).password ?? "");
  if (!email || !password) {
    return NextResponse.json({ error: "メールアドレスとパスワードを入力してください" }, { status: 400 });
  }

  const ip = await getClientIp();
  const result = await authenticate(email, password, ip);

  if (!result.ok) {
    await logAudit({
      user: null, action: "login_failed",
      after: { email, reason: result.reason },
    });
    if (result.reason === "locked") {
      return NextResponse.json({
        error: `アカウントがロックされています。30分後に再度お試しください。`,
      }, { status: 423 });
    }
    if (result.reason === "inactive") {
      return NextResponse.json({
        error: "このアカウントは無効化されています。管理者に連絡してください。",
      }, { status: 403 });
    }
    return NextResponse.json({
      error: "メールアドレスまたはパスワードが正しくありません",
    }, { status: 401 });
  }

  const token = await signSession(
    {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      areaId: result.user.areaId,
    },
    result.user.sessionId
  );

  await logAudit({ user: result.user, action: "login" });

  const res = NextResponse.json({
    ok: true,
    user: { name: result.user.name, role: result.user.role },
  });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SEC,
  });
  return res;
}
