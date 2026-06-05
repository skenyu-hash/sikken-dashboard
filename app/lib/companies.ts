// 会社マッピング (純関数 lib)。
//
// 用途:
//   - /targets タブ (会社別 view)
//   - /dashboard (会社別タブ)
//   - /daily-report (会社別視点、c96-1 で追加)
//
// マッピング仕様 (反さん確定、2026-06-05 で TOPLEVEL に shizuoka 追加 + 未割当を導入):
//   - 会社別視点のデフォルト選択肢 = 7 社 + 未割当
//   - area は kanto / kansai / nagoya / kyushu / kitakanto / hokkaido / chugoku / shizuoka
//   - 「東海 = 名古屋 (nagoya)」の運用に統一
//   - 「未割当」(UNASSIGNED_COMPANY_ID = "unassigned") = 7 社いずれにも属さない (category, area) の全集合
//     BUSINESSES から差分自動算出 → BUSINESSES に新 area / category を追加すれば自動で反映
//
// 既存 API (互換維持、c96-1 以前から /targets / /dashboard で使用):
//   - export const COMPANIES: 既存 6 社 + 7 社目 SIKKEN Group。
//   - 各オブジェクト: { id, name, areas: [{ category, areaId }] } 構造そのまま。
//
// c96-1 で追加 (新規 API、既存利用箇所は touch 不要):
//   - 型 CompanyId / CompanyAreaAssignment / Company
//   - UNASSIGNED_COMPANY_ID 定数
//   - "unassigned" を COMPANIES に追記 (BUSINESSES からの自動差分)
//   - 補助関数 getCompany / getCompanyFor / getCompanyCategoriesAndAreas / getCompanyAssignments
//
// 拡張方針: 新規会社追加時は COMPANIES 配列に追記、(category, area) 所属変更はその会社の areas を更新。

import type { BusinessCategory } from "./businesses";
import { BUSINESSES } from "./businesses";

/** 7 社 + 未割当の会社識別子 (既存 ID 互換: sikken / mavericks 等は変更しない)。 */
export type CompanyId =
  | "sikken"
  | "mavericks"
  | "toplevel"
  | "rexia"
  | "dunk"
  | "ulua"
  | "grits"
  | "unassigned";

/** 会社が担当する 1 件の (業態, エリア) 割当。既存 API: areaId キーは互換維持。 */
export type CompanyAreaAssignment = {
  category: BusinessCategory;
  areaId: string;
};

export type Company = {
  id: CompanyId;
  name: string;
  areas: readonly CompanyAreaAssignment[];
};

/** "未割当" 会社 ID 定数 (= 7 社いずれにも属さない (category, area) の自動集約)。 */
export const UNASSIGNED_COMPANY_ID: CompanyId = "unassigned";

/**
 * 7 社の (category, areaId) 担当マッピング (反さん確定、2026-06-05 TOPLEVEL に shizuoka 追加)。
 *
 * REXIA  : 関東 + 北関東 (水道)
 * Mavericks: 関西 + 北海道 (水道)
 * TOPLEVEL: 名古屋 + 静岡 (水道)   ← c96-1 で shizuoka 追加
 * DUNK   : 九州 + 中国 (水道) + 関西 (ロード)
 * ULUA   : 関西 + 関東 (電気)
 * SIKKEN Group: 関西 (鍵)
 * GriT's : 関西 + 名古屋 (探偵)
 */
