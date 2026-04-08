import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { getSql, ensureSchema } from "./db";

export const AUTH_COOKIE = "sd_session";
export const TOKEN_TTL_SEC = 60 * 60 * 8; // 8 hours

export type Role = "admin" | "manager" | "input";

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  areaId: string | null;
  sessionId: string;
};

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET is not set or too short");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: Omit<SessionUser, "sessionId">, sessionId: string): Promise<string> {
  return await new SignJWT({ ...payload, sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SEC}s`)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      id: Number(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
      areaId: payload.areaId ? String(payload.areaId) : null,
      sessionId: String(payload.sessionId),
    };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  const user = await verifyToken(token);
  if (!user) return null;
  // セッションがDBに残っているかチェック(多重ログイン検知)
  try {
    const rows = (await getSql()`
      SELECT 1 FROM user_sessions WHERE user_id = ${user.id} AND session_id = ${user.sessionId}
    `) as unknown[];
    if (rows.length === 0) return null;
  } catch {
    return null;
  }
  return user;
}

/** 後方互換: ロールのみ取得 */
export async function currentRole(): Promise<Role | null> {
  return (await currentUser())?.role ?? null;
}
export async function isAuthed(): Promise<boolean> {
  return (await currentUser()) !== null;
}

// ============ パスワード ============
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============ ユーザー / 認証フロー ============
const MAX_FAIL = 5;
const LOCK_MIN = 30;

export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "invalid" | "locked" | "inactive"; lockedUntil?: string };

export async function ensureAuthSchema(): Promise<void> {
  await ensureSchema();
  await getSql()`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','manager','input')),
      area_id TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      failed_attempts INT NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await getSql()`
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address TEXT
    )
  `;
  await getSql()`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT,
      user_email TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      area_id TEXT,
      target_date DATE,
      before_value JSONB,
      after_value JSONB,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await getSql()`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC)`;
  await getSql()`CREATE INDEX IF NOT EXISTS idx_audit_area ON audit_logs(area_id)`;

  await seedInitialAdmin();
}

/** 環境変数から初期adminを投入(冪等)。返り値で結果を確認できる */
export async function seedInitialAdmin(): Promise<{
  ok: boolean; created: boolean; reason?: string; email?: string;
}> {
  const rawEmail = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME ?? "管理者";
  if (!rawEmail || !password) {
    return { ok: false, created: false, reason: "INITIAL_ADMIN_EMAIL/PASSWORD が設定されていません" };
  }
  if (password.length < 8) {
    return { ok: false, created: false, reason: "INITIAL_ADMIN_PASSWORD は8文字以上必要です" };
  }
  const email = rawEmail.trim().toLowerCase();
  try {
    const exists = (await getSql()`SELECT id FROM users WHERE email = ${email}`) as { id: number }[];
    if (exists.length > 0) {
      return { ok: true, created: false, email };
    }
    const hash = await hashPassword(password);
    await getSql()`
      INSERT INTO users (email, password_hash, name, role, is_active)
      VALUES (${email}, ${hash}, ${name}, 'admin', TRUE)
    `;
    return { ok: true, created: true, email };
  } catch (e) {
    console.error("seedInitialAdmin failed", e);
    return { ok: false, created: false, reason: (e as Error).message };
  }
}

export async function authenticate(email: string, password: string, ip: string): Promise<AuthResult> {
  await ensureAuthSchema();
  const rows = (await getSql()`
    SELECT id, email, password_hash, name, role, area_id, is_active, failed_attempts, locked_until
    FROM users WHERE email = ${email}
  `) as Record<string, string | number | boolean | null>[];

  const u = rows[0];
  if (!u) return { ok: false, reason: "invalid" };
  if (!u.is_active) return { ok: false, reason: "inactive" };

  if (u.locked_until && new Date(String(u.locked_until)) > new Date()) {
    return { ok: false, reason: "locked", lockedUntil: String(u.locked_until) };
  }

  const ok = await verifyPassword(password, String(u.password_hash));
  if (!ok) {
    const attempts = Number(u.failed_attempts ?? 0) + 1;
    if (attempts >= MAX_FAIL) {
      const lockUntil = new Date(Date.now() + LOCK_MIN * 60 * 1000).toISOString();
      await getSql()`
        UPDATE users SET failed_attempts = ${attempts}, locked_until = ${lockUntil}, updated_at = NOW()
        WHERE id = ${u.id as number}
      `;
      return { ok: false, reason: "locked", lockedUntil: lockUntil };
    }
    await getSql()`
      UPDATE users SET failed_attempts = ${attempts}, updated_at = NOW()
      WHERE id = ${u.id as number}
    `;
    return { ok: false, reason: "invalid" };
  }

  // 成功 → 失敗カウントリセット & last_login更新
  await getSql()`
    UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW()
    WHERE id = ${u.id as number}
  `;

  // 既存のセッションを破棄して新規発行(同一アカウントの多重ログインは最新優先)
  await getSql()`DELETE FROM user_sessions WHERE user_id = ${u.id as number}`;
  const sessionId = crypto.randomUUID();
  await getSql()`
    INSERT INTO user_sessions (session_id, user_id, ip_address)
    VALUES (${sessionId}, ${u.id as number}, ${ip})
  `;

  return {
    ok: true,
    user: {
      id: Number(u.id),
      email: String(u.email),
      name: String(u.name),
      role: u.role as Role,
      areaId: u.area_id ? String(u.area_id) : null,
      sessionId,
    },
  };
}

export async function destroySession(sessionId: string): Promise<void> {
  await getSql()`DELETE FROM user_sessions WHERE session_id = ${sessionId}`;
}

// ============ 監査ログ ============
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? h.get("x-real-ip") ?? "unknown";
}

export async function logAudit(opts: {
  user: SessionUser | null;
  action: string;
  areaId?: string | null;
  targetDate?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    const ip = await getClientIp();
    await getSql()`
      INSERT INTO audit_logs
        (user_id, user_email, user_name, action, area_id, target_date, before_value, after_value, ip_address)
      VALUES
        (${opts.user?.id ?? null}, ${opts.user?.email ?? null}, ${opts.user?.name ?? null},
         ${opts.action}, ${opts.areaId ?? null}, ${opts.targetDate ?? null},
         ${opts.before == null ? null : JSON.stringify(opts.before)}::jsonb,
         ${opts.after == null ? null : JSON.stringify(opts.after)}::jsonb,
         ${ip})
    `;
  } catch (e) {
    console.error("audit log failed", e);
  }
}

// ============ エリアアクセス制御 ============
export function canAccessArea(user: SessionUser, areaId: string): boolean {
  if (user.role === "admin" || user.role === "manager") return true;
  // input: 自分のareaIdのみ。areaId未設定の場合は全エリア入力可とみなす
  return user.areaId == null || user.areaId === areaId;
}
export function canEditArea(user: SessionUser, areaId: string): boolean {
  if (user.role === "manager") return false;
  if (user.role === "admin") return true;
  // input
  return user.areaId == null || user.areaId === areaId;
}
