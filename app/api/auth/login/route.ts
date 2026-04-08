import { NextResponse } from "next/server";
import { AUTH_COOKIE, makeCookieValue, resolveRole } from "../../../lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = (body as { password?: string }).password ?? "";

  const role = resolveRole(password);
  if (!role) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set({
    name: AUTH_COOKIE,
    value: makeCookieValue(role),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
