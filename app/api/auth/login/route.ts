import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "../../../lib/auth";

export async function POST(req: Request) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "DASHBOARD_PASSWORD is not set" },
      { status: 500 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const password = (body as { password?: string }).password ?? "";

  if (password !== expected) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: expected,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30日
  });
  return res;
}
