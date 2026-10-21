/**
 * familyTree.ts — Faz 3: deterministik aile bağları
 *
 * Kampanya verisinde aile bilgisi yok; ansiklopedide "aile ağacı" gösterebilmek
 * için bağlar **deterministik** olarak üretilir: aynı kahraman listesi her zaman
 * aynı eş/ebeveyn/çocuk ilişkisini verir (id hash'i + yaş sırası).
 *
 * Kurallar (Bannerlord mantığına yakın):
 *  - Eşler **aynı klandan** ve karşı cinsten seçilir; yaş farkı 15 yılı geçmez.
 *  - Ebeveynler çocuktan en az 18, en çok 46 yaş büyüktür.
 *  - Kardeşler aynı ebeveyn çiftine bağlanır (anne-baba tutarlı).
 *  - Hiçbir kahraman kendi kendisinin eşi/ebeveyni/çocuğu olamaz.
 */

import type { HeroRecord, Occupation } from './heroes';

const MS_DAY = 365;

/** Kadın mı? Meslekten türetilir (LADY → kadın). */
export function isFemaleHero(hero: Pick<HeroRecord, 'occupation'>): boolean {
  return hero.occupation === 'LADY';
}

/** Kahramanın kampanya günü başındaki yaşı. */
function ageAt(hero: HeroRecord, day: number): number {
  return Math.max(0, Math.floor((day - hero.birthDay) / MS_DAY));
}

/**
 * Aile bağlarını kurar. Öncelik sırası: **aynı klan → aynı krallık** (Bannerlord'da
 * eşler başka klanlardan da gelebilir). Fonksiyon tüm listeyi tarar; sonuç
 * doğrudan `hero.family` alanlarına yazılır.
 *
 * `day` = kampanya başlangıç günü (yaş hesabı için).
 */
export function linkFamilyTies(heroes: HeroRecord[], day: number): void {
  if (heroes.length < 2) return;

  const pool = [...heroes].sort((a, b) => a.birthDay - b.birthDay); // en yaşlı önce
  /** 0 = aynı klan, 1 = aynı krallık, 2 = başka krallık */
  const proximity = (a: HeroRecord, b: HeroRecord) =>
    a.clanId === b.clanId ? 0 : a.kingdomId && a.kingdomId === b.kingdomId ? 1 : 2;

  // 1) Eşleşmeler: en yaşlıdan başla; yakınlık, sonra yaş farkı.
  const taken = new Set<string>();
  for (const hero of pool) {
    if (taken.has(hero.id) || hero.family.spouseId) continue;
    const heroAge = ageAt(hero, day);
    if (heroAge < 18) continue;
    const female = isFemaleHero(hero);

    let best: HeroRecord | null = null;
    let bestKey = Infinity;
    for (const cand of pool) {
      if (cand.id === hero.id || taken.has(cand.id) || cand.family.spouseId) continue;
      if (isFemaleHero(cand) === female) continue; // karşı cins
      const candAge = ageAt(cand, day);
      if (candAge < 18) continue;
      if (proximity(hero, cand) === 2) continue; // yalnız aynı krallık
      const gap = Math.abs(heroAge - candAge);
      if (gap > 20) continue;
      const key = proximity(hero, cand) * 100 + gap;
      if (key < bestKey) {
        bestKey = key;
        best = cand;
      }
    }
    if (!best) continue;

    hero.family.spouseId = best.id;
    best.family.spouseId = hero.id;
    taken.add(hero.id);
    taken.add(best.id);
  }

  // 2) Çocuklar: eşi olan çiftlere, uygun yaş aralığındaki bekâr üyeler atanır.
  const couples = pool.filter((h) => h.family.spouseId && h.id < h.family.spouseId!);
  const singles = pool.filter((h) => !h.family.spouseId);

  for (const child of singles) {
    const childAge = ageAt(child, day);
    if (childAge < 15) continue;

    let bestCouple: HeroRecord | null = null;
    let bestGap = Infinity;
    for (const parent of couples) {
      const spouse = heroes.find((h) => h.id === parent.family.spouseId);
      if (!spouse) continue;
      const pa = ageAt(parent, day);
      const sa = ageAt(spouse, day);
      // Ebeveyn çocuktan 18..46 yaş **büyük** olmalı.
      if (pa - childAge < 18 || sa - childAge < 18) continue;
      if (pa - childAge > 46 || sa - childAge > 46) continue;
      // Aynı klan tercih edilir.
      const clanBonus = parent.clanId === child.clanId ? 0 : 1000;
      const key = clanBonus + Math.min(pa - childAge, sa - childAge);
      if (key < bestGap) {
        bestGap = key;
        bestCouple = parent;
      }
    }
    if (!bestCouple) continue;

    const mother = isFemaleHero(bestCouple)
      ? bestCouple
      : heroes.find((h) => h.id === bestCouple!.family.spouseId)!;
    const father = isFemaleHero(bestCouple)
      ? heroes.find((h) => h.id === bestCouple!.family.spouseId)!
      : bestCouple;

    child.family.motherId = mother.id;
    child.family.fatherId = father.id;
    if (!mother.family.childrenIds.includes(child.id)) mother.family.childrenIds.push(child.id);
    if (!father.family.childrenIds.includes(child.id)) father.family.childrenIds.push(child.id);
  }

  // 3) Tek ebeveynli bağlar: çift bulunamadıysa, çocuktan 18..46 yaş büyük bir
  //    klan üyesi ebeveyn olarak atanır (diğer ebeveyn kayıtlarda yok → boş).
  for (const child of singles) {
    if (child.family.fatherId || child.family.motherId) continue;
    const childAge = ageAt(child, day);
    if (childAge < 15) continue;

    let best: HeroRecord | null = null;
    let bestGap = Infinity;
    for (const cand of pool) {
      if (cand.id === child.id) continue;
      if (cand.family.spouseId === child.id) continue;
      const diff = ageAt(cand, day) - childAge;
      if (diff < 18 || diff > 46) continue;
      if (proximity(child, cand) === 2) continue;
      const key = proximity(child, cand) * 1000 + diff;
      if (key < bestGap) {
        bestGap = key;
        best = cand;
      }
    }
    if (!best) continue;
    if (isFemaleHero(best)) child.family.motherId = best.id;
    else child.family.fatherId = best.id;
    if (!best.family.childrenIds.includes(child.id)) best.family.childrenIds.push(child.id);
  }

  // Çocuk listelerini yaşa göre sırala (en büyük önce) — deterministik.
  const byId = new Map(heroes.map((h) => [h.id, h]));
  for (const h of heroes) {
    if (h.family.childrenIds.length > 1) {
      h.family.childrenIds.sort(
        (a, b) => (byId.get(a)?.birthDay ?? 0) - (byId.get(b)?.birthDay ?? 0),
      );
    }
  }
}

