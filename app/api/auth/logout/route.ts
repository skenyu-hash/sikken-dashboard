import { NextResponse } from "next/server";
import { AUTH_COOKIE, currentUser, destroySession, logAudit } from "../../../lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const user = await currentUser();
  if (user) {
    await destroySession(user.sessionId);
    await logAudit({ user, action: "logout" });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
