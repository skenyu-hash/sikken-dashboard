import { NextResponse } from "next/server";
import { currentUser, logAudit } from "../../lib/auth";
import { hasDataAccess } from "../../lib/permissions";
import { listEntries, upsertEntry } from "../../lib/db";
import { aggregateMonthlySummary, type BusinessCategory } from "../../lib/monthlyAggregation";
import type { DailyEntry } from "../../lib/calculations";
import { getAreasForCategory } from "../../lib/businesses";

// PR c90-1: aggregation の対象業態を限定 (型安全)。
//   /api/entries の payload.category が想定外文字列の場合は water にフォールバック。
const VALID_CATEGORIES = ["water", "electric", "locksmith", "road", "detective"] as const;
function toBusinessCategory(s: string): BusinessCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(s)
    ? (s as BusinessCategory)
    : "water";
}

export const runtime = "nodejs";

const AREA_IDS = new Set([
  "kansai", "kanto", "nagoya", "kyushu",
  "kitakanto", "hokkaido", "chugoku", "shizuoka",
]);

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area") ?? "";
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const category = searchParams.get("category") ?? "water";
  if (!AREA_IDS.has(area) || !year || !month) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }
  if (!hasDataAccess({ role: user.role, area_id: user.areaId }, area, category, "view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const entries = await listEntries(area, year, month, category);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    areaId?: string; entry?: DailyEntry; category?: string;
  } | null;

  if (!body?.areaId || !body.entry || !AREA_IDS.has(body.areaId)) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const cat = toBusinessCategory(body.category ?? "water");
  // PR-3 (2026-06-08): category-area ペアが BUSINESSES マスター内か検証。
  //   旧仕様は AREA_IDS の存在チェックのみで、探偵×北関東 等のマスター外ペアが書き込めた。
  //   UI 側は page.tsx の clampAreaToCategory が silently 既定エリアへ寄せるが、API 側は
  //   厳格に 400 で弾く (UI clamp が効いていれば正常 path で来ない値が来た = 異常)。
  if (!getAreasForCategory(cat).includes(body.areaId)) {
    return NextResponse.json(
      { error: "category-area pair not in master" },
      { status: 400 },
    );
  }
  if (!hasDataAccess({ role: user.role, area_id: user.areaId }, body.areaId, cat, "edit")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.entry.date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }

  try {
    // 既存値を取得して監査ログのbeforeに記録
    const before = (await listEntries(
      body.areaId,
      Number(body.entry.date.slice(0, 4)),
      Number(body.entry.date.slice(5, 7)),
      cat
    )).find((e) => e.date === body.entry!.date) ?? null;

    await upsertEntry(body.areaId, body.entry, cat);
    await logAudit({
      user, action: before ? "entry_edit" : "entry_create",
      areaId: body.areaId, targetDate: body.entry.date,
      before, after: body.entry,
    });

    // PR c90-1 (R2): entries upsert 後、対象月の monthly_summaries を SUM 再集計。
    //   日次差分入力経路の専用ロジック。累積置換経路 (/api/import-monthly) とは
    //   別関数 aggregateMonthlySummary で完全分離されている (source='entries_aggregation'
    //   タグで書き込み出所を識別可能)。
    //
    // PR c91 (緊急 hotfix): aggregation 失敗時の挙動を変更。
    //   旧 (c90-1): 200 OK + warning フィールド返却 → client は warning を読まず
    //              verify step で「DB 行が見つかりません」と誤ったエラーを表示
    //   新       : 500 + 明示的 error message 返却 → client は実 error を UI 表示可能
    //   entries は保存成功しているため、message に "entries saved" を含めて
    //   ユーザーがリトライ判断できるよう情報伝達。
    const year = Number(body.entry.date.slice(0, 4));
    const month = Number(body.entry.date.slice(5, 7));
    try {
      await aggregateMonthlySummary(body.areaId, toBusinessCategory(cat), year, month);
    } catch (aggErr) {
      console.error("[c91] monthlyAggregation failed (entry was saved to entries table):", aggErr);
      const detail = aggErr instanceof Error ? aggErr.message : String(aggErr);
      return NextResponse.json({
        error: `entry は保存されましたが月次集計に失敗しました: ${detail}`,
        entries_saved: true,
        aggregation_error: detail,
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "db error" }, { status: 500 });
  }
}
