import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE } from "./app/lib/auth";

// 認証不要パス
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const expected = process.env.DASHBOARD_PASSWORD;
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;

  if (!expected || cookie !== expected) {
    // API は 401 を返す
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon|.*\\.(?:svg|png|jpg|jpeg|ico)).*)"],
};
