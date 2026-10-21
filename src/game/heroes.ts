/**
 * heroes.ts — Ansiklopedi veri temeli (Faz 0)
 *
 * Bannerlord'un "Encyclopedia → Heroes" sayfasının bizdeki karşılığı için
 * lordları **tek tip kayda (HeroRecord)** çevirir. Ansiklopedi, diyalog, quest
 * ve aile ağacı ekranları bu kayıtları okuyacak.
 *
 * Tasarım kararları (kullanıcı onayı, 2026-10-21):
 *  - **Orta yol fog of war:** isim / unvan / klan / krallık / ilişki her zaman
 *    görünür; **yaş ve beceriler** yalnızca kahramanla tanışıldıysa (`revealed`).
 *  - Veriler mevcut `LordAgent` kayıtlarından **deterministik** türetilir
 *    (hash tabanlı) → aynı lord her zaman aynı yaşta/beceride doğar, save
 *    gerekmez. Kalıcı olması gerekenler (tanışma, esir düşme) campaign'e yazılır.
 *  - `LordAgent` şeması **değiştirilmedi**: ansiklopedi yeni kayıtları okur,
 *    oyunun geri kalanı eski şemayla çalışmaya devam eder.
 */
import type {
  BannerlordSkillId,
  CampaignState,
  FactionId,
  LordAgent,
  Settlement,
} from './rules.ts';

/* ─────────────────────────────── tipler ─────────────────────────────── */

export type Occupation =
  | 'RULER'
  | 'LORD'
  | 'LADY'
  | 'CLAN_LEADER'
  | 'WANDERER'
  | 'NOTABLE'
  | 'MERCHANT'
  | 'GANG_LEADER'
  | 'HEADMAN';

export type HeroStatus =
  | 'AT_SETTLEMENT'
  | 'TRAVELING'
  | 'IN_ARMY'
  | 'IN_BATTLE'
  | 'PRISONER'
  | 'DEAD';

/** Bannerlord'daki "Last seen at X, N days ago" bilgisi. */
export interface LastSeen {
  settlementId: string;
  settlementName: string;
  day: number;
  status: HeroStatus;
  /** Oyuncu o yerleşime girdiğinde tazelenir ("dedikodu" mantığı). */
  fresh?: boolean;
}

/** Kişilik özellikleri — Bannerlord'da -2..+2 aralığında. */
export interface HeroTraits {
  valor: number;
  honor: number;
  generosity: number;
  mercy: number;
}

export interface HeroFamily {
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  childrenIds: string[];
}

export interface HeroRecord {
  id: string;
  name: string;
  title: string;
  occupation: Occupation;
  culture: FactionId;
  clanId: string;
  clanName: string;
  kingdomId: string | null;
  kingdomName: string;

  /** Kampanya günü cinsinden doğum (negatif = başlangıçtan önce). */
  birthDay: number;
  relation: number;

  skills: Partial<Record<BannerlordSkillId, { level: number; focus: number }>>;
  traits: HeroTraits;
  family: HeroFamily;

  lastSeen: LastSeen;
  status: HeroStatus;
  prisonerOf?: string;

  bannerColor: string;
  bio: string;

  /** Orta yol fog: yaş + beceriler yalnızca tanışınca görünür. */
  revealed: boolean;
}

export interface HeroRegistry {
  version: number;
  day: number;
  heroes: Record<string, HeroRecord>;
}

export const HERO_REGISTRY_VERSION = 1;

/** Beceri listesi — `BannerlordSkillId` ile birebir. */
export const SKILL_ORDER: BannerlordSkillId[] = [
  'oneHanded', 'twoHanded', 'polearm', 'bow', 'crossbow', 'throwing',
  'riding', 'athletics', 'smithing', 'scouting', 'tactics', 'roguery',
  'charm', 'leadership', 'trade', 'steward', 'medicine', 'engineering',
];

export const OCCUPATION_LABELS: Record<Occupation, string> = {
  RULER: 'Hükümdar',
  LORD: 'Lord',
  LADY: 'Leydi',
  CLAN_LEADER: 'Klan Lideri',
  WANDERER: 'Gezgin',
  NOTABLE: 'Önemli Kişi',
  MERCHANT: 'Tüccar',
  GANG_LEADER: 'Haydut Reisi',
  HEADMAN: 'Köy Muhtarı',
};

export const STATUS_LABELS: Record<HeroStatus, string> = {
  AT_SETTLEMENT: 'Yerleşimde',
  TRAVELING: 'Yolda',
  IN_ARMY: 'Orduda',
  IN_BATTLE: 'Savaşta',
  PRISONER: 'Esir',
  DEAD: 'Ölü',
};

