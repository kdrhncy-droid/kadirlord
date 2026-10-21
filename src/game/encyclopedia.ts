/**
 * encyclopedia.ts — Ansiklopedi gezinme, dizin ve arama mantığı (Faz 1a)
 *
 * Bu modül **React ve Three.js içermez**: tarayıcısız test edilebilir.
 * Arayüz (EncyclopediaModal) yalnızca buradaki saf fonksiyonları kullanır.
 *
 * Bannerlord karşılığı:
 *  - Ana sayfa kart karuseli (Home)
 *  - Section listeleri (Heroes / Clans / Kingdoms / Settlements / Concepts)
 *  - Detay sayfaları + breadcrumb ("Home / Heroes / Hap the Hyena")
 *  - Arama kutusu (sağ üst)
 */
import type { CampaignState, FactionId, Settlement } from './rules.ts';
import {
  ageOf,
  buildHeroRegistry,
  type HeroRecord,
  type Occupation,
} from './heroes.ts';

/* ─────────────────────────── rotalar ─────────────────────────── */

export type EncyclopediaSection =
  | 'HOME'
  | 'HEROES'
  | 'HERO'
  | 'CLANS'
  | 'CLAN'
  | 'KINGDOMS'
  | 'KINGDOM'
  | 'SETTLEMENTS'
  | 'SETTLEMENT'
  | 'CONCEPTS';

export interface EncyclopediaRoute {
  section: EncyclopediaSection;
  id?: string;
}

export const HOME_ROUTE: EncyclopediaRoute = { section: 'HOME' };

export function routeKey(route: EncyclopediaRoute): string {
  return route.id ? `${route.section}:${route.id}` : route.section;
}

export function isSameRoute(a: EncyclopediaRoute, b: EncyclopediaRoute): boolean {
  return routeKey(a) === routeKey(b);
}

/* ─────────────────────────── gezinme yığını ─────────────────────────── */

export interface NavState {
  stack: EncyclopediaRoute[];
}

export function createNav(initial: EncyclopediaRoute = HOME_ROUTE): NavState {
  return { stack: [initial] };
}

export function currentRoute(nav: NavState): EncyclopediaRoute {
  return nav.stack[nav.stack.length - 1] ?? HOME_ROUTE;
}

/**
 * Yeni sayfaya gider. Aynı sayfa tekrar açılırsa yığın büyümez.
 * Liste sayfasından (ör. HEROES) detay sayfasına geçişte liste korunur.
 */
export function pushRoute(nav: NavState, route: EncyclopediaRoute): NavState {
  const current = currentRoute(nav);
  if (isSameRoute(current, route)) return nav;
  // Liste sayfası zaten yığında varsa, detaya girerken tekrar eklenmez.
  return { stack: [...nav.stack, route] };
}

/** Bir sayfa geri gider; ilk sayfadayken yığın boşalmaz. */
export function goBack(nav: NavState): NavState {
  if (nav.stack.length <= 1) return nav;
  return { stack: nav.stack.slice(0, -1) };
}

export function canGoBack(nav: NavState): boolean {
  return nav.stack.length > 1;
}

/** Doğrudan bir rotaya git (liste → detay → başka detay gibi durumlarda). */
export function jumpTo(nav: NavState, route: EncyclopediaRoute): NavState {
  const current = currentRoute(nav);
  if (isSameRoute(current, route)) return nav;
  // Aynı bölümün detayından başka bir detaya geçerken yığını şişirmeyelim.
  if (current.section === route.section) {
    return { stack: [...nav.stack.slice(0, -1), route] };
  }
  return pushRoute(nav, route);
}

/* ─────────────────────────── dizin (index) ─────────────────────────── */

export interface ClanSummary {
  id: string;
  name: string;
  kingdomId: string | null;
  kingdomName: string;
  bannerColor: string;
  leaderId: string | null;
  memberIds: string[];
  fiefCount: number;
}

export interface KingdomSummary {
  id: string;
  name: string;
  culture: FactionId;
  rulerId: string | null;
  rulerName: string;
  clanIds: string[];
  memberIds: string[];
  fiefCount: number;
  atWarWithPlayer: boolean;
  /** Kaba güç göstergesi: üyelerin asker toplamı yok → lord sayısı. */
  strength: number;
}

