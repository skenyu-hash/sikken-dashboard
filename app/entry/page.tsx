// /entry ページ Server Component
//
// 仕様書: docs/specs/spec-form-redesign.md §4
// 権限: hasPageAccess(user, "entry", "view") + エリアスコープは
//       canSeeDataOnPage / hasDataAccess (PR #36 の SSOT)
//
// PR c92-1.1 (revert of c92-1 routing): default を EntryForm (c90-2 互換) に戻す。
//   - /entry (no params)              → EntryForm (c90-2 単一セル詳細入力、31 項目)
//   - /entry?category=X               → EntryForm (業態指定)
//   - /entry?view=matrix              → BulkEntryMatrix (将来用 opt-in、隠し機能)
//
// 背景: c92-1 で導入した matrix UI は「詳細編集 →」リンクの可視性が低く、31 項目の
//   入力フローが分かりにくかったため default を EntryForm に戻す。BulkEntryMatrix /
//   EntryCell / useBulkEntryState の本体コードは保持し、c92-2 で UX 改善後に復活予定。
//
// 過去経緯:
//   c92-1 (default matrix) → c92-1.1 本 PR (default EntryForm に戻し、matrix opt-in 化)

import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { hasPageAccess, type Role } from "../lib/permissions";
import { BUSINESS_LABELS, type BusinessCategory } from "../lib/business-labels";
import {
  BUSINESSES, AREA_NAMES,
  getAreasForCategory, clampAreaToCategory,
} from "../lib/businesses";
import EntryForm from "./EntryForm";
import BulkEntryMatrix from "./components/BulkEntryMatrix";

// PR-3 (2026-06-08): VALID_CATEGORIES / ALL_AREAS のハードコード二重定義を解消。
//   category の真実は businesses.ts に一元化、area select は category 連動に。
const VALID_CATEGORIES: BusinessCategory[] = BUSINESSES.map((b) => b.id);

type SearchParams = { category?: string; area?: string; view?: string };

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");

  if (!hasPageAccess({ role: user.role as Role }, "entry", "view")) {
    redirect("/");
  }

  const now = new Date();

  // PR c92-1.1: ?view=matrix 明示時のみ BulkEntryMatrix (opt-in、隠し機能)
  //   c92-2 で UX 改善 (inline 詳細展開) 後に default 復活を検討。
  if (sp.view === "matrix") {
    return (
      <BulkEntryMatrix
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth() + 1}
        initialDay={now.getDate()}
      />
    );
  }

  // PR c92-1.1 default: EntryForm (c90-2 完全互換、31 項目詳細入力)
  const category: BusinessCategory =
    sp.category && VALID_CATEGORIES.includes(sp.category as BusinessCategory)
      ? (sp.category as BusinessCategory)
      : "water";

  void BUSINESS_LABELS;

  // PR-3: availableAreas を category 連動に変更 (旧 ALL_AREAS 全 8 固定 →
  //   getAreasForCategory(category) 派生)。category 切替で母集合が自動連動する。
  const categoryAreas = getAreasForCategory(category);
  const canSelectArea = user.role === "executive" || user.role === "vice";

  // PR-3: URL ?area= を受信し clampAreaToCategory で正常化。
  //   URL 直叩き (例: ?category=electric&area=shizuoka) は silently DEFAULT_AREA_FOR_CLAMP
  //   (= 関西) に寄せる。staff/clerk は user.areaId が固定だが、たまたまマスター外の組合せ
  //   になる可能性に備えて同じく clamp を通す。c96-2 hotfix の clampDate と同方針。
  const rawArea = sp.area ?? user.areaId ?? "kansai";
  const initialArea = clampAreaToCategory(rawArea, category);

  const availableAreas = canSelectArea
    ? categoryAreas.map((id) => ({ id, name: AREA_NAMES[id] ?? id }))
    : [{ id: initialArea, name: AREA_NAMES[initialArea] ?? initialArea }];

  return (
    <EntryForm
      initialArea={initialArea}
      initialYear={now.getFullYear()}
      initialMonth={now.getMonth() + 1}
      initialDay={now.getDate()}
      category={category}
      canSelectArea={canSelectArea}
      availableAreas={availableAreas}
    />
  );
}