const ASSIGNED_COMPANIES: Company[] = [
  {
    id: 'mavericks',
    name: 'Mavericks',
    areas: [
      { category: 'water', areaId: 'kansai' },
      { category: 'water', areaId: 'hokkaido' },
    ],
  },
  {
    id: 'toplevel',
    name: 'TOPLEVEL',
    areas: [
      { category: 'water', areaId: 'nagoya' },
      { category: 'water', areaId: 'shizuoka' }, // c96-1: 反さん指示で追加 (東海+静岡)
    ],
  },
  {
    id: 'rexia',
    name: 'REXIA',
    areas: [
      { category: 'water', areaId: 'kanto' },
      { category: 'water', areaId: 'kitakanto' },
    ],
  },
  {
    id: 'dunk',
    name: 'DUNK',
    areas: [
      { category: 'water', areaId: 'kyushu' },
      { category: 'water', areaId: 'chugoku' },
      { category: 'road', areaId: 'kansai' },
    ],
  },
  {
    id: 'ulua',
    name: 'ULUA',
    areas: [
      { category: 'electric', areaId: 'kansai' },
      { category: 'electric', areaId: 'kanto' },
    ],
  },
  {
    id: 'grits',
    name: "GriT's",
    areas: [
      { category: 'detective', areaId: 'kansai' },
      { category: 'detective', areaId: 'nagoya' },
    ],
  },
  {
    id: 'sikken',
    name: 'SIKKEN Group',
    areas: [
      { category: 'locksmith', areaId: 'kansai' },
    ],
  },
];

/** "未割当" assignments = BUSINESSES に存在する (category, area) のうち、7 社のいずれにも属さないもの。
 *  businesses.ts の各 category.areas 配列から全 (category, area) を列挙し、ASSIGNED_COMPANIES の
 *  areas 集合と差分を取って算出。BUSINESSES に新 area / category を追加すれば自動で反映される。 */
function computeUnassignedAreas(): CompanyAreaAssignment[] {
  const assigned = new Set<string>();
  for (const c of ASSIGNED_COMPANIES) {
    for (const a of c.areas) {
      assigned.add(`${a.category}|${a.areaId}`);
    }
  }
  const result: CompanyAreaAssignment[] = [];
  for (const b of BUSINESSES) {
    for (const area of b.areas) {
      const key = `${b.id}|${area}`;
      if (!assigned.has(key)) {
        result.push({ category: b.id, areaId: area });
      }
    }
  }
  return result;
}

/** 全 8 社 (7 社 + 未割当)。未割当は BUSINESSES から差分自動算出 (BUSINESSES 更新時に追従)。
 *  既存 API (.id / .name / .areas) 互換: /targets / /dashboard は本配列を unchanged で使用。 */
export const COMPANIES: readonly Company[] = [
  ...ASSIGNED_COMPANIES,
  {
    id: UNASSIGNED_COMPANY_ID,
    name: '未割当',
    areas: computeUnassignedAreas(),
  },
];

/** 会社 ID から会社オブジェクトを取得。未知 ID は undefined。 */
export function getCompany(id: string): Company | undefined {
  return COMPANIES.find((c) => c.id === id);
}

/** (category, areaId) からその所属会社 ID を返す。
 *  複数会社に属することはない (マッピングが全 (category, areaId) を排他的に分割している前提)。
 *  見つからない場合は "unassigned"。 */
export function getCompanyFor(category: BusinessCategory, areaId: string): CompanyId {
  for (const c of ASSIGNED_COMPANIES) {
    if (c.areas.some((a) => a.category === category && a.areaId === areaId)) {
      return c.id;
    }
  }
  return UNASSIGNED_COMPANY_ID;
}

/** 会社 ID の担当 areas から、ユニークな category 一覧と areaId 一覧を派生取得。
 *  会社別視点の業態 / エリア絞り込み UI の選択肢を組み立てるのに使う (連動絞り込み)。 */
export function getCompanyCategoriesAndAreas(companyId: string): {
  categories: BusinessCategory[];
  areas: string[];
} {
  const company = getCompany(companyId);
  if (!company) return { categories: [], areas: [] };
  const cats = new Set<BusinessCategory>();
  const areas = new Set<string>();
  for (const a of company.areas) {
    cats.add(a.category);
    areas.add(a.areaId);
  }
  return {
    categories: Array.from(cats),
    areas: Array.from(areas),
  };
}

/** 会社 ID の areas を集計対象として展開 (categories[] / areas[] の cross-product ではなく
 *  実 assignments の通り)。range-aggregate API への入力組み立て用。 */
export function getCompanyAssignments(companyId: string): CompanyAreaAssignment[] {
  const company = getCompany(companyId);
  return company ? Array.from(company.areas) : [];
}