export interface EncyclopediaIndex {
  day: number;
  heroes: HeroRecord[];
  heroById: Record<string, HeroRecord>;
  clans: ClanSummary[];
  clanById: Record<string, ClanSummary>;
  kingdoms: KingdomSummary[];
  kingdomById: Record<string, KingdomSummary>;
  settlements: Settlement[];
  settlementById: Record<string, Settlement>;
}

/**
 * Kampanyadan ansiklopedi dizinini üretir.
 * `factionNames` = { factionId: 'Krallık Adı' } (FACTION_INFO'dan).
 */
export function buildEncyclopediaIndex(
  campaign: Pick<CampaignState, 'day' | 'settlements' | 'lords'>,
  factionNames: Record<string, string>,
  /** Oyuncunun tanıştığı kahramanlar (orta yol fog of war). */
  revealedIds: readonly string[] = [],
): EncyclopediaIndex {
  const registry = buildHeroRegistry(campaign, factionNames);
  const revealed = new Set(revealedIds);
  const heroes = Object.values(registry.heroes).map((h) =>
    h.revealed || revealed.has(h.id) ? { ...h, revealed: true } : h,
  );

  const heroById: Record<string, HeroRecord> = {};
  for (const h of heroes) heroById[h.id] = h;

  // Fief sayıları: yerleşimlerin bağlı olduğu krallık (faction) üzerinden.
  const fiefCountByFaction: Record<string, number> = {};
  for (const s of campaign.settlements) {
    fiefCountByFaction[s.faction] = (fiefCountByFaction[s.faction] ?? 0) + 1;
  }

  /* ── klanlar ── */
  const clanById: Record<string, ClanSummary> = {};
  for (const h of heroes) {
    let clan = clanById[h.clanId];
    if (!clan) {
      clan = {
        id: h.clanId,
        name: h.clanName,
        kingdomId: h.kingdomId,
        kingdomName: h.kingdomName,
        bannerColor: h.bannerColor,
        leaderId: null,
        memberIds: [],
        fiefCount: h.kingdomId ? Math.round((fiefCountByFaction[h.kingdomId] ?? 0) / 3) : 0,
      };
      clanById[h.clanId] = clan;
    }
    clan.memberIds.push(h.id);
    if (!clan.leaderId || h.occupation === 'RULER') clan.leaderId = h.id;
  }

  /* ── krallıklar ── */
  const kingdomById: Record<string, KingdomSummary> = {};
  for (const h of heroes) {
    if (!h.kingdomId) continue;
    let k = kingdomById[h.kingdomId];
    if (!k) {
      k = {
        id: h.kingdomId,
        name: h.kingdomName,
        culture: h.culture,
        rulerId: null,
        rulerName: '—',
        clanIds: [],
        memberIds: [],
        fiefCount: fiefCountByFaction[h.kingdomId] ?? 0,
        atWarWithPlayer: false,
        strength: 0,
      };
      kingdomById[h.kingdomId] = k;
    }
    k.memberIds.push(h.id);
    k.strength += 1;
    if (h.atWarWithPlayer) k.atWarWithPlayer = true;
    if (!k.clanIds.includes(h.clanId)) k.clanIds.push(h.clanId);
    if (!k.rulerId || h.occupation === 'RULER') {
      k.rulerId = h.id;
      k.rulerName = h.name;
    }
  }

  return {
    day: campaign.day,
    heroes,
    heroById,
    clans: Object.values(clanById).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    clanById,
    kingdoms: Object.values(kingdomById).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    kingdomById,
    settlements: campaign.settlements,
    settlementById: Object.fromEntries(campaign.settlements.map((s) => [s.id, s])),
  };
}

/* ─────────────────────────── varlık yardımcıları ─────────────────────────── */

export const SETTLEMENT_TYPE_LABELS: Record<Settlement['type'], string> = {
  TOWN: 'Şehir',
  CASTLE: 'Kale',
  VILLAGE: 'Köy',
};

