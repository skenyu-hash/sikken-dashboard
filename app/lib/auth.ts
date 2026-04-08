import { cookies } from "next/headers";

export const AUTH_COOKIE = "sd_auth";

/** リクエスト時の認証チェック (Server Component / Route Handler 用) */
export async function isAuthed(): Promise<boolean> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  const c = await cookies();
  return c.get(AUTH_COOKIE)?.value === expected;
}
