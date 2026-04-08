import { cookies } from "next/headers";

export const AUTH_COOKIE = "sd_auth";

export type Role = "admin" | "manager" | "input";

export function rolePassword(role: Role): string | undefined {
  switch (role) {
    case "admin":   return process.env.ADMIN_PASSWORD;
    case "manager": return process.env.MANAGER_PASSWORD;
    case "input":   return process.env.INPUT_PASSWORD;
  }
}

/** パスワードを各ロールと突合してロールを特定 */
export function resolveRole(password: string): Role | null {
  if (password && password === process.env.ADMIN_PASSWORD) return "admin";
  if (password && password === process.env.MANAGER_PASSWORD) return "manager";
  if (password && password === process.env.INPUT_PASSWORD) return "input";
  return null;
}

/** Cookie値: "role:password" の形でサーバー側で再検証 */
export function makeCookieValue(role: Role): string {
  const pw = rolePassword(role) ?? "";
  return `${role}:${pw}`;
}

export function verifyCookieValue(value: string | undefined): Role | null {
  if (!value) return null;
  const idx = value.indexOf(":");
  if (idx < 0) return null;
  const role = value.slice(0, idx) as Role;
  const pw = value.slice(idx + 1);
  if (!["admin", "manager", "input"].includes(role)) return null;
  if (rolePassword(role) !== pw) return null;
  return role;
}

export async function currentRole(): Promise<Role | null> {
  const c = await cookies();
  return verifyCookieValue(c.get(AUTH_COOKIE)?.value);
}

export async function isAuthed(): Promise<boolean> {
  return (await currentRole()) !== null;
}
