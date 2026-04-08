import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE } from "./app/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

// proxy は edge runtime なので env だけで認証チェック(ロールはAPI側で再検証)
function isCookieValid(value: string | undefined): boolean {
  if (!value) return false;
  const idx = value.indexOf(":");
  if (idx < 0) return false;
  const role = value.slice(0, idx);
  const pw = value.slice(idx + 1);
  if (role === "admin" && pw && pw === process.env.ADMIN_PASSWORD) return true;
  if (role === "manager" && pw && pw === process.env.MANAGER_PASSWORD) return true;
  if (role === "input" && pw && pw === process.env.INPUT_PASSWORD) return true;
  return false;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (!isCookieValid(cookie)) {
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
