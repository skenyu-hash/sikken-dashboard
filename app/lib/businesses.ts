export type BusinessCategory = 'water' | 'electric' | 'locksmith' | 'road' | 'detective';

export const BUSINESSES: { id: BusinessCategory; label: string; areas: string[] }[] = [
  { id: 'water',     label: '水道', areas: ['kansai','kanto','nagoya','kyushu','kitakanto','hokkaido','chugoku','shizuoka'] },
  { id: 'electric',  label: '電気', areas: ['kansai','kanto'] },
  { id: 'locksmith', label: '鍵',   areas: ['kansai'] },
  { id: 'road',      label: 'ロード', areas: ['kansai'] },
  { id: 'detective', label: '探偵', areas: ['kansai','nagoya'] },
];

export const AREA_NAMES: Record<string, string> = {
  kansai: '関西', kanto: '関東', nagoya: '名古屋', kyushu: '九州',
  kitakanto: '北関東', hokkaido: '北海道', chugoku: '中国', shizuoka: '静岡',
};
