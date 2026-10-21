import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FACTION_INFO, type CampaignState } from '../../game/rules';
import {
  HERO_SORTS,
  OCCUPATION_FILTERS,
  breadcrumb,
  buildEncyclopediaIndex,
  canGoBack,
  createNav,
  currentRoute,
  filterHeroes,
  goBack,
  jumpTo,
  pushRoute,
  routeKey,
  searchEncyclopedia,
  type EncyclopediaRoute,
  type HeroSort,
  type NavState,
  heroKin,
  heroAllies,
  heroRivals,
  prisonerInfo,
} from '../../game/encyclopedia';
import { familyView, hasFamily } from '../../game/familyTree';
import {
  OCCUPATION_LABELS,
  STATUS_LABELS,
  ageOf,
  lastSeenLabel,
  visibleHeroInfo,
  type HeroRecord,
  type Occupation,
} from '../../game/heroes';
import { Chip, InfoCell, LinkCard, occupationColor } from './parts';
import { SectionIcon, type SectionGlyph } from './icons';
import { HeroPortrait } from './HeroPortrait';
import {
  ClanDetailPage,
  ClanListPage,
  ConceptsPage,
  KingdomDetailPage,
  KingdomListPage,
  SettlementDetailPage,
  SettlementListPage,
} from './pages';

interface EncyclopediaModalProps {
  campaign: CampaignState;
  /** Doğrudan bir sayfada açmak için (derin bağlantı). */
  initialRoute?: EncyclopediaRoute;
  /** Oyuncunun tanıştığı kahraman id'leri (fog of war). */
  revealedHeroIds?: readonly string[];
  onMeetHero?: (heroId: string) => void;
  onClose: () => void;
}

const CARD_DEFS: {
  section: SectionGlyph;
  title: string;
  art: string;
  desc: string;
}[] = [
  { section: 'HEROES', title: 'Kahramanlar', art: 'from-[#3b2a16] via-[#241a0f] to-[#120f0b]', desc: 'Lordlar, leydiler, krallar' },
  { section: 'KINGDOMS', title: 'Krallıklar', art: 'from-[#3b1d1d] via-[#241010] to-[#120f0b]', desc: 'Hanedanlar ve savaşlar' },
  { section: 'CLANS', title: 'Klanlar', art: 'from-[#1d2f3b] via-[#101d24] to-[#120f0b]', desc: 'Hanedan bağları' },
  { section: 'SETTLEMENTS', title: 'Yerleşimler', art: 'from-[#1f3320] via-[#12200f] to-[#120f0b]', desc: 'Şehirler, kaleler, köyler' },
  { section: 'CONCEPTS', title: 'Kavramlar', art: 'from-[#2b2b3b] via-[#1a1a24] to-[#120f0b]', desc: 'Sözlük ve terimler' },
];

