// /entry ページ Server Component
//
// 仕様書: docs/specs/spec-form-redesign.md §4
// 権限: hasPageAccess(user, "entry", "view") + エリアスコープは
//       canSeeDataOnPage / hasDataAccess (PR #36 の SSOT)

import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { hasPageAccess, type Role } from "../lib/permissions";
import { BUSINESS_LABELS, type BusinessCategory } from "../lib/business-labels";
import EntryForm from "./EntryForm";

const VALID_CATEGORIES: BusinessCategory[] = ["water", "electric", "locksmith", "road", "detective"];
const ALL_AREAS: { id: string; name: string }[] = [
  { id: "kansai", name: "関西" }, { id: "kanto", name: "関東" },
  { id: "nagoya", name: "名古屋" }, { id: "kyushu", name: "九州" },
  { id: "kitakanto", name: "北関東" }, { id: "hokkaido", name: "北海道" },
  { id: "chugoku", name: "中国" }, { id: "shizuoka", name: "静岡" },
];

type SearchParams = { category?: string };

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

  // 業態: クエリ ?category=water 等。未指定/不正は water (canonical) フォールバック。
  const category: BusinessCategory =
    sp.category && VALID_CATEGORIES.includes(sp.category as BusinessCategory)
      ? (sp.category as BusinessCategory)
      : "water";

  // PR #40 で 5 業態展開予定。canonical 以外を選んだ場合はラベルが water 流用に
  // なる旨をユーザーに気づかせるため、placeholder の有無は見ないが Form 上部に
  // 注意書きは入れない (ラベル定義側でフォールバック済み)。
  void BUSINESS_LABELS;

  // 利用可能エリア: executive と vice は全エリア手動選択、他は自エリア固定。
  const canSelectArea = user.role === "executive" || user.role === "vice";
  const initialArea = user.areaId ?? "kansai";
  const availableAreas = canSelectArea
    ? ALL_AREAS
    : [{ id: initialArea, name: ALL_AREAS.find((a) => a.id === initialArea)?.name ?? initialArea }];

  const now = new Date();

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
