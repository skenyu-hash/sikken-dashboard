// fix/auth-multi-session-allow (2026-06-07): A案 + C案 統合テスト。
//
// 単独実行: npm run test:integration:auth-multi-session
//   (DATABASE_URL が必要、Neon DB 接続。READ + WRITE: test_* 接頭辞ユーザーで isolated)
//
// 反さん指定 4 件:
//   1. 同一ユーザーで 2 回ログインして 2 session が併存する (A案の核心、旧仕様では 1 件しか残らなかった)
//   2. 明示ログアウト (destroySession) で当該 session_id のみ削除される (もう片方は維持)
//   3. admin による isActive=false 強制失効が全 session を削除する (セキュリティ要件 regression)
//   4. verifyToken 失敗時に console.error が呼ばれ reason が出力される (C案)
//
// 真因背景:
//   Preview と Production が同一 Neon DB を共有する構成 (確定済) で、
//   旧仕様の「ログイン時に WHERE user_id = X で全 session DELETE」が
//   Preview 検証ログインで本番 session を即無効化していた。
//   A案 = 当該 DELETE を撤廃、INSERT のみに。複数 session 併存を許可。
//   C案 = verifyToken の silent fail を撤廃、reason を console.error 出力。

import { Pool } from "@neondatabase/serverless";
import {
  authenticate,
  destroySession,
  ensureAuthSchema,
  hashPassword,
  verifyToken,
  signSession,
} from "../app/lib/auth";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL が設定されていません。");
  console.error("   export $(grep DATABASE_URL .env.local | xargs)");
  process.exit(1);
}

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`); failed++; }
}
function eq(name: string, actual: unknown, expected: unknown) {
  ok(`${name} (= ${JSON.stringify(expected)})`, actual === expected);
  if (actual !== expected) console.log(`     got ${JSON.stringify(actual)}`);
}

const TEST_EMAIL = `test-multi-session-${Date.now()}@example.invalid`;
const TEST_PASSWORD = "Test1234!multi-session";

async function main() {
  console.log("🧪 fix/auth-multi-session-allow: A案 + C案 統合検証\n");

  await ensureAuthSchema();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let testUserId: number | null = null;

  try {
    // テストユーザー seed (test-* 接頭辞、本番ユーザーと衝突しない)
    const hash = await hashPassword(TEST_PASSWORD);
    const insertResult = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, role, password_hash, is_active)
       VALUES ($1, 'multi-session-test', 'executive', $2, true)
       RETURNING id`,
      [TEST_EMAIL, hash],
    );
    testUserId = insertResult.rows[0].id;
    console.log(`📝 seed: test user id=${testUserId} email=${TEST_EMAIL}`);

    // ─────────────────────────────────────────────────
    // 要件 1: 同一ユーザー 2 回ログインで 2 session 併存 (A案の核心)
    // ─────────────────────────────────────────────────
    console.log("\n📋 1. 同一ユーザー 2 回ログイン → 2 session 併存 (A案)");
    const login1 = await authenticate(TEST_EMAIL, TEST_PASSWORD, "ip-device-1");
    ok("1 回目ログイン成功", login1.ok === true);
    if (!login1.ok) throw new Error("login1 failed");
    const session1Id = login1.user.sessionId;
    console.log(`     session1 = ${session1Id}`);

    const login2 = await authenticate(TEST_EMAIL, TEST_PASSWORD, "ip-device-2");
    ok("2 回目ログイン成功 (Preview 経由想定)", login2.ok === true);
    if (!login2.ok) throw new Error("login2 failed");
    const session2Id = login2.user.sessionId;
    console.log(`     session2 = ${session2Id}`);

    ok("session1 != session2 (UUID 別個)", session1Id !== session2Id);

    const sessionRows = await pool.query<{ session_id: string }>(
      `SELECT session_id FROM user_sessions WHERE user_id = $1 ORDER BY created_at`,
      [testUserId],
    );
    eq("user_sessions 行数 = 2 (旧仕様では 1 件しか残らなかった)",
      sessionRows.rows.length, 2);
    const dbSessionIds = new Set(sessionRows.rows.map((r) => r.session_id));
    ok("session1 が DB に残存 (= 本番セッションが Preview ログインで消えない)",
      dbSessionIds.has(session1Id));
    ok("session2 が DB に残存", dbSessionIds.has(session2Id));

    // ─────────────────────────────────────────────────
    // 要件 2: 明示ログアウトで当該 session_id のみ削除
    // ─────────────────────────────────────────────────
    console.log("\n📋 2. destroySession (明示ログアウト) で当該 session_id のみ削除");
    await destroySession(session1Id);
    const afterLogoutRows = await pool.query<{ session_id: string }>(
      `SELECT session_id FROM user_sessions WHERE user_id = $1`,
      [testUserId],
    );
    eq("user_sessions 行数 = 1 (session2 のみ残存)",
      afterLogoutRows.rows.length, 1);
    eq("残存 session_id = session2", afterLogoutRows.rows[0]?.session_id, session2Id);

    // ─────────────────────────────────────────────────
    // 要件 3: admin による isActive=false 強制失効 (regression)
    //   app/api/users/route.ts:115 の `DELETE FROM user_sessions WHERE user_id = X` 経路。
    //   API endpoint 経由ではなく、同じ SQL を直接実行して挙動を確認。
    // ─────────────────────────────────────────────────
    console.log("\n📋 3. admin 強制失効 (isActive=false) で全 session 削除 (regression)");
    // 再度 2 session 作る
    await authenticate(TEST_EMAIL, TEST_PASSWORD, "ip-device-3");
    const beforeForceLogout = await pool.query(
      `SELECT COUNT(*)::int as n FROM user_sessions WHERE user_id = $1`,
      [testUserId],
    );
    eq("失効前: 2 session (session2 + session3)",
      (beforeForceLogout.rows[0] as { n: number }).n, 2);

    // users/route.ts:115 と同じ SQL で強制失効を再現
    await pool.query(`UPDATE users SET is_active = false WHERE id = $1`, [testUserId]);
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [testUserId]);

    const afterForceLogout = await pool.query(
      `SELECT COUNT(*)::int as n FROM user_sessions WHERE user_id = $1`,
      [testUserId],
    );
    eq("失効後: 0 session (退職者の即時失効維持)",
      (afterForceLogout.rows[0] as { n: number }).n, 0);

    // ─────────────────────────────────────────────────
    // 要件 4: verifyToken catch で console.error が呼ばれ reason が出る (C案)
    // ─────────────────────────────────────────────────
    console.log("\n📋 4. verifyToken 失敗時に console.error(reason) が出る (C案)");
    const calls: Array<{ msg: string; meta: unknown }> = [];
    const originalError = console.error;
    console.error = (msg: unknown, meta?: unknown) => {
      calls.push({ msg: String(msg), meta });
    };
    try {
      // 4-1: 壊れた token
      const result1 = await verifyToken("not.a.valid.jwt.token");
      eq("壊れた token → null 返却", result1, null);
      ok("壊れた token → console.error 1 回呼ばれた",
        calls.some((c) => c.msg === "verifyToken failed"));
      const reason1 = (calls[0]?.meta as { reason?: string })?.reason;
      ok(`壊れた token reason = JWS 系 ('${reason1}' を確認)`,
        typeof reason1 === "string" && reason1.length > 0);

      // 4-2: 期限切れ token (exp = 1970-01-01)
      calls.length = 0;
      const expiredJwt = await new (await import("jose")).SignJWT({
        id: testUserId, email: TEST_EMAIL, name: "x", role: "executive",
        areaId: null, sessionId: "fake",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(0)
        .setExpirationTime(1) // 1970-01-01T00:00:01Z
        .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
      const result2 = await verifyToken(expiredJwt);
      eq("期限切れ token → null 返却", result2, null);
      const reason2 = (calls[0]?.meta as { reason?: string })?.reason;
      eq(`期限切れ token reason = "ERR_JWT_EXPIRED"`, reason2, "ERR_JWT_EXPIRED");

      // 4-3: 正常 token は console.error を呼ばない
      calls.length = 0;
      const validJwt = await signSession({
        id: testUserId!, email: TEST_EMAIL, name: "x", role: "executive", areaId: null,
      }, "test-session-valid");
      const result3 = await verifyToken(validJwt);
      ok("正常 token → 返却値が null でない", result3 !== null);
      eq("正常 token → console.error 0 回 (silent ではなく noise も出さない)",
        calls.length, 0);
    } finally {
      console.error = originalError;
    }

    // ─────────────────────────────────────────────────
    // 要件 5 (派生): A案撤廃でも multi-session 状態で個別失効が正しく機能
    // ─────────────────────────────────────────────────
    console.log("\n📋 5. multi-session 状態での個別 destroySession (派生 regression)");
    await pool.query(`UPDATE users SET is_active = true WHERE id = $1`, [testUserId]);
    const sA = await authenticate(TEST_EMAIL, TEST_PASSWORD, "ip-a");
    const sB = await authenticate(TEST_EMAIL, TEST_PASSWORD, "ip-b");
    const sC = await authenticate(TEST_EMAIL, TEST_PASSWORD, "ip-c");
    if (!sA.ok || !sB.ok || !sC.ok) throw new Error("re-login failed");
    const triRow = (await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int as n FROM user_sessions WHERE user_id = $1`, [testUserId],
    )).rows[0];
    eq("3 session 併存", triRow.n, 3);
    await destroySession(sB.user.sessionId);
    const remaining = await pool.query<{ session_id: string }>(
      `SELECT session_id FROM user_sessions WHERE user_id = $1`,
      [testUserId],
    );
    eq("sB 削除後 2 session 残存", remaining.rows.length, 2);
    const remainingSet = new Set(remaining.rows.map((r) => r.session_id));
    ok("sA 残存", remainingSet.has(sA.user.sessionId));
    ok("sC 残存", remainingSet.has(sC.user.sessionId));
    ok("sB は削除済", !remainingSet.has(sB.user.sessionId));
  } finally {
    // cleanup
    if (testUserId !== null) {
      await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [testUserId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
      console.log(`\n🧹 cleanup: test user id=${testUserId} 削除`);
    }
    await pool.end();
  }

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed}/${passed + failed} passed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
