import React, { useMemo, useState } from 'react';
import { FACTION_INFO, type Settlement } from '../../game/rules';
import {
  SETTLEMENT_TYPE_LABELS,
  clanMembers,
  kingdomClans,
  kingdomFiefs,
  kingdomMembers,
  kingdomDiplomacy,
  settlementHeroes,
  settlementKingdom,
  type ClanSummary,
  type EncyclopediaIndex,
  type EncyclopediaRoute,
  type KingdomSummary,
} from '../../game/encyclopedia';
import { OCCUPATION_LABELS, lastSeenLabel, type HeroRecord } from '../../game/heroes';
import { BannerBadge, Chip, InfoCell, LinkCard, SectionTitle, initials, occupationColor } from './parts';
import { HeroPortrait } from './HeroPortrait';
import { SettlementIcon } from './icons';

interface PageProps {
  index: EncyclopediaIndex;
  onNavigate: (route: EncyclopediaRoute) => void;
}

/* ─────────────────────────── ortak satırlar ─────────────────────────── */

const HeroRow: React.FC<{ hero: HeroRecord; day: number; onOpen: () => void }> = ({
  hero,
  day,
  onOpen,
}) => (
  <button
    type="button"
    onClick={onOpen}
    className="w-full flex items-center gap-3 px-3 py-2 border-b border-[#c6a15b]/12 hover:bg-[#c6a15b]/10 text-left"
  >
    <HeroPortrait hero={hero} width={32} square />
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2">
        <span className="text-xs text-[#f8f0df] truncate">{hero.name}</span>
        <span className={`text-[9px] px-1 rounded border ${occupationColor[hero.occupation]}`}>
          {OCCUPATION_LABELS[hero.occupation]}
        </span>
      </span>
      <span className="block text-[10px] text-[#a2957f] truncate">{hero.title}</span>
    </span>
    <span className="shrink-0 text-right text-[10px] text-[#8b8072] max-w-[190px] truncate">
      {lastSeenLabel(hero, day)}
    </span>
  </button>
);

const EmptyNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 py-4 text-[11px] text-[#8b8072]">{children}</div>
);

