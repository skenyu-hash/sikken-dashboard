// SIKKEN Dashboard 権限ロジック SSOT
//
// 仕様書: docs/specs/spec-form-redesign.md §2 (A-1) / §3 (A-2)
//
// このファイルは権限定義の単一情報源 (SSOT)。
// UI 側・API 側ともにここから import して判定する。
// 仕様変更は本ファイルと仕様書を同時更新すること。
//
// 暫定事項 (PR #38 で解消予定):
//   user.businessCategory は SessionUser/JWT に未流通のため null/undefined
//   が来うる。その場合 hasDataAccess() は業態判定をスキップしてエリアのみ
//   で判定する後方互換ロジックを採用する (判断点 4 案 B、46名の再ログイン
//   を回避するため)。

// ============ 基本型 ============

export type Role = "executive" | "vice" | "manager" | "chief" | "staff" | "clerk";

// 8 拠点（仕様書 §1.1 と整合）。shizuoka は将来稼働枠。
export type AreaId =
  | "kansai"
  | "kanto"
  | "nagoya"
  | "kyushu"
  | "kitakanto"
  | "hokkaido"
  | "chugoku"
  | "shizuoka";

export type BusinessCategory =
  | "water"
  | "electric"
  | "locksmith"
  | "road"
  | "detective";

// 仕様書 §3 の 12 ページ + cockpit (既存実装存在、executive only)。
// cf は仕様書未掲載のため Page 型から除外（実装も未存在）。
export type Page =
  | "dashboard"
  | "import"
  | "data-io"
  | "admin"
  | "targets"
  | "meeting"
  | "minutes"
  | "trends"
  | "ranking"
  | "matrix"
  | "breakeven"
  | "mobile-kpi"
  | "cockpit";

export type Action = "view" | "edit";

export type PermissionLevel = "edit" | "view" | "none";

export interface User {
  role: Role;
  area_id?: AreaId | string | null;
  business_category?: BusinessCategory | string | null;
}

// ============ 役職ラベル（表示用） ============
//
// roles.ts から移管。SSOT の一部として permissions.ts に集約する。

export const ROLE_LABELS: Record<Role, string> = {
  executive: "役員",
  vice: "副社長",
  manager: "部長",
  chief: "課長",
  staff: "社員",
  clerk: "事務員",
};

export const ALL_ROLES: Role[] = [
  "executive",
  "vice",
  "manager",
  "chief",
  "staff",
  "clerk",
];

// ============ A-2 ページアクセス マトリクス ============
//
// 仕様書 §3 と完全一致。値は edit / view / none。
// edit 権限があれば view も自動的に許可される (hasPageAccess の判定で吸収)。
// "view※" (A-1 緩和ページ) は isA1Exception() で別途判定。

const PAGE_ACCESS_MATRIX: Record<Page, Record<Role, PermissionLevel>> = {
  // 1. ダッシュボード - 全ロール編集
  dashboard: {
    executive: "edit",
    vice: "edit",
    manager: "edit",
    chief: "edit",
    staff: "edit",
    clerk: "edit",
  },
  // 2. インポート - executive のみ
  import: {
    executive: "edit",
    vice: "none",
    manager: "none",
    chief: "none",
    staff: "none",
    clerk: "none",
  },
  // 3. データ入出力 - executive のみ
  "data-io": {
    executive: "edit",
    vice: "none",
    manager: "none",
    chief: "none",
    staff: "none",
    clerk: "none",
  },
  // 11. ユーザー管理 - executive のみ
  admin: {
    executive: "edit",
    vice: "none",
    manager: "none",
    chief: "none",
    staff: "none",
    clerk: "none",
  },
  // 4. 目標管理 - clerk 以外編集可
  targets: {
    executive: "edit",
    vice: "edit",
    manager: "edit",
    chief: "edit",
    staff: "edit",
    clerk: "none",
  },
  // 5. 会議用ビュー - clerk 以外閲覧
  meeting: {
    executive: "view",
    vice: "view",
    manager: "view",
    chief: "view",
    staff: "view",
    clerk: "none",
  },
  // 6. 議事録 - clerk 以外編集可。表示範囲は hasMinuteAccess() で別途判定
  minutes: {
    executive: "edit",
    vice: "edit",
    manager: "edit",
    chief: "edit",
    staff: "edit",
    clerk: "none",
  },
  // 7. トレンド分析 - clerk 以外閲覧 (A-1 例外)
  trends: {
    executive: "view",
    vice: "view",
    manager: "view",
    chief: "view",
    staff: "view",
    clerk: "none",
  },
  // 9. ランキング - clerk 以外閲覧 (A-1 例外)
  ranking: {
    executive: "view",
    vice: "view",
    manager: "view",
    chief: "view",
    staff: "view",
    clerk: "none",
  },
  // 12. エリア×業態マトリクス - executive/vice のみ閲覧 (A-1 例外)
  matrix: {
    executive: "view",
    vice: "view",
    manager: "none",
    chief: "none",
    staff: "none",
    clerk: "none",
  },
  // 8. 損益分岐 - executive/vice のみ閲覧
  breakeven: {
    executive: "view",
    vice: "view",
    manager: "none",
    chief: "none",
    staff: "none",
    clerk: "none",
  },
  // 10. モバイル KPI - executive/vice 編集、manager〜staff 閲覧、clerk ×
  "mobile-kpi": {
    executive: "edit",
    vice: "edit",
    manager: "view",
    chief: "view",
    staff: "view",
    clerk: "none",
  },
  // (仕様書未掲載) コックピット - 既存挙動維持で executive only
  cockpit: {
    executive: "edit",
    vice: "none",
    manager: "none",
    chief: "none",
    staff: "none",
    clerk: "none",
  },
};