/** Krallığa bağlı klanlar (alfabetik). */
export function kingdomClans(index: EncyclopediaIndex, kingdomId: string): ClanSummary[] {
  return index.clans.filter((c) => c.kingdomId === kingdomId);
}

/** Krallığın lordları — hükümdar en başta. */
export function kingdomMembers(index: EncyclopediaIndex, kingdomId: string): HeroRecord[] {
  const list = index.heroes.filter((h) => h.kingdomId === kingdomId);
  return list.sort((a, b) => {
    if (a.occupation === 'RULER' && b.occupation !== 'RULER') return -1;
    if (b.occupation === 'RULER' && a.occupation !== 'RULER') return 1;
    return a.name.localeCompare(b.name, 'tr');
  });
}

/** Krallığın toprakları: şehir → kale → köy, sonra isim. */
export function kingdomFiefs(index: EncyclopediaIndex, faction: string): Settlement[] {
  const order: Record<Settlement['type'], number> = { TOWN: 0, CASTLE: 1, VILLAGE: 2 };
  return index.settlements
    .filter((s) => s.faction === faction)
    .sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name, 'tr'));
}

/** Klanın üyeleri — lider en başta. */
export function clanMembers(index: EncyclopediaIndex, clanId: string): HeroRecord[] {
  const clan = index.clanById[clanId];
  const list = index.heroes.filter((h) => h.clanId === clanId);
  return list.sort((a, b) => {
    if (clan?.leaderId === a.id) return -1;
    if (clan?.leaderId === b.id) return 1;
    return a.name.localeCompare(b.name, 'tr');
  });
}

/** Bir yerleşimde son görülen kahramanlar. */
export function settlementHeroes(index: EncyclopediaIndex, settlementId: string): HeroRecord[] {
  return index.heroes
    .filter((h) => h.lastSeen.settlementId === settlementId)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/** Yerleşimin bağlı olduğu krallık kaydı (haydut/bağımsız ise null). */
export function settlementKingdom(
  index: EncyclopediaIndex,
  settlement: Settlement,
): KingdomSummary | null {
  return index.kingdomById[settlement.faction] ?? null;
}

/** Oyuncuyla savaşta olan krallıklar. */
/* ─────────────────────────── Faz 2: entity ilişkileri ─────────────────────────── */

/**
 * Kahramanın **yakınları**: aynı klandaki diğer üyeler (lider ilk).
 * Ansiklopedi "Aile & Yakınlar" bölümü bunu kullanır.
 */
export function heroKin(index: EncyclopediaIndex, hero: HeroRecord): HeroRecord[] {
  return clanMembers(index, hero.clanId).filter((h) => h.id !== hero.id);
}

/**
 * Kahramanın **rakipleri**: ilişkisi negatif olan ve aynı krallıkta ya da
 * sınır komşusu krallıkta bulunan kahramanlar. En düşük ilişki önce.
 */
export function heroRivals(index: EncyclopediaIndex, hero: HeroRecord, limit = 4): HeroRecord[] {
  return index.heroes
    .filter((h) => h.id !== hero.id && h.relation < 0)
    .sort((a, b) => a.relation - b.relation)
    .slice(0, limit);
}

/**
 * Kahramanın **müttefikleri**: ilişkisi pozitif olanlar (en yüksek önce).
 */
export function heroAllies(index: EncyclopediaIndex, hero: HeroRecord, limit = 4): HeroRecord[] {
  return index.heroes
    .filter((h) => h.id !== hero.id && h.relation > 0)
    .sort((a, b) => b.relation - a.relation)
    .slice(0, limit);
}

export interface KingdomDiplomacy {
  /** Oyuncuyla savaşta mı? */
  atWarWithPlayer: boolean;
  /**
   * Oyuncuyla savaş hâlindeki **diğer** krallıklar.
   * Not: kampanya modeli krallıklar arası savaşı tutmuyor; uydurma veri
   * göstermemek için burada yalnız gerçek (oyuncuya karşı) savaşlar listelenir.
   */
  atWarWith: KingdomSummary[];
  /** Aynı kültürden krallıklar (kültürel yakınlık). */
  sameCulture: KingdomSummary[];
  totalFiefs: number;
  totalMembers: number;
}

/**
 * Krallık diplomatik durumu. Kampanya modelinde savaş yalnız oyuncuya karşı
 * tutulduğu için krallıklar arası savaş **kültür + oyuncu savaşı** üzerinden
 * türetilir; ileride gerçek diplomasi matrisi geldiğinde burası genişler.
 */
export function kingdomDiplomacy(
  index: EncyclopediaIndex,
  kingdom: KingdomSummary,
): KingdomDiplomacy {
  const others = index.kingdoms.filter((k) => k.id !== kingdom.id);
  return {
    atWarWithPlayer: kingdom.atWarWithPlayer,
    atWarWith: others.filter((k) => k.atWarWithPlayer),
    sameCulture: others.filter((k) => k.culture === kingdom.culture),
    totalFiefs: kingdom.fiefCount,
    totalMembers: kingdom.memberIds.length,
  };
}

/** Esir durumu: kimin esiri, kaç gündür. */
export function prisonerInfo(
  index: EncyclopediaIndex,
  hero: HeroRecord,
): { isPrisoner: boolean; captorName: string | null; daysHeld: number } {
  if (hero.status !== 'PRISONER' || !hero.prisonerOf) {
    return { isPrisoner: false, captorName: null, daysHeld: 0 };
  }
  const captor = index.heroById[hero.prisonerOf];
  return {
    isPrisoner: true,
    captorName: captor?.name ?? 'Bilinmeyen',
    daysHeld: Math.max(0, index.day - hero.lastSeen.day),
  };
}

export function warringKingdoms(index: EncyclopediaIndex): KingdomSummary[] {
  return index.kingdoms.filter((k) => k.atWarWithPlayer);
}

/* ─────────────────────────── arama ─────────────────────────── */

export type SearchKind = 'HERO' | 'CLAN' | 'KINGDOM' | 'SETTLEMENT';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  route: EncyclopediaRoute;
}

