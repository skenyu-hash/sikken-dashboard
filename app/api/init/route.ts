import { NextResponse } from "next/server";
import { ensureAuthSchema, seedInitialAdmin } from "../../lib/auth";

export const runtime = "nodejs";

/**
 * 初回セットアップ用エンドポイント。
 * - スキーマを冪等に作成
 * - 環境変数 INITIAL_ADMIN_EMAIL/PASSWORD/NAME から初期adminを投入
 * 認証不要(冪等で危険性なし)。proxy.ts の PUBLIC_PATHS に登録されている。
 */
export async function GET() {
  return run();
}
export async function POST() {
  return run();
}

async function run() {
  try {
    await ensureAuthSchema();
    const result = await seedInitialAdmin();
    return NextResponse.json({
      schemaReady: true,
      ...result,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({
      schemaReady: false,
      error: (e as Error).message,
    }, { status: 500 });
  }
}