// ============ A-1 例外ページ（越境閲覧緩和） ============
//
// 仕様書 §2 後段:「`/trends`、`/ranking`、`/matrix` は越境比較が目的のため、
// 閲覧権限を持つロールは全エリア×全業態を読み取り専用で見られる」
const A1_EXCEPTION_PAGES: ReadonlyArray<Page> = ["trends", "ranking", "matrix"];

// ============ 議事録 階層可視性 ============
//
// 仕様書 §3 後段。閲覧者ロール → 見られる議事録の作成者ロール群。
const MINUTE_VISIBILITY: Record<Role, Role[]> = {
  executive: ["executive", "vice", "manager", "chief", "staff", "clerk"],
  vice: ["vice", "manager", "chief", "staff"],
  manager: ["manager", "chief", "staff"],
  chief: ["chief", "staff"],
  staff: ["staff"],
  clerk: [],
};

// ============ 公開 API ============

/**
 * Page → URL パスへの変換（NavBar 等のメニュー判定で利用）。
 */
export function pageToPath(page: Page): string {
  return page === "dashboard" ? "/" : `/${page}`;
}

/**
 * URL パス → Page への変換（不一致時 null）。
 */
export function pathToPage(path: string): Page | null {
  if (path === "/") return "dashboard";
  const candidate = path.startsWith("/") ? path.slice(1) : path;
  return (Object.keys(PAGE_ACCESS_MATRIX) as Page[]).includes(candidate as Page)
    ? (candidate as Page)
    : null;
}

/**
 * A-1 データスコープ判定。
 *
 * 仕様書 §2:
 *   担当エリア＋担当業態: 全ロール 閲覧+入力+編集可
 *   他エリア／他業態:
 *     executive → 編集
 *     vice / manager → 閲覧のみ
 *     chief / staff / clerk → ×
 *
 * user.business_category が null/undefined の場合は業態判定をスキップ
 * してエリアのみで「自エリア」を判定する (PR #38 で解消予定の暫定処置)。
 */
export function hasDataAccess(
  user: User,
  targetArea: AreaId | string,
  targetCategory: BusinessCategory | string,
  action: Action
): boolean {
  // 担当領域判定
  const isOwnArea =
    user.area_id != null && user.area_id === targetArea;
  const isOwnCategory =
    user.business_category == null ||
    user.business_category === targetCategory;
  const isOwn = isOwnArea && isOwnCategory;

  if (isOwn) {
    // 仕様書 A-1 表: 担当領域は全ロール 閲覧+入力+編集可
    return true;
  }

  // 他エリア／他業態
  switch (user.role) {
    case "executive":
      return true;
    case "vice":
    case "manager":
      return action === "view";
    case "chief":
    case "staff":
    case "clerk":
      return false;
    default:
      return false;
  }
}

/**
 * A-2 ページアクセス判定。
 *
 * edit 権限があれば view 要求も許可する (上位互換)。
 * A-1 例外ページの越境閲覧は本関数では判定せず、canSeeDataOnPage() を使用。
 */
export function hasPageAccess(user: User, page: Page, action: Action): boolean {
  const level = PAGE_ACCESS_MATRIX[page]?.[user.role] ?? "none";
  if (level === "none") return false;
  if (action === "view") return true; // edit/view どちらでも閲覧可
  return level === "edit";
}

/**
 * A-1 緩和対象ページ判定（trends / ranking / matrix）。
 */
export function isA1Exception(page: Page): boolean {
  return A1_EXCEPTION_PAGES.includes(page);
}

/**
 * 統合判定: あるページで特定 area × category のデータを閲覧できるか。
 *
 * - ページ自体に view 権限がない → false
 * - A-1 例外ページなら全データ閲覧可
 * - 通常は A-1 ルール (hasDataAccess の view 判定) に従う
 */
export function canSeeDataOnPage(
  user: User,
  page: Page,
  targetArea: AreaId | string,
  targetCategory: BusinessCategory | string
): boolean {
  if (!hasPageAccess(user, page, "view")) return false;
  if (isA1Exception(page)) return true;
  return hasDataAccess(user, targetArea, targetCategory, "view");
}

/**
 * 議事録の階層可視性判定。
 *
 * @param user 閲覧しようとしているユーザー
 * @param minuteRole 議事録の作成者ロール
 */
export function hasMinuteAccess(user: User, minuteRole: Role): boolean {
  return MINUTE_VISIBILITY[user.role].includes(minuteRole);
}