export interface FamilyView {
  father: HeroRecord | null;
  mother: HeroRecord | null;
  spouse: HeroRecord | null;
  children: HeroRecord[];
  siblings: HeroRecord[];
}

/** Ansiklopedi için aile görünümü (tüm bağlar çözülmüş hâlde). */
export function familyView(
  byId: Record<string, HeroRecord>,
  hero: HeroRecord,
): FamilyView {
  const father = hero.family.fatherId ? byId[hero.family.fatherId] ?? null : null;
  const mother = hero.family.motherId ? byId[hero.family.motherId] ?? null : null;
  const spouse = hero.family.spouseId ? byId[hero.family.spouseId] ?? null : null;
  const children = hero.family.childrenIds
    .map((id) => byId[id])
    .filter((h): h is HeroRecord => !!h);

  const siblingIds = new Set<string>();
  for (const parent of [father, mother]) {
    if (!parent) continue;
    for (const id of parent.family.childrenIds) {
      if (id !== hero.id) siblingIds.add(id);
    }
  }
  const siblings = [...siblingIds]
    .map((id) => byId[id])
    .filter((h): h is HeroRecord => !!h);

  return { father, mother, spouse, children, siblings };
}

/** Aile bağı var mı? (ağaç çizilip çizilmeyeceğine karar vermek için) */
export function hasFamily(view: FamilyView): boolean {
  return !!(view.father || view.mother || view.spouse || view.children.length || view.siblings.length);
}

/**
 * Bir klan için tutarlılık denetimi — probe'lar kullanır.
 * Dönen liste boşsa bağlar tutarlıdır.
 */
export function validateFamily(heroes: HeroRecord[]): string[] {
  const problems: string[] = [];
  const byId = new Map(heroes.map((h) => [h.id, h]));
  const ageOk = (a: HeroRecord, b: HeroRecord, min: number, max: number) => {
    const diff = Math.abs(a.birthDay - b.birthDay) / MS_DAY;
    return diff >= min - 0.02 && diff <= max + 0.02;
  };

  for (const h of heroes) {
    const { spouseId, fatherId, motherId, childrenIds } = h.family;
    if (spouseId) {
      const s = byId.get(spouseId);
      if (!s) problems.push(`${h.id}: eş bulunamadı`);
      else {
        if (s.family.spouseId !== h.id) problems.push(`${h.id}: eş bağı simetrik değil`);
        if (isFemaleHero(s) === isFemaleHero(h)) problems.push(`${h.id}: eş aynı cinsiyette`);
        if (!ageOk(h, s, 0, 20)) problems.push(`${h.id}: eş yaş farkı > 20`);
      }
    }
    for (const parentId of [fatherId, motherId]) {
      if (!parentId) continue;
      const p = byId.get(parentId);
      if (!p) problems.push(`${h.id}: ebeveyn bulunamadı`);
      else if (!p.family.childrenIds.includes(h.id)) {
        problems.push(`${h.id}: ebeveynin çocuk listesinde yok`);
      } else if (!ageOk(h, p, 18, 46)) {
        problems.push(`${h.id}: ebeveyn-çocuk yaş farkı 18..46 dışında`);
      }
    }
    if (fatherId && motherId) {
      const f = byId.get(fatherId);
      const m = byId.get(motherId);
      if (f && isFemaleHero(f)) problems.push(`${h.id}: baba kadın olarak işaretli`);
      if (m && !isFemaleHero(m)) problems.push(`${h.id}: anne erkek olarak işaretli`);
    }
    for (const id of childrenIds) {
      const c = byId.get(id);
      if (!c) problems.push(`${h.id}: çocuk bulunamadı`);
      else if (c.family.fatherId !== h.id && c.family.motherId !== h.id) {
        problems.push(`${h.id}: çocuğun ebeveyni bu kahraman değil`);
      }
    }
    if (childrenIds.length !== new Set(childrenIds).size) {
      problems.push(`${h.id}: tekrarlı çocuk id`);
    }
  }
  return problems;
}

export const FAMILY_TREE_VERSION = 1;

/** Aile ağacı görünümü için yaş etiketi. */
export function ageLabel(hero: HeroRecord, day: number): string {
  return `${ageAt(hero, day)}y`;
}

/** Meslekten cinsiyet etiketi (UI rozeti). */
export function genderLabel(occupation: Occupation): string {
  return occupation === 'LADY' ? 'Kadın' : 'Erkek';
}
