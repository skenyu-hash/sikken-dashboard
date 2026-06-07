export type BusinessCategory = 'water' | 'electric' | 'locksmith' | 'road' | 'detective';

// PR-1 (2026-06-07): 未展開エリアを BUSINESSES マスターに追加。
//   各業態の areas は「既存エリア (順序維持) + 末尾に追加」の形。
//   - water: 変更なし (8 エリア)
//   - electric:  +5 (kitakanto/kyushu/nagoya/chugoku/hokkaido) → 計 7
//   - locksmith: +6 (kanto/nagoya/kyushu/kitakanto/chugoku/hokkaido) → 計 7
//   - road:      +4 (kanto/nagoya/kyushu/hokkaido) → 計 5
//   - detective: +3 (kanto/kyushu/hokkaido) → 計 5
//   合計 32 ペア。companies.ts 7 社 assignments 16 ペアを除く 16 ペアが未割当として
//   computeUnassignedAreas() で自動算出される (うち 2 ペア electric/kyushu と electric/kitakanto
//   は同 PR で DUNK / REXIA に所属させているため、最終 未割当 = 16 ペア)。
//   UI 影響: 本 PR では一切なし (会社別タブの「未割当」中身が増えるのみ、現状空表示は維持)。
export const BUSINESSES: { id: BusinessCategory; label: string; areas: string[] }[] = [
  { id: 'water',     label: '水道', areas: ['kansai','kanto','nagoya','kyushu','kitakanto','hokkaido','chugoku','shizuoka'] },
  { id: 'electric',  label: '電気', areas: ['kansai','kanto','kitakanto','kyushu','nagoya','chugoku','hokkaido'] },
  { id: 'locksmith', label: '鍵',   areas: ['kansai','kanto','nagoya','kyushu','kitakanto','chugoku','hokkaido'] },
  { id: 'road',      label: 'ロード', areas: ['kansai','kanto','nagoya','kyushu','hokkaido'] },
  { id: 'detective', label: '探偵', areas: ['kansai','nagoya','kanto','kyushu','hokkaido'] },
];

export const AREA_NAMES: Record<string, string> = {
  kansai: '関西', kanto: '関東', nagoya: '名古屋', kyushu: '九州',
  kitakanto: '北関東', hokkaido: '北海道', chugoku: '中国', shizuoka: '静岡',
};

// PR-3 (2026-06-08): /entry のエリア select を BUSINESSES マスター連動にするための派生ヘルパー。
//   背景: 旧 /entry は全業態で 8 エリア固定 → 探偵×北関東 等のマスター外ペアが入力可能で
//         PK 整合性リスクがあった。本ヘルパーで category → 該当 areas を引く。

/** PR-3: マスター外ペア clamp 時の既定エリア。
 *  関西優先 (SIKKEN HQ 拠点、全 5 業態が含む)、無ければ category 内の明示 fallback。
 *  c96-2 hotfix の MIN_DATE_C96 (明示定数) と同方針で「先頭」依存を排除。 */
export const DEFAULT_AREA_FOR_CLAMP = 'kansai';

/** PR-3: category → エリア配列 (BUSINESSES.find 派生)、未知 category は空配列 fallback。 */
export function getAreasForCategory(cat: BusinessCategory): string[] {
  return BUSINESSES.find((b) => b.id === cat)?.areas ?? [];
}

/** PR-3: area が cat に含まれていなければ既定エリアへ強制移動。
 *  c96 hotfix の clampDate(MIN_DATE_C96) と同方針 (明示定数 → silently 既定値正常化、
 *  ユーザーを 404 で困らせない)。
 *  優先順位:
 *    1. 入力 area が cat.areas に含まれる → そのまま返す
 *    2. DEFAULT_AREA_FOR_CLAMP (= 関西) が cat.areas に含まれる → 関西を返す
 *    3. cat.areas[0] (防御 fallback、現状 BUSINESSES では発動しない) */
export function clampAreaToCategory(area: string, cat: BusinessCategory): string {
  const areas = getAreasForCategory(cat);
  if (areas.includes(area)) return area;
  if (areas.includes(DEFAULT_AREA_FOR_CLAMP)) return DEFAULT_AREA_FOR_CLAMP;
  return areas[0] ?? area;
}