export const EncyclopediaModal: React.FC<EncyclopediaModalProps> = ({
  campaign,
  initialRoute,
  revealedHeroIds = [],
  onMeetHero,
  onClose,
}) => {
  const [nav, setNav] = useState<NavState>(() => createNav(initialRoute));
  const [query, setQuery] = useState('');
  const [occupation, setOccupation] = useState<Occupation | 'ALL'>('ALL');
  const [kingdomId, setKingdomId] = useState<string | 'ALL'>('ALL');
  const [sort, setSort] = useState<HeroSort>('NAME');
  const searchRef = useRef<HTMLInputElement | null>(null);

  const factionNames = useMemo(
    () => Object.fromEntries(Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name])),
    [],
  );

  const index = useMemo(
    () => buildEncyclopediaIndex(campaign, factionNames, revealedHeroIds),
    [campaign, factionNames, revealedHeroIds],
  );

  // Klavye dinleyicisi güncel yığını görsün (state updater içinde yan etki olmasın).
  const navRef = useRef<NavState>(nav);
  navRef.current = nav;

  const route = currentRoute(nav);
  const crumbs = breadcrumb(nav, index);
  const hits = useMemo(() => searchEncyclopedia(index, query), [index, query]);

  /* ── klavye: Esc geri/kapat, N kapat, / arama ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (canGoBack(navRef.current)) {
          setNav(goBack(navRef.current));
        } else {
          onClose();
        }
        return;
      }
      if (e.code === 'KeyN') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (next: EncyclopediaRoute) => {
    setNav((prev) => jumpTo(prev, next));
    setQuery('');
  };

  /* ─────────────────────────── parçalar ─────────────────────────── */

  const header = (
    <div className="relative flex items-center justify-between px-5 py-3 border-b border-[#c6a15b]/35">
      <div className="flex items-center gap-2 w-1/3">
        {canGoBack(nav) && (
          <button
            type="button"
            onClick={() => setNav((prev) => goBack(prev))}
            className="px-2 py-1 rounded border border-[#c6a15b]/40 text-[#c6a15b] hover:text-[#fbbf24] hover:border-[#fbbf24]/60 text-xs"
            title="Geri (Esc)"
          >
            ‹ Geri
          </button>
        )}
        <nav className="flex items-center gap-1 text-[11px] text-[#a89b84] truncate">
          {crumbs.map((c, i) => (
            <React.Fragment key={`${routeKey(c.route)}-${i}`}>
              {i > 0 && <span className="text-[#5c5142]">/</span>}
              <button
                type="button"
                onClick={() => setNav((prev) => jumpTo(prev, c.route))}
                className={`truncate hover:text-[#fbbf24] ${
                  i === crumbs.length - 1 ? 'text-[#e2d6c1] font-semibold' : ''
                }`}
              >
                {c.label}
              </button>
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 px-6 py-1 rounded-b-md border border-t-0 border-[#c6a15b]/50 bg-gradient-to-b from-[#2a2015] to-[#140f09] shadow-lg">
        <span className="font-display text-[13px] tracking-[0.25em] text-[#f8f0df] uppercase">
          Ansiklopedi
        </span>
      </div>

      <div className="flex items-center gap-2 w-1/3 justify-end">
        <div className="relative">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ara…  ( / )"
            className="w-52 bg-[#0d0b08] border border-[#c6a15b]/40 rounded px-2.5 py-1 text-xs text-[#e2d6c1] placeholder:text-[#8b8072] outline-none focus:border-[#fbbf24]/70"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#8b8072] hover:text-[#e2d6c1] text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded border border-[#c6a15b]/40 text-[#c6a15b] hover:text-[#fbbf24] hover:border-[#fbbf24]/60 text-sm leading-none"
          title="Kapat (N / Esc)"
        >
          ✕
        </button>
      </div>
    </div>
  );

  const searchPanel = query.trim() ? (
    <div className="absolute inset-x-4 top-[64px] z-20 max-h-[60%] overflow-y-auto rounded border border-[#c6a15b]/50 bg-[#0f0c09]/98 shadow-2xl">
      {hits.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[#a2957f]">Sonuç bulunamadı.</div>
      ) : (
        hits.map((hit) => (
          <button
            key={`${hit.kind}:${hit.id}`}
            type="button"
            onClick={() => go(hit.route)}
            className="w-full flex items-center justify-between gap-3 px-4 py-2 border-b border-[#c6a15b]/15 hover:bg-[#c6a15b]/10 text-left"
          >
            <span className="min-w-0">
              <span className="block text-xs text-[#f8f0df] truncate">{hit.title}</span>
              <span className="block text-[10px] text-[#a2957f] truncate">{hit.subtitle}</span>
            </span>
            <span className="shrink-0 text-[9px] uppercase tracking-wider text-[#c6a15b]/80">
              {hit.kind === 'HERO'
                ? 'Kahraman'
                : hit.kind === 'CLAN'
                  ? 'Klan'
                  : hit.kind === 'KINGDOM'
                    ? 'Krallık'
                    : 'Yerleşim'}
            </span>
          </button>
        ))
      )}
    </div>
  ) : null;

  /* ── ana sayfa ── */
  const home = (
    <div className="flex h-full flex-col justify-center px-8">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {CARD_DEFS.map((card) => (
          <button
            key={card.section}
            type="button"
            onClick={() => go({ section: card.section })}
            className={`group relative shrink-0 w-[168px] h-[260px] rounded-sm border border-[#c6a15b]/45 bg-gradient-to-b ${card.art} hover:border-[#fbbf24]/70 transition-colors overflow-hidden`}
          >
            <span className="absolute inset-x-0 top-0 py-2 text-center font-display text-[11px] uppercase tracking-[0.18em] text-[#f2e8d5] bg-black/35 border-b border-[#c6a15b]/30">
              {card.title}
            </span>
            <span className="absolute inset-0 flex items-center justify-center text-[#c6a15b] opacity-70 group-hover:opacity-100 transition-opacity">
              <SectionIcon section={card.section} size={56} />
            </span>
            <span className="absolute inset-x-0 bottom-0 px-2 py-2 text-center text-[10px] text-[#c9bda8] bg-black/50 border-t border-[#c6a15b]/25">
              {card.desc}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-5 text-[11px] text-[#8b8072]">
        Kahramanlar · krallıklar · klanlar · yerleşimler · kavramlar. Arama için <kbd className="text-[#c6a15b]">/</kbd>,
        geri için <kbd className="text-[#c6a15b]">Esc</kbd>, kapatmak için <kbd className="text-[#c6a15b]">N</kbd>.
      </p>
    </div>
  );

  /* ── kahraman listesi ── */
  const heroList = (() => {
    const list = filterHeroes(index, { occupation, kingdomId, sort, query: '' });
    return (
      <div className="flex h-full min-h-0">
        <aside className="w-56 shrink-0 border-r border-[#c6a15b]/25 px-3 py-3 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-1">Meslek</div>
          <div className="flex flex-col gap-0.5 mb-4">
            {OCCUPATION_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setOccupation(f.id as Occupation | 'ALL')}
                className={`text-left px-2 py-1 rounded text-[11px] ${
                  occupation === f.id
                    ? 'bg-[#c6a15b]/20 text-[#fbbf24]'
                    : 'text-[#a89b84] hover:text-[#e2d6c1] hover:bg-[#c6a15b]/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-1">Krallık</div>
          <div className="flex flex-col gap-0.5 mb-4">
            <button
              type="button"
              onClick={() => setKingdomId('ALL')}
              className={`text-left px-2 py-1 rounded text-[11px] ${
                kingdomId === 'ALL' ? 'bg-[#c6a15b]/20 text-[#fbbf24]' : 'text-[#a89b84] hover:text-[#e2d6c1]'
              }`}
            >
              Tümü
            </button>
            {index.kingdoms.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKingdomId(k.id)}
                className={`text-left px-2 py-1 rounded text-[11px] truncate ${
                  kingdomId === k.id ? 'bg-[#c6a15b]/20 text-[#fbbf24]' : 'text-[#a89b84] hover:text-[#e2d6c1]'
                }`}
              >
                {k.name}
              </button>
            ))}
          </div>

          <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-1">Sırala</div>
          <div className="flex flex-col gap-0.5">
            {HERO_SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSort(s.id)}
                className={`text-left px-2 py-1 rounded text-[11px] ${
                  sort === s.id ? 'bg-[#c6a15b]/20 text-[#fbbf24]' : 'text-[#a89b84] hover:text-[#e2d6c1]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-3 py-1.5 text-[10px] text-[#a2957f] border-b border-[#c6a15b]/20">
            {list.length} kayıt
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => go({ section: 'HERO', id: h.id })}
                className="w-full flex items-center gap-3 px-3 py-2 border-b border-[#c6a15b]/12 hover:bg-[#c6a15b]/10 text-left"
              >
                <HeroPortrait hero={h} width={36} square />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-[#f8f0df] truncate">{h.name}</span>
                    <span className={`text-[9px] px-1 rounded border ${occupationColor[h.occupation]}`}>
                      {OCCUPATION_LABELS[h.occupation]}
                    </span>
                    {h.atWarWithPlayer && (
                      <span className="text-[9px] px-1 rounded border border-[#991b1b] text-[#fca5a5]">
                        Savaşta
                      </span>
                    )}
                  </span>
                  <span className="block text-[10px] text-[#a2957f] truncate">
                    {h.title} · {h.clanName} · {h.kingdomName}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[10px] text-[#a89b84]">
                    {h.revealed ? `${ageOf(h, index.day)} yaş` : 'yaş gizli'}
                  </span>
                  <span className="block text-[10px] text-[#8b8072]">{lastSeenLabel(h, index.day)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  })();

  /* ── kahraman detayı ── */
  const heroDetail = (hero: HeroRecord | undefined) => {
    if (!hero) {
      return <div className="p-8 text-center text-xs text-[#a2957f]">Kahraman bulunamadı.</div>;
    }
    const info = visibleHeroInfo(hero, index.day);
    const kin = heroKin(index, hero);
    const allies = heroAllies(index, hero, 2);
    const rivals = heroRivals(index, hero, 2);
    const prisoner = prisonerInfo(index, hero);
    const fam = familyView(index.heroById, hero);
    // `visibleHeroInfo` gizliyken null döner; gösterimde bunu '—' yapıyoruz.
    const traits: { key: keyof typeof hero.traits; label: string }[] = [
      { key: 'valor', label: 'Cesaret' },
      { key: 'honor', label: 'Onur' },
      { key: 'generosity', label: 'Cömertlik' },
      { key: 'mercy', label: 'Merhamet' },
    ];

    return (
      <div className="flex h-full min-h-0">
        <div className="w-[240px] shrink-0 border-r border-[#c6a15b]/25 p-4 flex flex-col items-center">
          <div className="relative">
            <HeroPortrait
              hero={hero}
              width={208}
              className="!border-[#c6a15b]/50"
            />
            <span className="absolute inset-x-0 bottom-0 py-1 text-center text-[10px] bg-black/55 text-[#e2d6c1] rounded-b-sm">
              {OCCUPATION_LABELS[hero.occupation]}
            </span>
          </div>
          <div className="mt-2 text-center">
            <div className="font-display text-sm text-[#f8f0df]">{hero.name}</div>
            <div className="text-[11px] text-[#a89b84]">{hero.title}</div>
          </div>
          <div className="mt-3 w-full space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-[#a2957f]">Durum</span>
              <span className="text-[#e2d6c1]">{STATUS_LABELS[hero.status]}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-[#a2957f]">Oyuncuya ilişki</span>
              <span className={hero.relation >= 0 ? 'text-[#34d399]' : 'text-[#fca5a5]'}>{hero.relation}</span>
            </div>
            {hero.atWarWithPlayer && (
              <div className="text-[10px] text-center text-[#fca5a5] border border-[#991b1b]/60 rounded py-0.5">
                Sizinle savaş hâlinde
              </div>
            )}
          </div>

          {onMeetHero && !hero.revealed && (
            <button
              type="button"
              onClick={() => onMeetHero(hero.id)}
              className="mt-3 w-full px-2 py-1.5 rounded text-[11px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fbbf24]/40"
            >
              Tanış (bilgileri aç)
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          <div className="rounded border border-[#c6a15b]/30 p-3 mb-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-2">Bilgi</div>
            <div className="grid grid-cols-2 gap-2">
              <InfoCell label="Kültür" value={FACTION_INFO[hero.culture]?.name ?? hero.culture} />
              <InfoCell label="Yaş" value={info.age === null ? '— (tanışmadınız)' : `${info.age}`} />
              <InfoCell label="Meslek" value={OCCUPATION_LABELS[hero.occupation]} />
              <InfoCell label="İlişki" value={`${hero.relation}`} />
            </div>
            <div className="mt-2 flex items-start gap-2 text-[11px]">
              <span className="text-[#a2957f] shrink-0">Son görüldü:</span>
              <button
                type="button"
                onClick={() =>
                  hero.lastSeen.settlementId &&
                  go({ section: 'SETTLEMENT', id: hero.lastSeen.settlementId })
                }
                className="text-[#fbbf24] hover:underline text-left"
              >
                {lastSeenLabel(hero, index.day)}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <LinkCard
              label="Klan"
              value={hero.clanName}
              onClick={() => go({ section: 'CLAN', id: hero.clanId })}
            />
            <LinkCard
              label="Krallık"
              value={hero.kingdomName}
              onClick={() => hero.kingdomId && go({ section: 'KINGDOM', id: hero.kingdomId })}
              disabled={!hero.kingdomId}
            />
          </div>

          <div className="rounded border border-[#c6a15b]/30 p-3 mb-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-2">Kişilik</div>
            <div className="grid grid-cols-2 gap-2">
              {traits.map((t) => {
                const v = hero.traits[t.key];
                return (
                  <div key={t.key} className="flex items-center gap-2">
                    <span className="text-[10px] text-[#a2957f] w-16">{t.label}</span>
                    <span className="flex-1 h-1.5 rounded bg-[#241c12] overflow-hidden">
                      <span
                        className={`block h-full ${v >= 0 ? 'bg-[#34d399]' : 'bg-[#f87171]'}`}
                        style={{ width: `${Math.abs(v) * 50}%`, marginLeft: v < 0 ? `${50 - Math.abs(v) * 50}%` : '50%' }}
                      />
                    </span>
                    <span className="text-[10px] text-[#a89b84] w-4 text-right">{v > 0 ? `+${v}` : v}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded border border-[#c6a15b]/30 p-3 mb-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-2">Beceriler</div>
            {info.skills === null ? (
              <div className="text-[11px] text-[#8b8072]">Tanışmadınız — beceriler gizli.</div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(info.skills).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between bg-[#0d0b08] rounded px-2 py-0.5">
                    <span className="text-[9px] text-[#a2957f] capitalize">{key}</span>
                    <span className="text-[10px] text-[#e2d6c1]">{val?.level ?? 0}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Faz 3: aile ağacı (3 kuşak) */}
          <div className="rounded border border-[#c6a15b]/30 p-3 mb-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-2">
              Aile Ağacı
            </div>
            {!hasFamily(fam) ? (
              <div className="text-[11px] text-[#8b8072]">
                Kayıtlı aile bağı yok (anne, baba, eş veya çocuk bilinmiyor).
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                {/* 1. kuşak: ebeveynler */}
                <div className="flex items-center gap-1.5">
                  {fam.father && (
                    <button
                      type="button"
                      onClick={() => go({ section: 'HERO', id: fam.father!.id })}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#c6a15b]/30 hover:bg-[#c6a15b]/10"
                    >
                      <HeroPortrait hero={fam.father} width={20} square />
                      <span className="text-[10px] text-[#e2d6c1]">{fam.father.name}</span>
                      <span className="text-[8px] text-[#8b8072]">baba</span>
                    </button>
                  )}
                  {fam.mother && (
                    <button
                      type="button"
                      onClick={() => go({ section: 'HERO', id: fam.mother!.id })}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#c6a15b]/30 hover:bg-[#c6a15b]/10"
                    >
                      <HeroPortrait hero={fam.mother} width={20} square />
                      <span className="text-[10px] text-[#e2d6c1]">{fam.mother.name}</span>
                      <span className="text-[8px] text-[#8b8072]">anne</span>
                    </button>
                  )}
                </div>
                {(fam.father || fam.mother) && <span className="w-px h-2.5 bg-[#c6a15b]/40" />}

                {/* 2. kuşak: kendisi + eşi */}
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#fbbf24]/60 bg-[#fbbf24]/10">
                    <HeroPortrait hero={hero} width={20} square />
                    <span className="text-[10px] text-[#f8f0df]">{hero.name}</span>
                  </span>
                  {fam.spouse && (
                    <>
                      <span className="text-[10px] text-[#c6a15b] select-none">∞</span>
                      <button
                        type="button"
                        onClick={() => go({ section: 'HERO', id: fam.spouse!.id })}
                        className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#c6a15b]/30 hover:bg-[#c6a15b]/10"
                      >
                        <HeroPortrait hero={fam.spouse} width={20} square />
                        <span className="text-[10px] text-[#e2d6c1]">{fam.spouse.name}</span>
                      </button>
                    </>
                  )}
                </div>
                {/* 3. kuşak: çocuklar */}
                {fam.children.length > 0 && (
                  <div className="flex flex-col items-center">
                    <span className="w-px h-3 bg-[#c6a15b]/40" />
                    <span className="h-px w-[calc(100%-2.5rem)] bg-[#c6a15b]/40" />
                    <div className="flex flex-wrap items-start justify-center gap-1.5">
                    {fam.children.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => go({ section: 'HERO', id: c.id })}
                        className="relative mt-2 flex items-center gap-1.5 px-2 py-1 rounded border border-[#c6a15b]/25 hover:bg-[#c6a15b]/10"
                      >
                        <span className="absolute left-1/2 -top-2 h-2 w-px bg-[#c6a15b]/40" />
                        <HeroPortrait hero={c} width={20} square />
                        <span className="text-[10px] text-[#e2d6c1]">{c.name}</span>
                      </button>
                    ))}
                    </div>
                  </div>
                )}

                {/* kardeşler */}
                {fam.siblings.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
                    <span className="text-[9px] text-[#a2957f]">Kardeşler:</span>
                    {fam.siblings.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => go({ section: 'HERO', id: b.id })}
                        className="text-[9px] px-1.5 py-0.5 rounded border border-[#c6a15b]/25 text-[#e2d6c1] hover:bg-[#c6a15b]/10"
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Faz 2: aile & yakınlar */}
          <div className="rounded border border-[#c6a15b]/30 p-3 mb-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-2">
              Klan Üyeleri
            </div>
            {kin.length === 0 ? (
              <div className="text-[11px] text-[#8b8072]">Klanında başka kayıtlı üye yok.</div>
            ) : (
              <div className="space-y-1">
                {kin.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => go({ section: 'HERO', id: k.id })}
                    className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#c6a15b]/10 text-left"
                  >
                    <HeroPortrait hero={k} width={22} square />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] text-[#e2d6c1] truncate">{k.name}</span>
                      <span className="block text-[9px] text-[#a2957f] truncate">{k.title}</span>
                    </span>
                    <span className="shrink-0 text-[9px] text-[#8b8072]">
                      {k.relation >= 0 ? `+${k.relation}` : k.relation}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Faz 2: diplomatik durum (esir / savaş / müttefik) */}
          <div className="rounded border border-[#c6a15b]/30 p-3 mb-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-2">
              Durum & İlişkiler
            </div>
            <div className="space-y-1 text-[11px]">
              {prisoner.isPrisoner ? (
                <div className="flex justify-between">
                  <span className="text-[#a2957f]">Esir</span>
                  <span className="text-[#fca5a5]">
                    {prisoner.captorName} · {prisoner.daysHeld} gün
                  </span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-[#a2957f]">Esaret</span>
                  <span className="text-[#34d399]">Serbest</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#a2957f]">Oyuncuya karşı</span>
                <span className={hero.atWarWithPlayer ? 'text-[#fca5a5]' : 'text-[#34d399]'}>
                  {hero.atWarWithPlayer ? 'Savaşta' : hero.alliedWithPlayer ? 'Müttefik' : 'Barış'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a2957f]">Son görüldüğü yer</span>
                <span className="text-[#e2d6c1] truncate max-w-[180px] text-right">
                  {lastSeenLabel(hero, index.day)}
                </span>
              </div>
            </div>
            {(allies.length > 0 || rivals.length > 0) && (
              <div className="mt-2 pt-2 border-t border-[#c6a15b]/20 flex flex-wrap gap-1">
                {allies.slice(0, 2).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => go({ section: 'HERO', id: a.id })}
                    className="text-[9px] px-1.5 py-0.5 rounded border border-[#34d399]/40 text-[#34d399] hover:bg-[#34d399]/10"
                  >
                    Müttefik: {a.name} (+{a.relation})
                  </button>
                ))}
                {rivals.slice(0, 2).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => go({ section: 'HERO', id: r.id })}
                    className="text-[9px] px-1.5 py-0.5 rounded border border-[#f87171]/40 text-[#fca5a5] hover:bg-[#f87171]/10"
                  >
                    Rakip: {r.name} ({r.relation})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded border border-[#c6a15b]/30 p-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-1">Açıklama</div>
            <p className="text-[11px] leading-relaxed text-[#c9bda8]">{hero.bio}</p>
          </div>
        </div>
      </div>
    );
  };

  /* ── yer tutucu (Faz 2) ── */
  const placeholder = (title: string) => (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-6">
      <div className="text-3xl opacity-50">🚧</div>
      <div className="font-display text-sm text-[#f8f0df]">{title}</div>
      <div className="text-[11px] text-[#a2957f] max-w-sm">
        Bu bölüm Faz 2'de gelecek. Veri hazır; sayfa düzeni sıradaki adımda bağlanacak.
      </div>
    </div>
  );

  const body = (() => {
    if (query.trim()) return heroList; // arama paneli üstte; arka planda liste kalsın
    switch (route.section) {
      case 'HOME':
        return home;
      case 'HEROES':
        return heroList;
      case 'HERO':
        return heroDetail(index.heroById[route.id ?? '']);
      case 'KINGDOMS':
        return <KingdomListPage index={index} onNavigate={go} />;
      case 'KINGDOM':
        return <KingdomDetailPage index={index} kingdomId={route.id} onNavigate={go} />;
      case 'CLANS':
        return <ClanListPage index={index} onNavigate={go} />;
      case 'CLAN':
        return <ClanDetailPage index={index} clanId={route.id} onNavigate={go} />;
      case 'SETTLEMENTS':
        return <SettlementListPage index={index} onNavigate={go} />;
      case 'SETTLEMENT':
        return <SettlementDetailPage index={index} settlementId={route.id} onNavigate={go} />;
      case 'CONCEPTS':
        return <ConceptsPage />;
      default:
        return placeholder(route.section);
    }
  })();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#060504]/85 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-5xl h-[86vh] rounded-sm border border-[#c6a15b]/50 bg-[#0f0c08] shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* iç çerçeve */}
        <div className="pointer-events-none absolute inset-1.5 rounded-sm border border-[#c6a15b]/15" />
        {header}
        <div className="relative h-[calc(100%-57px)]">
          {searchPanel}
          {body}
        </div>
      </div>
    </div>
  );
};