const KIND_LABEL: Record<SearchKind, string> = {
  HERO: 'Kahraman',
  CLAN: 'Klan',
  KINGDOM: 'Krallık',
  SETTLEMENT: 'Yerleşim',
};

export function searchKindLabel(kind: SearchKind): string {
  return KIND_LABEL[kind];
}

/** Ad + unvan + klan + krallık üzerinden arama; tür sırasına göre gruplu. */
export function searchEncyclopedia(
  index: EncyclopediaIndex,
  query: string,
  limit = 14,
): SearchHit[] {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return [];

  const hits: SearchHit[] = [];

  for (const h of index.heroes) {
    const hay = `${h.name} ${h.title} ${h.clanName} ${h.kingdomName}`.toLocaleLowerCase('tr');
    if (hay.includes(q)) {
      hits.push({
        kind: 'HERO',
        id: h.id,
        title: h.name,
        subtitle: `${h.title} · ${h.kingdomName}`,
        route: { section: 'HERO', id: h.id },
      });
    }
  }
  for (const k of index.kingdoms) {
    if (k.name.toLocaleLowerCase('tr').includes(q)) {
      hits.push({
        kind: 'KINGDOM',
        id: k.id,
        title: k.name,
        subtitle: `${k.memberIds.length} lord · ${k.clanIds.length} klan`,
        route: { section: 'KINGDOM', id: k.id },
      });
    }
  }
  for (const c of index.clans) {
    if (c.name.toLocaleLowerCase('tr').includes(q)) {
      hits.push({
        kind: 'CLAN',
        id: c.id,
        title: c.name,
        subtitle: `${c.kingdomName} · ${c.memberIds.length} üye`,
        route: { section: 'CLAN', id: c.id },
      });
    }
  }
  for (const s of index.settlements) {
    if (s.name.toLocaleLowerCase('tr').includes(q)) {
      hits.push({
        kind: 'SETTLEMENT',
        id: s.id,
        title: s.name,
        subtitle: s.type === 'TOWN' ? 'Şehir' : s.type === 'CASTLE' ? 'Kale' : 'Köy',
        route: { section: 'SETTLEMENT', id: s.id },
      });
    }
  }

  return hits.slice(0, limit);
}

/* ─────────────────────────── filtre & sıralama ─────────────────────────── */

