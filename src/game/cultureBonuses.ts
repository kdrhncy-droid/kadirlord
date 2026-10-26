/**
 * cultureBonuses.ts — Kültürel feat'lerin TEK kaynağı (10.8).
 *
 * Satırlar, Mount & Blade Wiki "Culture" sayfasındaki güncel Bannerlord
 * kültürel feat listesinden birebirdir (cezalar dahil). Karakter yaratma
 * kartları buradan beslenir; kartta görünen her satırın `wiredIn` alanı,
 * etkinin kodda uygulandığı yeri gösterir. Karşılığı bu projede henüz
 * bulunmayan sistemler (kervan/paralı asker/veteran milis vb.) karta
 * YAZILMAZ; `pendingLines` içinde gerekçesiyle durur.
 */
import type { CampaignState, FactionId } from './rules.ts';

export interface CultureFeatModifiers {
  /** Orman hız cezasının azalma oranı (0.5 = ceza yarıya iner). */
  forestSpeedPenaltyReduction: number;
  /** Çöl hız cezası tamamen kalkar mı? */
  noDesertSpeedPenalty: boolean;
  /** Parti günlük ücret çarpanı. */
  wageMultiplier: number;
  /** Atlı birlik devşirme ücreti çarpanı. */
  mountedRecruitCostMultiplier: number;
  /** Şehir vergi geliri çarpanı. */
  townTaxMultiplier: number;
  /** Savaşlardan nam çarpanı. */
  battleRenownMultiplier: number;
  /** Orduya lord çağırma nüfuz maliyeti çarpanı. */
  armyCallCostMultiplier: number;
}

export interface CultureFeatLine {
  text: string;
  /** Etkinin uygulandığı dosya/fonksiyon. */
  wiredIn: string;
}

export interface CultureFeatDefinition {
  culture: FactionId;
  title: string;
  featName: string;
  modifiers: CultureFeatModifiers;
  /** Karta yazılabilen, kod karşılığı olan satırlar. */
  lines: CultureFeatLine[];
  /** Bannerlord'da var ama bu projede sistemi henüz olmayan satırlar (karta çıkmaz). */
  pendingLines: string[];
}

const NEUTRAL: CultureFeatModifiers = {
  forestSpeedPenaltyReduction: 0,
  noDesertSpeedPenalty: false,
  wageMultiplier: 1,
  mountedRecruitCostMultiplier: 1,
  townTaxMultiplier: 1,
  battleRenownMultiplier: 1,
  armyCallCostMultiplier: 1,
};

