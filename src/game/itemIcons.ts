/**
 * itemIcons.ts — Faz B3: eşya ikon anahtarları (veri tarafı).
 *
 * Pazar/envanter/ganimet aynı anahtarları kullanır; çizim `components/ItemIcon.tsx`
 * içinde yapılır. Emoji **yasak**: Bannerlord da eşyaları tek renkli vektör
 * siluetlerle gösterir, platformlar arası emoji görünümü tutarsızdır.
 */

export type ItemIconKey =
  | 'sword'
  | 'axe'
  | 'mace'
  | 'spear'
  | 'bow'
  | 'crossbow'
  | 'arrows'
  | 'shield'
  | 'helmet'
  | 'armor'
  | 'cloth'
  | 'shoulder'
  | 'gloves'
  | 'boots'
  | 'horse'
  | 'harness'
  | 'grain'
  | 'meat'
  | 'fish'
  | 'cheese'
  | 'oil'
  | 'iron'
  | 'salt'
  | 'wool'
  | 'wine'
  | 'honey'
  | 'fur'
  | 'tools'
  | 'pottery'
  | 'fruit'
  | 'crate';

/** Probe ve ikon eşlemesini doğrulamak için tam liste. */
export const ITEM_ICON_KEYS: ItemIconKey[] = [
  'sword',
  'axe',
  'mace',
  'spear',
  'bow',
  'crossbow',
  'arrows',
  'shield',
  'helmet',
  'armor',
  'cloth',
  'shoulder',
  'gloves',
  'boots',
  'horse',
  'harness',
  'grain',
  'meat',
  'fish',
  'cheese',
  'oil',
  'iron',
  'salt',
  'wool',
  'wine',
  'honey',
  'fur',
  'tools',
  'pottery',
  'fruit',
  'crate',
];

/** Kategori sekmesi ikonları (pazar üst şeridi). */
export const CATEGORY_ICON_KEYS: Record<'ALL' | 'WEAPON' | 'SHIELD' | 'ARMOR' | 'FOOD' | 'HORSE', ItemIconKey> = {
  ALL: 'crate',
  WEAPON: 'sword',
  SHIELD: 'shield',
  ARMOR: 'armor',
  FOOD: 'grain',
  HORSE: 'horse',
};