export type HeroSort = 'NAME' | 'AGE' | 'RELATION' | 'LAST_SEEN' | 'STATUS';

export interface HeroFilter {
  query?: string;
  occupation?: Occupation | 'ALL';
  kingdomId?: string | 'ALL';
  sort?: HeroSort;
}

export const HERO_SORTS: { id: HeroSort; label: string }[] = [
  { id: 'NAME', label: 'İsim' },
  { id: 'AGE', label: 'Yaş' },
  { id: 'RELATION', label: 'İlişki' },
  { id: 'LAST_SEEN', label: 'Son görülme' },
  { id: 'STATUS', label: 'Durum' },
];

export const OCCUPATION_FILTERS: { id: Occupation | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'RULER', label: 'Hükümdar' },
  { id: 'LORD', label: 'Lord' },
  { id: 'LADY', label: 'Leydi' },
  { id: 'GANG_LEADER', label: 'Haydut Reisi' },
];

export function filterHeroes(index: EncyclopediaIndex, filter: HeroFilter = {}): HeroRecord[] {
  const q = (filter.query ?? '').trim().toLocaleLowerCase('tr');
  const list = index.heroes.filter((h) => {
    if (filter.occupation && filter.occupation !== 'ALL' && h.occupation !== filter.occupation) return false;
    if (filter.kingdomId && filter.kingdomId !== 'ALL' && h.kingdomId !== filter.kingdomId) return false;
    if (q) {
      const hay = `${h.name} ${h.title} ${h.clanName}`.toLocaleLowerCase('tr');
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sort = filter.sort ?? 'NAME';
  const cmp: Record<HeroSort, (a: HeroRecord, b: HeroRecord) => number> = {
    NAME: (a, b) => a.name.localeCompare(b.name, 'tr'),
    AGE: (a, b) => ageOf(a, index.day) - ageOf(b, index.day),
    RELATION: (a, b) => b.relation - a.relation,
    LAST_SEEN: (a, b) => b.lastSeen.day - a.lastSeen.day,
    STATUS: (a, b) => a.status.localeCompare(b.status),
  };
  return [...list].sort(cmp[sort]);
}

/* ─────────────────────────── breadcrumb & başlık ─────────────────────────── */

const SECTION_LABELS: Record<EncyclopediaSection, string> = {
  HOME: 'Ansiklopedi',
  HEROES: 'Kahramanlar',
  HERO: 'Kahraman',
  CLANS: 'Klanlar',
  CLAN: 'Klan',
  KINGDOMS: 'Krallıklar',
  KINGDOM: 'Krallık',
  SETTLEMENTS: 'Yerleşimler',
  SETTLEMENT: 'Yerleşim',
  CONCEPTS: 'Kavramlar',
};

export function sectionLabel(section: EncyclopediaSection): string {
  return SECTION_LABELS[section];
}

export function routeTitle(route: EncyclopediaRoute, index: EncyclopediaIndex): string {
  if (route.section === 'HERO') return index.heroById[route.id ?? '']?.name ?? 'Kahraman';
  if (route.section === 'CLAN') return index.clanById[route.id ?? '']?.name ?? 'Klan';
  if (route.section === 'KINGDOM') return index.kingdomById[route.id ?? '']?.name ?? 'Krallık';
  if (route.section === 'SETTLEMENT') return index.settlementById[route.id ?? '']?.name ?? 'Yerleşim';
  return SECTION_LABELS[route.section];
}

/**
 * Breadcrumb: liste sayfaları da yığında görünür.
 * Örn: Ansiklopedi / Kahramanlar / Hap the Hyena
 */
export function breadcrumb(
  nav: NavState,
  index: EncyclopediaIndex,
): { label: string; route: EncyclopediaRoute }[] {
  const crumbs: { label: string; route: EncyclopediaRoute }[] = [];
  nav.stack.forEach((route, i) => {
    // Aynı etiketi arka arkaya ekleme (ör. HEROES → HERO aynı isimde olabilir)
    const label = routeTitle(route, index);
    if (i > 0 && crumbs[crumbs.length - 1]?.label === label) return;
    crumbs.push({ label, route });
  });
  return crumbs;
}