export const CULTURE_FEATS: Record<string, CultureFeatDefinition> = {
  aserai: {
    culture: 'aserai',
    title: 'Aserai',
    featName: 'Çöl Halkı',
    modifiers: { ...NEUTRAL, noDesertSpeedPenalty: true, wageMultiplier: 1.05 },
    lines: [
      { text: 'Çölde hız cezası yok.', wiredIn: 'logistics.ts calculatePartyLogistics (arazi çarpanı)' },
      { text: 'Partideki askerlerin günlük ücreti +%5 (ceza).', wiredIn: 'rules.ts günlük tik (calculateDailyWage × wageMultiplier)' },
    ],
    pendingLines: [
      'Kervanlar %30 ucuz, ticaret cezası %10 az — kervan kurma/ticaret cezası sistemi yok.',
    ],
  },
  battania: {
    culture: 'battania',
    title: 'Batanya',
    featName: 'Orman Halkı',
    modifiers: { ...NEUTRAL, forestSpeedPenaltyReduction: 0.5 },
    lines: [
      { text: 'Ormanda hız cezası %50 daha az.', wiredIn: 'logistics.ts calculatePartyLogistics (orman çarpanı)' },
    ],
    pendingLines: [
      'Ormanda +%15 görüş menzili — görüş menzili sistemi yok.',
      'Sahip şehirlerde milislerin %20 ihtimalle kıdemli doğması — milis doğum sistemi yok.',
      'Şehir projeleri %10 yavaş (ceza) — proje ilerleme hızı tek noktadan yönetilmiyor.',
    ],
  },
  khuzait: {
    culture: 'khuzait',
    title: 'Kuzait',
    featName: 'Bozkır Halkı',
    modifiers: { ...NEUTRAL, mountedRecruitCostMultiplier: 0.9, townTaxMultiplier: 0.8 },
    lines: [
      { text: 'Atlı birlik devşirme ücreti %10 ucuz.', wiredIn: 'recruitment.ts recruitQuote (süvari ücreti)' },
      { text: 'Şehir vergi geliri %20 az (ceza).', wiredIn: 'rules.ts günlük tik (yerleşim vergisi)' },
    ],
    pendingLines: [
      'Atlı birlik terfisi %10 ucuz — terfi ücreti hesabına bağlanacak (partySystem).',
      'Köylerde at/katır/inek/koyun üretimi +%25 — köy üretim sistemi yok.',
    ],
  },
  sturgia: {
    culture: 'sturgia',
    title: 'Sturgia',
    featName: 'Kuzey Halkı',
    modifiers: { ...NEUTRAL, armyCallCostMultiplier: 0.5 },
    lines: [
      { text: 'Ordular %50 daha az nüfuzla toplanır.', wiredIn: 'armySystem.ts calculatePartyCallInfluenceCost' },
    ],
    pendingLines: [
      'Köy tahıl üretimi +%10 — köy üretim sistemi yok.',
      'Krallık kararlarından ilişki cezası %20 fazla — karar/oylama ilişki sistemi yok.',
    ],
  },
  vlandia: {
    culture: 'vlandia',
    title: 'Vlandiya',
    featName: 'Feodal Halk',
    modifiers: { ...NEUTRAL, battleRenownMultiplier: 1.05, armyCallCostMultiplier: 1.2 },
    lines: [
      { text: 'Savaşlardan +%5 nam.', wiredIn: 'rules.ts savaş zaferi nam kazancı' },
      { text: 'Orduya lord çağırma %20 pahalı (ceza).', wiredIn: 'armySystem.ts calculatePartyCallInfluenceCost' },
    ],
    pendingLines: [
      'Paralı asker geliri +%15 — paralı asker sözleşme sistemi yok.',
      'Kalelere bağlı köylerde üretim +%10 — köy üretim sistemi yok.',
    ],
  },
  empire: {
    culture: 'empire',
    title: 'İmparatorluk',
    featName: 'İmparatorluk Halkı',
    modifiers: { ...NEUTRAL },
    lines: [],
    pendingLines: [
      'Garnizon ücreti %20 az — garnizon ücret sistemi yok.',
      'Orduda bulunmak +%25 nüfuz — orduda bulunma nüfuz geliri sistemi yok.',
      'Köy ocak (hearth) artışı %20 yavaş (ceza) — ocak sistemi yok.',
    ],
  },
};

export const PLAYABLE_CULTURES: FactionId[] = [
  'vlandia',
  'sturgia',
  'empire',
  'aserai',
  'khuzait',
  'battania',
];

/** Oyuncu kahramanının kültürü (oynanabilir altı kültürden biri değilse null). */
export function getPlayerCulture(
  state: Pick<CampaignState, 'heroes'> | null | undefined,
): FactionId | null {
  const hero = state?.heroes?.find((h) => h.kind === 'PLAYER');
  const culture = hero?.culture;
  return culture && culture in CULTURE_FEATS ? (culture as FactionId) : null;
}

export function getCultureFeat(culture: string | null | undefined): CultureFeatDefinition | null {
  if (!culture) return null;
  return CULTURE_FEATS[culture] ?? null;
}

export function getCultureModifiers(culture: string | null | undefined): CultureFeatModifiers {
  return getCultureFeat(culture)?.modifiers ?? NEUTRAL;
}

export function getPlayerCultureModifiers(
  state: Pick<CampaignState, 'heroes'> | null | undefined,
): CultureFeatModifiers {
  return getCultureModifiers(getPlayerCulture(state));
}
