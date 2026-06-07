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