/* ─────────────────────────── deterministik yardımcılar ─────────────────────────── */

/** FNV-1a — aynı id her zaman aynı sayıyı üretir. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** hash'ten [min, max] aralığında tam sayı. */
function pick(seed: number, salt: string, min: number, max: number): number {
  const h = hash32(`${seed}:${salt}`);
  return min + (h % (max - min + 1));
}

/* ─────────────────────────── türetme kuralları ─────────────────────────── */

const RULER_TITLES = new Set([
  'İmparatoriçe', 'İmparator', 'Kral', 'Kraliçe', 'Yüksek Kral',
  'Kağan', 'Sultan', 'Büyük Prens', 'Prens',
]);
const LADY_TITLES = new Set(['Leydi', 'Hatun', 'Prenses', 'Kontes', 'Senatris', 'Kâhin', 'Boyarina']);

export function deriveOccupation(lord: LordAgent): Occupation {
  if (lord.faction === 'bandits') return 'GANG_LEADER';
  if (RULER_TITLES.has(lord.title)) return 'RULER';
  if (LADY_TITLES.has(lord.title)) return 'LADY';
  return 'LORD';
}

/** Klan adı: klan id'sinden okunabilir bir isim üretir. */
const CLAN_STEMS = [
  'Demirtaç', 'Gümüşyay', 'Kartalpençe', 'Bozkurt', 'Alşahin', 'Karadağ',
  'Aybora', 'Tuğrul', 'Sırmaok', 'Erguvan', 'Yelkovan', 'Sarpkalkan',
];

export function deriveClan(lord: LordAgent, index: number): { clanId: string; clanName: string } {
  // Aynı krallıktaki lordlar 2-3 klana dağılır (Bannerlord'daki gibi).
  const slot = index % 3;
  const clanId = `clan-${lord.faction}-${slot}`;
  const stem = CLAN_STEMS[(hash32(lord.faction) + slot) % CLAN_STEMS.length];
  return { clanId, clanName: `${stem} Hanedanı` };
}

export function deriveBirthDay(lordId: string, day: number, occupation: Occupation): number {
  // Hükümdarlar biraz daha olgun; diğerleri 18-58 arası.
  const age = occupation === 'RULER'
    ? pick(hash32(lordId), 'age', 32, 62)
    : pick(hash32(lordId), 'age', 18, 58);
  // Doğum günü kampanya başlangıcına göre negatif tutulur; yaş zamanla artar.
  return day - age * 365 - (hash32(lordId) % 365);
}

export function ageOf(hero: HeroRecord, day: number): number {
  return Math.max(0, Math.floor((day - hero.birthDay) / 365));
}

export function deriveSkills(heroId: string, occupation: Occupation) {
  const seed = hash32(heroId);
  const bonus = occupation === 'RULER' ? 40 : occupation === 'GANG_LEADER' ? 10 : 0;
  const out: HeroRecord['skills'] = {};
  SKILL_ORDER.forEach((skill, i) => {
    const base = pick(seed, `skill:${skill}`, 25, 140) + bonus;
    const level = Math.min(300, base - (i % 3) * 5);
    out[skill] = { level, focus: pick(seed, `focus:${skill}`, 1, 5) };
  });
  return out;
}

export function deriveTraits(heroId: string): HeroTraits {
  const seed = hash32(heroId);
  const t = (salt: string) => pick(seed, salt, -2, 2);
  return { valor: t('valor'), honor: t('honor'), generosity: t('generosity'), mercy: t('mercy') };
}