const ListShell: React.FC<{ count: number; children: React.ReactNode; aside?: React.ReactNode }> = ({
  count,
  children,
  aside,
}) => (
  <div className="flex h-full min-h-0">
    {aside && <aside className="w-56 shrink-0 border-r border-[#c6a15b]/25 px-3 py-3 overflow-y-auto">{aside}</aside>}
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-3 py-1.5 text-[10px] text-[#a2957f] border-b border-[#c6a15b]/20">{count} kayıt</div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  </div>
);

const FilterButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left px-2 py-1 rounded text-[11px] truncate ${
      active ? 'bg-[#c6a15b]/20 text-[#fbbf24]' : 'text-[#a89b84] hover:text-[#e2d6c1] hover:bg-[#c6a15b]/10'
    }`}
  >
    {children}
  </button>
);

/* ─────────────────────────── KRALLIKLAR ─────────────────────────── */

export const KingdomListPage: React.FC<PageProps> = ({ index, onNavigate }) => {
  const rows = index.kingdoms.map((k) => {
    const ruler = k.rulerId ? index.heroById[k.rulerId] : null;
    return (
      <button
        key={k.id}
        type="button"
        onClick={() => onNavigate({ section: 'KINGDOM', id: k.id })}
        className="w-full flex items-center gap-3 px-3 py-2 border-b border-[#c6a15b]/12 hover:bg-[#c6a15b]/10 text-left"
      >
        {ruler ? (
          <HeroPortrait hero={ruler} width={36} square />
        ) : (
          <BannerBadge color="#7c2d12" text={initials(k.name)} size={36} />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-xs text-[#f8f0df] truncate">{k.name}</span>
            {k.atWarWithPlayer && (
              <Chip className="text-[#fca5a5] border-[#991b1b] bg-[#991b1b]/20">Savaşta</Chip>
            )}
          </span>
          <span className="block text-[10px] text-[#a2957f] truncate">
            Hükümdar: {k.rulerName} · {k.clanIds.length} klan · {k.memberIds.length} lord
          </span>
        </span>
        <span className="shrink-0 text-right text-[10px] text-[#8b8072]">{k.fiefCount} tımar</span>
      </button>
    );
  });
  return <ListShell count={index.kingdoms.length}>{rows}</ListShell>;
};

export const KingdomDetailPage: React.FC<PageProps & { kingdomId?: string }> = ({
  index,
  kingdomId,
  onNavigate,
}) => {
  const kingdom = kingdomId ? index.kingdomById[kingdomId] : undefined;
  if (!kingdom) return <EmptyNote>Krallık bulunamadı.</EmptyNote>;

  const ruler = kingdom.rulerId ? index.heroById[kingdom.rulerId] : null;
  const clans = kingdomClans(index, kingdom.id);
  const members = kingdomMembers(index, kingdom.id);
  const fiefs = kingdomFiefs(index, kingdom.id);
  const diplomacy = kingdomDiplomacy(index, kingdom);
  const warLords = members.filter((m) => m.atWarWithPlayer).length;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-start gap-3 rounded border border-[#c6a15b]/30 p-3 mb-3">
        {ruler ? (
          <HeroPortrait hero={ruler} width={56} square />
        ) : (
          <BannerBadge color="#7c2d12" text={initials(kingdom.name)} size={56} />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm text-[#f8f0df] truncate">{kingdom.name}</div>
          <div className="text-[11px] text-[#a89b84] mb-1">
            {FACTION_INFO[kingdom.culture]?.name ?? kingdom.culture}
          </div>
          <div className="flex flex-wrap gap-1">
            {kingdom.atWarWithPlayer ? (
              <Chip className="text-[#fca5a5] border-[#991b1b] bg-[#991b1b]/20">Sizinle savaşta</Chip>
            ) : (
              <Chip className="text-[#34d399] border-[#34d399]/40 bg-[#34d399]/10">Barış</Chip>
            )}
            <Chip>{kingdom.clanIds.length} klan</Chip>
            <Chip>{kingdom.memberIds.length} lord</Chip>
            {warLords > 0 && (
              <Chip className="text-[#fbbf24] border-[#b45309]/50 bg-[#b45309]/15">
                {warLords} lord savaşta
              </Chip>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 w-[220px] shrink-0">
          <InfoCell label="Hükümdar" value={kingdom.rulerName} />
          <InfoCell label="Tımar" value={`${kingdom.fiefCount}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-[#c6a15b]/30">
          <div className="px-3 pt-2">
            <SectionTitle>Klanlar</SectionTitle>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {clans.length === 0 && <EmptyNote>Klan kaydı yok.</EmptyNote>}
            {clans.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onNavigate({ section: 'CLAN', id: c.id })}
                className="w-full flex items-center justify-between px-3 py-1.5 border-b border-[#c6a15b]/12 hover:bg-[#c6a15b]/10"
              >
                <span className="text-[11px] text-[#e2d6c1] truncate">{c.name}</span>
                <span className="text-[10px] text-[#8b8072]">{c.memberIds.length} üye</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded border border-[#c6a15b]/30">
          <div className="px-3 pt-2">
            <SectionTitle>Topraklar</SectionTitle>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {fiefs.length === 0 && <EmptyNote>Toprak kaydı yok.</EmptyNote>}
            {fiefs.slice(0, 40).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onNavigate({ section: 'SETTLEMENT', id: s.id })}
                className="w-full flex items-center justify-between px-3 py-1.5 border-b border-[#c6a15b]/12 hover:bg-[#c6a15b]/10"
              >
                <span className="text-[11px] text-[#e2d6c1] truncate">{s.name}</span>
                <span className="text-[10px] text-[#8b8072]">{SETTLEMENT_TYPE_LABELS[s.type]}</span>
              </button>
            ))}
            {fiefs.length > 40 && (
              <div className="px-3 py-1.5 text-[10px] text-[#8b8072]">
                … ve {fiefs.length - 40} yerleşim daha
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Faz 2: diplomatik durum */}
      <div className="mt-3 rounded border border-[#c6a15b]/30 p-3">
        <SectionTitle>Diplomatik Durum</SectionTitle>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <div>
            <div className="text-[9px] uppercase tracking-[0.12em] text-[#a2957f] mb-1">
              Oyuncuyla savaşta olan krallıklar
            </div>
            {diplomacy.atWarWith.length === 0 ? (
              <div className="text-[10px] text-[#8b8072]">
                {kingdom.atWarWithPlayer
                  ? 'Bu krallık sizinle savaşta.'
                  : 'Oyuncuyla savaşta olan krallık yok.'}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {diplomacy.atWarWith.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => onNavigate({ section: 'KINGDOM', id: k.id })}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-[#f87171]/40 text-[#fca5a5] hover:bg-[#f87171]/10"
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.12em] text-[#a2957f] mb-1">
              Aynı kültürden krallıklar
            </div>
            {diplomacy.sameCulture.length === 0 ? (
              <div className="text-[10px] text-[#8b8072]">Yok.</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {diplomacy.sameCulture.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => onNavigate({ section: 'KINGDOM', id: k.id })}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-[#c6a15b]/40 text-[#e2d6c1] hover:bg-[#c6a15b]/10"
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-[#c6a15b]/20 grid grid-cols-4 gap-2">
          <InfoCell label="Klan" value={`${diplomacy.totalMembers > 0 ? kingdom.clanIds.length : 0}`} />
          <InfoCell label="Lord" value={`${diplomacy.totalMembers}`} />
          <InfoCell label="Tımar" value={`${diplomacy.totalFiefs}`} />
          <InfoCell label="Savaşan lord" value={`${warLords}`} />
        </div>
      </div>

      <div className="mt-3 rounded border border-[#c6a15b]/30">
        <div className="px-3 pt-2">
          <SectionTitle>Lordlar ve leydiler</SectionTitle>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {members.map((h) => (
            <HeroRow
              key={h.id}
              hero={h}
              day={index.day}
              onOpen={() => onNavigate({ section: 'HERO', id: h.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────── KLANLAR ─────────────────────────── */

export const ClanListPage: React.FC<PageProps> = ({ index, onNavigate }) => (
  <ListShell count={index.clans.length}>
    {index.clans.map((c) => {
      // Klan lideri varsa portresi rozetin yerine geçer (Bannerlord ansiklopedisi).
      const leader = c.leaderId ? index.heroById[c.leaderId] : null;
      return (
      <button
        key={c.id}
        type="button"
        onClick={() => onNavigate({ section: 'CLAN', id: c.id })}
        className="w-full flex items-center gap-3 px-3 py-2 border-b border-[#c6a15b]/12 hover:bg-[#c6a15b]/10 text-left"
      >
        {leader ? (
          <HeroPortrait hero={leader} width={34} square />
        ) : (
          <BannerBadge color={c.bannerColor} text={initials(c.name)} size={34} />
        )}
        <span className="min-w-0 flex-1">
          <span className="text-xs text-[#f8f0df] truncate block">{c.name}</span>
          <span className="block text-[10px] text-[#a2957f] truncate">
            {c.kingdomName} · {c.memberIds.length} üye
          </span>
        </span>
        <span className="shrink-0 text-[10px] text-[#8b8072]">{c.fiefCount} tımar</span>
      </button>
      );
    })}
  </ListShell>
);

export const ClanDetailPage: React.FC<PageProps & { clanId?: string }> = ({
  index,
  clanId,
  onNavigate,
}) => {
  const clan: ClanSummary | undefined = clanId ? index.clanById[clanId] : undefined;
  if (!clan) return <EmptyNote>Klan bulunamadı.</EmptyNote>;

  const leader = clan.leaderId ? index.heroById[clan.leaderId] : null;
  const members = clanMembers(index, clan.id);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-start gap-3 rounded border border-[#c6a15b]/30 p-3 mb-3">
        {leader ? (
          <HeroPortrait hero={leader} width={56} square />
        ) : (
          <BannerBadge color={clan.bannerColor} text={initials(clan.name)} size={56} />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm text-[#f8f0df] truncate">{clan.name}</div>
          <div className="text-[11px] text-[#a89b84] mb-1">{clan.kingdomName}</div>
          <div className="flex flex-wrap gap-1">
            <Chip>{clan.memberIds.length} üye</Chip>
            <Chip>{clan.fiefCount} tımar</Chip>
            {leader && <Chip className="text-[#fbbf24] border-[#fbbf24]/40 bg-[#fbbf24]/10">Lider: {leader.name}</Chip>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <LinkCard
          label="Krallık"
          value={clan.kingdomName}
          onClick={() => clan.kingdomId && onNavigate({ section: 'KINGDOM', id: clan.kingdomId })}
          disabled={!clan.kingdomId}
        />
        <LinkCard
          label="Lider"
          value={leader?.name ?? '—'}
          onClick={() => leader && onNavigate({ section: 'HERO', id: leader.id })}
          disabled={!leader}
        />
      </div>

      {/* Faz 2: klan soy bağı — lider → en yaşlı üyeler → gençler */}
      <div className="rounded border border-[#c6a15b]/30 p-3 mb-3">
        <SectionTitle>Aile Bağı</SectionTitle>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {[...members]
            .sort((a, b) => {
              if (a.id === leader?.id) return -1;
              if (b.id === leader?.id) return 1;
              return a.birthDay - b.birthDay;
            })
            .slice(0, 8)
            .map((h, i) => (
              <React.Fragment key={h.id}>
                {i > 0 && <span className="text-[10px] text-[#6f6559]">·</span>}
                <button
                  type="button"
                  onClick={() => onNavigate({ section: 'HERO', id: h.id })}
                  className={`text-[10px] px-1.5 py-0.5 rounded border hover:bg-[#c6a15b]/10 ${
                    h.id === leader?.id
                      ? 'border-[#fbbf24]/50 text-[#fbbf24]'
                      : 'border-[#c6a15b]/30 text-[#e2d6c1]'
                  }`}
                >
                  {h.name}
                  <span className="text-[8px] text-[#8b8072] ml-1">
                    {Math.max(0, Math.floor((index.day - h.birthDay) / 365))}y
                  </span>
                </button>
              </React.Fragment>
            ))}
          {members.length > 8 && (
            <span className="text-[9px] text-[#8b8072]">+{members.length - 8}</span>
          )}
        </div>
        <div className="text-[9px] text-[#8b8072] mt-1">
          Lider altın çerçeveli; yaşlar gün sayısından hesaplanır.
        </div>
      </div>

      <div className="rounded border border-[#c6a15b]/30">
        <div className="px-3 pt-2">
          <SectionTitle>Üyeler</SectionTitle>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {members.map((h) => (
            <HeroRow
              key={h.id}
              hero={h}
              day={index.day}
              onOpen={() => onNavigate({ section: 'HERO', id: h.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────── YERLEŞİMLER ─────────────────────────── */

type SettlementFilter = 'ALL' | Settlement['type'];

export const SettlementListPage: React.FC<PageProps> = ({ index, onNavigate }) => {
  const [filter, setFilter] = useState<SettlementFilter>('ALL');
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return index.settlements
      .filter((s) => (filter === 'ALL' ? true : s.type === filter))
      .filter((s) => (q ? s.name.toLocaleLowerCase('tr').includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [index.settlements, filter, query]);

  return (
    <ListShell
      count={list.length}
      aside={
        <>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-1">Tür</div>
          <div className="flex flex-col gap-0.5 mb-4">
            {(
              [
                { id: 'ALL', label: 'Tümü' },
                { id: 'TOWN', label: 'Şehir' },
                { id: 'CASTLE', label: 'Kale' },
                { id: 'VILLAGE', label: 'Köy' },
              ] as { id: SettlementFilter; label: string }[]
            ).map((f) => (
              <FilterButton key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </FilterButton>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-1">Ara</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Yerleşim adı…"
            className="w-full bg-[#0d0b08] border border-[#c6a15b]/40 rounded px-2 py-1 text-[11px] text-[#e2d6c1] placeholder:text-[#8b8072] outline-none focus:border-[#fbbf24]/70"
          />
        </>
      }
    >
      {list.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onNavigate({ section: 'SETTLEMENT', id: s.id })}
          className="w-full flex items-center gap-3 px-3 py-2 border-b border-[#c6a15b]/12 hover:bg-[#c6a15b]/10 text-left"
        >
          <span className="w-8 h-8 shrink-0 rounded-sm border border-[#c6a15b]/40 flex items-center justify-center text-[#c6a15b]">
            <SettlementIcon type={s.type} size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-xs text-[#f8f0df] truncate block">{s.name}</span>
            <span className="block text-[10px] text-[#a2957f] truncate">
              {SETTLEMENT_TYPE_LABELS[s.type]} · {FACTION_INFO[s.faction]?.name ?? s.faction}
            </span>
          </span>
          <span className="shrink-0 text-[10px] text-[#8b8072]">{Math.round(s.prosperity)} refah</span>
        </button>
      ))}
    </ListShell>
  );
};

export const SettlementDetailPage: React.FC<PageProps & { settlementId?: string }> = ({
  index,
  settlementId,
  onNavigate,
}) => {
  const settlement = settlementId ? index.settlementById[settlementId] : undefined;
  if (!settlement) return <EmptyNote>Yerleşim bulunamadı.</EmptyNote>;

  const kingdom: KingdomSummary | null = settlementKingdom(index, settlement);
  const heroes = settlementHeroes(index, settlement.id);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-start gap-3 rounded border border-[#c6a15b]/30 p-3 mb-3">
        <span
          className="w-14 h-14 shrink-0 rounded-sm border border-[#c6a15b]/40 flex items-center justify-center text-[#d8b977]"
          style={{ background: 'linear-gradient(160deg,#2a2015,#120f0b)' }}
        >
          <SettlementIcon type={settlement.type} size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm text-[#f8f0df] truncate">{settlement.name}</div>
          <div className="text-[11px] text-[#a89b84] mb-1">
            {SETTLEMENT_TYPE_LABELS[settlement.type]} ·{' '}
            {FACTION_INFO[settlement.faction]?.name ?? settlement.faction}
          </div>
          <div className="flex flex-wrap gap-1">
            <Chip>{Math.round(settlement.prosperity)} refah</Chip>
            <Chip>{settlement.garrison} garnizon</Chip>
            <Chip>{Math.round(settlement.foodStock)} erzak</Chip>
            {settlement.isRaided && (
              <Chip className="text-[#fca5a5] border-[#991b1b] bg-[#991b1b]/20">Yağmalandı</Chip>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 w-[190px] shrink-0">
          <LinkCard
            label="Krallık"
            value={kingdom?.name ?? 'Bağımsız'}
            onClick={() => kingdom && onNavigate({ section: 'KINGDOM', id: kingdom.id })}
            disabled={!kingdom}
          />
        </div>
      </div>

      <div className="rounded border border-[#c6a15b]/30 p-3 mb-3">
        <SectionTitle>Açıklama</SectionTitle>
        <p className="text-[11px] leading-relaxed text-[#c9bda8]">{settlement.description}</p>
      </div>

      <div className="rounded border border-[#c6a15b]/30">
        <div className="px-3 pt-2">
          <SectionTitle>Burada son görülenler</SectionTitle>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {heroes.length === 0 && <EmptyNote>Bilinen bir kahraman burada görülmedi.</EmptyNote>}
          {heroes.map((h) => (
            <HeroRow
              key={h.id}
              hero={h}
              day={index.day}
              onOpen={() => onNavigate({ section: 'HERO', id: h.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────── KAVRAMLAR ─────────────────────────── */

interface ConceptEntry {
  term: string;
  group: 'Savaş' | 'Ekonomi' | 'Siyaset' | 'Karakter';
  text: string;
}

const CONCEPTS: ConceptEntry[] = [
  { term: 'Renown (Şöhret)', group: 'Siyaset', text: 'Klanının itibarı. Savaş zaferleri, turnuvalar ve görevlerle artar; klan seviyesini (tier) yükseltir.' },
  { term: 'Nüfuz (Influence)', group: 'Siyaset', text: 'Krallık içindeki siyasi ağırlığın. Tımar talebi, klan ihracı ve politika oylarında harcanır.' },
  { term: 'Tımar (Fief)', group: 'Siyaset', text: 'Bir klanın yönettiği şehir, kale veya köy. Vergi ve asker kaynağıdır.' },
  { term: 'Haraç (Tribute)', group: 'Siyaset', text: 'Barış anlaşmasında güçsüz krallığın güçlüye ödediği günlük altın.' },
  { term: 'Savaş Yorgunluğu', group: 'Siyaset', text: 'Uzun savaşların halk üzerindeki baskısı. Barış isteğini artırır.' },
  { term: 'Parti (Party)', group: 'Savaş', text: 'Bir lordun haritada dolaşan ordusu. Hızı; asker sayısı, atlı oranı ve erzağa bağlıdır.' },
  { term: 'Moral', group: 'Savaş', text: 'Ordunun savaşma isteği. Düşük moral kaçış ve zayiatı artırır.' },
  { term: 'Erzak (Food)', group: 'Ekonomi', text: 'Partinin günlük tükettiği yiyecek. Biterse moral düşer ve asker kaybedilir.' },
  { term: 'Kalkan Duvarı', group: 'Savaş', text: 'Piyadelerin sıkı dizilimi. Ok hasarına büyük direnç verir, manevra kabiliyetini düşürür.' },
  { term: 'Kama (Wedge)', group: 'Savaş', text: 'Süvari hücumunda hat yarmak için kullanılan üçgen dizilim.' },
  { term: 'Refah (Prosperity)', group: 'Ekonomi', text: 'Yerleşimin zenginliği. Vergi gelirini, garnizon büyüklüğünü ve üretimi etkiler.' },
  { term: 'Demirci (Smithy)', group: 'Ekonomi', text: 'Silah dövülen atölye. Parça ve kalite üretimini belirler.' },
  { term: 'Esir & Fidye', group: 'Savaş', text: 'Yakalanan lordlar esir alınır; fidye ile serbest bırakılabilir veya ilişki için kullanılır.' },
  { term: 'Beceri & Odak', group: 'Karakter', text: 'Her becerinin bir seviyesi ve odak puanı vardır. Odak, o becerinin öğrenme hızını belirler.' },
  { term: 'Perk', group: 'Karakter', text: 'Beceri eşiklerinde açılan kalıcı yetenek. Politika ve savaş kurallarını değiştirir.' },
  { term: 'Kişilik (Trait)', group: 'Karakter', text: 'Cesaret, onur, cömertlik ve merhamet. Diyalog seçeneklerini ve lordların sana davranışını etkiler.' },
];

export const ConceptsPage: React.FC = () => {
  const [group, setGroup] = useState<'ALL' | ConceptEntry['group']>('ALL');
  const list = CONCEPTS.filter((c) => (group === 'ALL' ? true : c.group === group));

  return (
    <ListShell
      count={list.length}
      aside={
        <>
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#c6a15b] mb-1">Gruplar</div>
          <div className="flex flex-col gap-0.5">
            {(['ALL', 'Savaş', 'Ekonomi', 'Siyaset', 'Karakter'] as const).map((g) => (
              <FilterButton key={g} active={group === g} onClick={() => setGroup(g)}>
                {g === 'ALL' ? 'Tümü' : g}
              </FilterButton>
            ))}
          </div>
        </>
      }
    >
      {list.map((c) => (
        <div key={c.term} className="px-3 py-2 border-b border-[#c6a15b]/12">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#f8f0df]">{c.term}</span>
            <Chip>{c.group}</Chip>
          </div>
          <p className="text-[10px] leading-relaxed text-[#a89b84] mt-0.5">{c.text}</p>
        </div>
      ))}
    </ListShell>
  );
};
