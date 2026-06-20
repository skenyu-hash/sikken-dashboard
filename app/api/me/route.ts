import { NextResponse } from "next/server";
import { currentUser } from "../../lib/auth";

export const runtime = "nodejs";
// 予防的ハードニング: 認証応答(/api/me)は HTTP キャッシュさせない(定石)。観測されたバグの
// 修正ではなく(2026-06-20 本番の通常リロードで表示は正常)、ログイン前 401 が残る等の潜在
// リスクを避けるための no-store 多層防御。
export const dynamic = "force-dynamic";

// no-store ヘッダを 200 / 401 両方に付与する共通ヘッダ。
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401, headers: NO_STORE });
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      areaId: user.areaId,
    },
  }, { headers: NO_STORE });
}