/** En yakın yerleşimi bulur (lord konumundan). */
export function nearestSettlement(
  settlements: Settlement[],
  x: number,
  z: number,
): Settlement | null {
  let best: Settlement | null = null;
  let bestD = Infinity;
  for (const s of settlements) {
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/** `currentAction` metninden durum çıkarımı (Bannerlord'un "orduda/esir" satırı). */
export function deriveStatus(lord: LordAgent, nearestDist: number): HeroStatus {
  const a = lord.currentAction.toLocaleLowerCase('tr');
  if (a.includes('esir')) return 'PRISONER';
  if (a.includes('kuşatma') || a.includes('çarpışma') || a.includes('savaş')) return 'IN_BATTLE';
  if (a.includes('ordu') || a.includes('komuta')) return 'IN_ARMY';
  if (nearestDist <= 6) return 'AT_SETTLEMENT';
  return 'TRAVELING';
}

/* ─────────────────────────── kayıt üretimi ─────────────────────────── */

export function heroFromLord(
  lord: LordAgent,
  index: number,
  campaign: Pick<CampaignState, 'day' | 'settlements'>,
  factionNames: Record<string, string>,
): HeroRecord {
  const occupation = deriveOccupation(lord);
  const { clanId, clanName } = deriveClan(lord, index);
  const near = nearestSettlement(campaign.settlements, lord.x, lord.z);
  const nearDist = near ? Math.hypot(near.x - lord.x, near.z - lord.z) : Infinity;
  const status = deriveStatus(lord, nearDist);

  return {
    id: lord.id,
    name: lord.name,
    title: lord.title,
    occupation,
    culture: lord.faction,
    clanId,
    clanName,
    kingdomId: lord.faction === 'bandits' ? null : lord.faction,
    kingdomName: factionNames[lord.faction] ?? lord.faction,
    birthDay: deriveBirthDay(lord.id, campaign.day, occupation),
    relation: lord.relation,
    skills: deriveSkills(lord.id, occupation),
    traits: deriveTraits(lord.id),
    family: { childrenIds: [] }, // Faz 3: aile ağacı içerikle doldurulacak
    lastSeen: {
      settlementId: near?.id ?? '',
      settlementName: near?.name ?? 'Bilinmiyor',
      day: campaign.day,
      status,
    },
    status,
    bannerColor: lord.bannerColor,
    bio: lord.personality,
    revealed: false,
  };
}

/**
 * Kampanyadaki tüm lordlar için ansiklopedi kayıtlarını üretir.
 * `factionNames` = FACTION_INFO'dan gelen { id: name } tablosu.
 */
export function buildHeroRegistry(
  campaign: Pick<CampaignState, 'day' | 'settlements' | 'lords'>,
  factionNames: Record<string, string>,
): HeroRegistry {
  const heroes: Record<string, HeroRecord> = {};
  campaign.lords.forEach((lord, i) => {
    heroes[lord.id] = heroFromLord(lord, i, campaign, factionNames);
  });
  return { version: HERO_REGISTRY_VERSION, day: campaign.day, heroes };
}

/* ─────────────────────────── fog of war ─────────────────────────── */

/** Kahramanla tanışıldı olarak işaretler (yaş + beceriler açılır). */
export function revealHero(registry: HeroRegistry, heroId: string): HeroRegistry {
  const hero = registry.heroes[heroId];
  if (!hero || hero.revealed) return registry;
  return {
    ...registry,
    heroes: { ...registry.heroes, [heroId]: { ...hero, revealed: true } },
  };
}

/** Orta yol fog: gizli bilgileri `null` olarak döndürür. */
export function visibleHeroInfo(hero: HeroRecord, day: number) {
  return {
    age: hero.revealed ? ageOf(hero, day) : null,
    skills: hero.revealed ? hero.skills : null,
  };
}

/* ─────────────────────────── metin yardımcıları ─────────────────────────── */

/**
 * Türkçe bulunma hâli eki ("Lycaron'da", "Chanos'ta", "Marunath'ta").
 * Tek sözcüklü özel adlarda ünlü uyumu + ünsüz sertleşmesi uygulanır.
 * Çok sözcüklü adlarda ("Tubilis Köyü") iyelik eki belirsiz olduğu için
 * güvenli biçim kullanılır: "… yerleşiminde".
 */
export function locative(name: string): string {
  if (name.includes(' ')) return `${name} yerleşiminde`;
  const vowels = 'aeıioöuü';
  const lower = name.toLocaleLowerCase('tr');
  let lastVowel = 'a';
  for (let i = lower.length - 1; i >= 0; i--) {
    if (vowels.includes(lower[i])) { lastVowel = lower[i]; break; }
  }
  const back = 'aıou'.includes(lastVowel);
  const lastChar = lower[lower.length - 1] ?? '';
  const voiceless = 'pçtkfhsş'.includes(lastChar);
  const suffix = `${voiceless ? 't' : 'd'}${back ? 'a' : 'e'}`;
  return `${name}'${suffix}`;
}

/** "Lycaron'da, 5 gün önce" — Bannerlord'un "Last seen at X, N days ago" satırı. */
export function lastSeenLabel(hero: HeroRecord, day: number): string {
  const days = Math.max(0, day - hero.lastSeen.day);
  const place = locative(hero.lastSeen.settlementName);
  if (days === 0) return `${place} bugün görüldü`;
  if (days === 1) return `${place} dün görüldü`;
  return `${place}, ${days} gün önce görüldü`;
}

/** Arama: ad + unvan + klan + krallık üzerinden basit eşleşme. */
export function searchHeroes(registry: HeroRegistry, query: string): HeroRecord[] {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return Object.values(registry.heroes);
  return Object.values(registry.heroes).filter((h) =>
    `${h.name} ${h.title} ${h.clanName} ${h.kingdomName}`
      .toLocaleLowerCase('tr')
      .includes(q),
  );
}
