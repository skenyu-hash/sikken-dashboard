// /entry ページ Server Component
//
// 仕様書: docs/specs/spec-form-redesign.md §4
// 権限: hasPageAccess(user, "entry", "view") + エリアスコープは
//       canSeeDataOnPage / hasDataAccess (PR #36 の SSOT)
//
// PR c92-1 (Q1=a): default を BulkEntryMatrix に変更。
//   - /entry (no params)              → BulkEntryMatrix (全 14 セル一括入力)
//   - /entry?view=single&category=X   → 既存 EntryForm (legacy 単一セル詳細編集)
//   - /entry?category=X (view 未指定)  → BulkEntryMatrix (parameter 無視で matrix)
//
// EntryForm.tsx は c92-2 で「inline 展開コンテンツ」として再利用予定 (現状は legacy fallback)。
// 旧ブックマーク (/entry?category=water 等) は matrix に遷移するため UX 上は再選択不要。

import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { hasPageAccess, type Role } from "../lib/permissions";
import { BUSINESS_LABELS, type BusinessCategory } from "../lib/business-labels";
import EntryForm from "./EntryForm";
import BulkEntryMatrix from "./components/BulkEntryMatrix";

const VALID_CATEGORIES: BusinessCategory[] = ["water", "electric", "locksmith", "road", "detective"];
const ALL_AREAS: { id: string; name: string }[] = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type SearchParams = { category?: string; view?: string };

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

  // PR c92-1: ?view=single 明示時のみ legacy 単一セル EntryForm を表示
  if (sp.view === "single") {
    const category: BusinessCategory =
      sp.category && VALID_CATEGORIES.includes(sp.category as BusinessCategory)
        ? (sp.category as BusinessCategory)
        : "water";

    void BUSINESS_LABELS;

    const canSelectArea = user.role === "executive" || user.role === "vice";
    const initialArea = user.areaId ?? "kansai";
    const availableAreas = canSelectArea
      ? ALL_AREAS
      : [{ id: initialArea, name: ALL_AREAS.find((a) => a.id === initialArea)?.name ?? initialArea }];

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

  // PR c92-1 default: BulkEntryMatrix (matrix UI)
  // executive / vice のみが全エリア入力可能 (他ロールは hasDataAccess で個別セル保存時に gate)。
  // 権限の最終 enforcement は /api/entries route 側 (hasDataAccess) で行うため、UI は
  // 全セル表示してよい (他ロールが他エリアセルを編集しようとすると保存時に 403)。
  return (
    <BulkEntryMatrix
      initialYear={now.getFullYear()}
      initialMonth={now.getMonth() + 1}
      initialDay={now.getDate()}
    />
  );
}
