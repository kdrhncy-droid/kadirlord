import React, { useEffect, useMemo, useState } from 'react';
import {
  FACTION_INFO,
  getTotalTroops,
  type CampaignState,
  type LordAgent,
  type SiegeEngineType,
} from '../game/rules';
import {
  SIEGE_RANGED_SLOTS,
  breakInLossRate,
  combineBesiegerForces,
  type SiegeEncounterView,
} from '../game/siegeEncounter';
import { buildHeroRegistry, type HeroRecord } from '../game/heroes';
import { getCachedPortrait, requestPortrait } from '../game/portraitRenderer';
import { getCachedSiegeVignette, renderSiegeVignette } from '../game/siegeVisuals';

interface SiegeEncounterModalProps {
  view: SiegeEncounterView;
  campaign: CampaignState;
  onClose: () => void;
  onOpenSiegeCamp: () => void;
  onAssaultBreach: () => void;
  onAssaultRam: () => void;
  onLiftSiege: () => void;
  onAttackBesiegers: (lord: LordAgent) => void;
  onBreakIn: () => void;
  onObserve: () => void;
  onDefendWalls: () => void;
  onSallyOut: (lord: LordAgent | null) => void;
  onTalkSurrender: () => void;
}

type ActionIconName =
  | 'camp'
  | 'breach'
  | 'ram'
  | 'retreat'
  | 'attack'
  | 'breakIn'
  | 'observe'
  | 'defend'
  | 'sally'
  | 'talk';

const ACTION_ICONS: Record<ActionIconName, React.ReactNode> = {
  camp: <><path d="M3 20h18M5 20l7-15 7 15M8 14h8" /><path d="M12 5v7" /></>,
  breach: <><path d="M4 20V8l4-3 4 3 4-3 4 3v12" /><path d="M2 13h7m-3-3 3 3-3 3" /></>,
  ram: <><path d="M3 20h18M6 18l2-9h8l2 9M7 9l5-4 5 4" /><path d="M5 13h14" /></>,
  retreat: <><path d="M20 12H5m0 0 6-6m-6 6 6 6" /><path d="M19 5v14" /></>,
  attack: <><path d="m6 4 14 14M18 4 4 18M6 4l-2 5 5-2m9 11 5 2-2-5" /></>,
  breakIn: <><path d="M5 21V4h14v17M9 21v-8h6v8" /><path d="M2 12h6m-2-3 3 3-3 3" /></>,
  observe: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  defend: <><path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  sally: <><path d="M20 8a8 8 0 0 0-14-3L4 7" /><path d="M4 3v4h4M4 16a8 8 0 0 0 14 3l2-2" /><path d="M20 21v-4h-4" /></>,
  talk: <><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9h8m-8 3h5" /></>,
};

const ENGINE_LABELS: Record<SiegeEngineType, string> = {
  TREBUCHET: 'Mancınık',
  MANGONEL: 'Mangonel',
  BALLISTA: 'Balista',
  BATTERING_RAM: 'Koçbaşı',
  SIEGE_TOWER: 'Kuşatma kulesi',
};

function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-[#c6a15b]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ACTION_ICONS[name]}
    </svg>
  );
}

function CrestBadge({ color, variant = 'sword' }: { color: string; variant?: 'sword' | 'castle' }) {
  return (
    <span
      className="inline-flex h-8 w-7 shrink-0 items-center justify-center border border-[#d4af37]/85 shadow-inner"
      style={{
        backgroundColor: color,
        clipPath: 'polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%)',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-[#fde68a]">
        {variant === 'castle' ? (
          <path d="M3 2H5V4H7V2H9V4H11V2H13V13H3V2ZM6 13V9H10V13H6Z" />
        ) : (
          <path d="M8 1.5L9.6 5.1L13.5 5.6L10.6 8.3L11.4 12.2L8 10.2L4.6 12.2L5.4 8.3L2.5 5.6L6.4 5.1L8 1.5Z" />
        )}
      </svg>
    </span>
  );
}

function LordAvatar({ hero }: { hero: HeroRecord }) {
  const [url, setUrl] = useState<string | null>(() => getCachedPortrait(hero) ?? null);

  useEffect(() => {
    let alive = true;
    const cached = getCachedPortrait(hero);
    if (cached) {
      setUrl(cached);
      return;
    }
    requestPortrait(hero).then((rendered) => {
      if (alive && rendered) setUrl(rendered);
    });
    return () => {
      alive = false;
    };
  }, [hero]);

  return (
    <span
      className="relative inline-flex h-8 w-8 shrink-0 overflow-hidden rounded border border-[#c6a15b]/60 bg-[#231b13]"
      title={hero.name}
    >
      {url ? (
        <img
          src={url}
          alt={hero.name}
          className="h-full w-full object-cover object-top"
          draggable={false}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-[10px] font-bold text-[#fde68a]"
          style={{ backgroundColor: `${hero.bannerColor}33` }}
        >
          {hero.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function PartySlot({
  name,
  troops,
  hero,
  icon,
}: {
  name: string;
  troops: number;
  hero?: HeroRecord;
  icon?: 'player' | 'garrison';
}) {
  return (
    <div className="flex items-center justify-between gap-1.5 rounded border border-[#c6a15b]/25 bg-[#120e0a]/90 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {hero ? (
          <LordAvatar hero={hero} />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#c6a15b]/45 bg-[#241b12] text-[#fde68a]">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden="true"
            >
              {icon === 'garrison' ? (
                <path d="M5 20V8l3-2 4 2 4-2 3 2v12M9 20v-5h6v5" />
              ) : (
                <path d="M6 4v16M6 5h11l-2.5 3.5L17 12H6" />
              )}
            </svg>
          </span>
        )}
        <span className="truncate text-[11px] font-semibold text-[#f4ecd8]">{name}</span>
      </div>
      <span className="font-mono-tabular text-xs font-bold text-[#fde68a]">{troops}</span>
    </div>
  );
}

function SiegeEngineSlots({
  engines,
  engineHp,
  reserveCount,
}: {
  engines: SiegeEngineType[];
  engineHp: number[];
  reserveCount: number;
}) {
  const ranged = engines
    .map((engine, index) => ({ engine, hp: engineHp[index] ?? 100 }))
    .filter((entry) => entry.engine !== 'BATTERING_RAM' && entry.engine !== 'SIEGE_TOWER')
    .slice(0, SIEGE_RANGED_SLOTS);
  const ramIndex = engines.findIndex((engine) => engine === 'BATTERING_RAM');
  const ram = ramIndex >= 0 ? { engine: 'BATTERING_RAM' as const, hp: engineHp[ramIndex] ?? 100 } : null;
  const towers = engines
    .map((engine, index) => ({ engine, hp: engineHp[index] ?? 100 }))
    .filter((entry) => entry.engine === 'SIEGE_TOWER')
    .slice(0, 2);
  const slots: Array<{ label: string; entry: { engine: SiegeEngineType; hp: number } | null }> = [
    { label: 'M1', entry: ranged[0] ?? null },
    { label: 'M2', entry: ranged[1] ?? null },
    { label: 'M3', entry: ranged[2] ?? null },
    { label: 'M4', entry: ranged[3] ?? null },
    { label: 'Koçbaşı', entry: ram },
    { label: 'Kule 1', entry: towers[0] ?? null },
    { label: 'Kule 2', entry: towers[1] ?? null },
  ];

  return (
    <div className="border-t border-[#c6a15b]/20 px-4 py-2">
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-[#a89b84]">
        <span className="uppercase tracking-wider">Kuşatma Yuvaları</span>
        <span className="font-mono-tabular text-[#fde68a]">
          {engines.length}/7 · Rezerv: {reserveCount}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {slots.map((slot, index) => {
          const engine = slot.entry?.engine ?? null;
          const hp = Math.max(0, Math.min(100, slot.entry?.hp ?? 0));
          return (
            <div
              key={`${slot.label}-${index}`}
              title={engine ? `${ENGINE_LABELS[engine]} (%${hp})` : `${slot.label}: Boş yuva`}
              className={`flex h-9 flex-col items-center justify-center rounded border px-0.5 ${
                engine
                  ? 'border-[#c6a15b]/55 bg-[#221911] text-[#fde68a]'
                  : 'border-[#c6a15b]/15 bg-[#120e0a]/60 text-[#6e6253]'
              }`}
            >
              {engine ? (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  >
                    {engine === 'BATTERING_RAM' ? (
                      <path d="M4 18h16M7 18V9l5-3 5 3v9M9 13h6" />
                    ) : engine === 'SIEGE_TOWER' ? (
                      <path d="M7 20V6l5-2 5 2v14M7 10h10M7 15h10" />
                    ) : engine === 'BALLISTA' ? (
                      <path d="M4 12h16M8 7l8 5-8 5M12 6v12" />
                    ) : (
                      <path d="M4 19h16M7 19l5-12 5 12M6 9l11-4" />
                    )}
                  </svg>
                  <span className="mt-0.5 h-1 w-4/5 overflow-hidden rounded-full bg-black/60">
                    <span
                      className="block h-full bg-[#34d399]"
                      style={{ width: `${hp}%` }}
                    />
                  </span>
                </>
              ) : (
                <span className="text-[9px] font-mono-tabular">·</span>
              )}
              <span className="mt-0.5 truncate text-[8px] leading-none text-[#a89b84]">
                {slot.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SiegeIllustration({
  settlementName,
  factionColor,
}: {
  settlementName: string;
  factionColor: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    () => getCachedSiegeVignette(factionColor) ?? null,
  );

  useEffect(() => {
    let alive = true;
    const cached = getCachedSiegeVignette(factionColor);
    const url = cached === undefined ? renderSiegeVignette(factionColor) : cached;
    if (alive) setImageUrl(url);
    return () => {
      alive = false;
    };
  }, [factionColor]);

  return (
    <div className="relative h-36 shrink-0 overflow-hidden border-t border-[#c6a15b]/35 bg-[#111719]">
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`${settlementName} kuşatma cephesi`}
          className="absolute inset-0 h-full w-full object-cover"
          data-testid="siege-vignette"
        />
      )}
      <svg
        viewBox="0 0 360 240"
        preserveAspectRatio="xMidYMid slice"
        className={`absolute inset-0 h-full w-full ${imageUrl ? 'hidden' : ''}`}
        role="img"
        aria-label={`${settlementName} surları ve kuşatma kampı çizimi`}
      >
        <defs>
          <linearGradient id="siege-dusk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#182536" />
            <stop offset=".58" stopColor="#59434b" />
            <stop offset="1" stopColor="#c07a4d" />
          </linearGradient>
          <linearGradient id="siege-ground" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#47382c" />
            <stop offset=".55" stopColor="#302820" />
            <stop offset="1" stopColor="#201d1a" />
          </linearGradient>
          <linearGradient id="siege-wall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9b896e" />
            <stop offset="1" stopColor="#51483e" />
          </linearGradient>
        </defs>
        <rect width="360" height="240" fill="url(#siege-dusk)" />
        <circle cx="302" cy="47" r="17" fill="#e2bd80" opacity=".7" />
        <path d="m17 42 2-5 2 5m25 16 1.5-4 1.5 4m252-26 2-5 2 5" fill="#f2dfb5" opacity=".8" />
        <path d="M0 143 38 120 76 132 119 106 159 128 204 111 251 130 293 108 360 132V240H0Z" fill="#31333a" />
        <path d="M0 170 46 148 87 158 127 139 171 163 214 143 264 163 316 140 360 155V240H0Z" fill="#292c2d" />
        <path d="M0 177 55 164 104 176 159 159 211 178 265 163 316 179 360 166V240H0Z" fill="url(#siege-ground)" />
        <path d="M0 209 61 191 107 203 157 186 213 204 274 189 330 203 360 196V240H0Z" fill="#26221d" />

        <g stroke="#c3ad88" strokeWidth="2">
          <path d="M31 164V111l11-12 11 12v53m5 0V98l12-13 12 13v66m6 0v-51l10-11 10 11v51" fill="url(#siege-wall)" />
          <path d="M26 112h83v-8h-8V94h-9v10h-9V91h-9v13h-9V91h-9v13h-9V91h-9v13h-9V94h-9Z" fill="#82745f" />
          <path d="M29 164h81v9H29Z" fill="#49443c" stroke="none" />
          <path d="M44 164v-30h12v30m17 0v-36h12v36m17 0v-29h12v29" fill="#25272a" stroke="#514b42" />
          <path d="M45 100V78h7V62h7v38m21-16V67h7v-9h7v31m20 11V76h7V64h7v34" fill="#51493e" />
          <path d="M39 79h17m21-12h14m20 9h14" stroke="#c6a15b" strokeWidth="1.5" />
        </g>

        <g stroke="#c4a877" strokeWidth="1.5">
          <path d="M169 174V91l14-13 14 13v83m-28-62h28m-28 25h28m-28 24h28" fill="#665643" />
          <path d="m164 91 19-19 19 19M165 175h37" fill="#483b2d" />
          <path d="M175 107h17m-17 25h17m-17 25h17" stroke="#2c2925" strokeWidth="3" />
          <path d="M174 176v7m29-7v7m-34 0h39" stroke="#34291f" strokeWidth="3" />
        </g>
        <path d="M181 82V68h5v14m-9-14h13" stroke="#d2bc91" strokeWidth="2" />

        <g stroke="#b99a66" strokeWidth="2">
          <path d="M265 175h75m-63-3 19-14 20 14m-29-1v-46h5v45m0-42 31 14m-31-14-15-13" fill="none" />
          <path d="M293 124 310 128 305 137Z" fill="#d4b879" stroke="none" />
          <path d="M280 176h49m-42 0-5 8m40-8 5 8" fill="none" />
        </g>

        <path d="M115 192 127 178l13 14v13h-25Zm27 1 12-14 13 14v12h-25Zm35-2 13-15 14 15v13h-27Zm29 3 12-14 13 14v12h-25Z" fill="#846342" stroke="#d1b27a" strokeWidth="1.4" />
        <path d="m113 180 14-13 15 13m-1 0 12-12 14 12m20-1 14-14 16 14m-3 0 12-12 15 12" fill="#4b3928" stroke="#c6a15b" strokeWidth="1.5" />
        <path d="M123 185v17m24-17v17m23-16v16m27-17v17m23-16v16" stroke="#d9d0bf" strokeWidth="2" opacity=".75" />
        <path d="M0 211h360" stroke="#a98a58" strokeOpacity=".55" />

        <g fill="#17191b" stroke="#17191b" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="42" cy="195" r="4" /><path d="M42 199v25m0-17-7 8m7-7 7 6m-2-24-11-28" />
          <circle cx="92" cy="202" r="4" /><path d="M92 206v24m0-16-7 8m7-8 7 7m-2-24-12-32" />
          <circle cx="245" cy="201" r="4" /><path d="M245 205v25m0-17-7 8m7-8 7 7m-2-24 12-35" />
          <circle cx="330" cy="196" r="4" /><path d="M330 200v27m0-18-7 9m7-9 8 7m-2-27-10-29" />
        </g>
        <path d="M0 231 55 223 102 232 156 222 205 233 260 224 311 232 360 223V240H0Z" fill="#171715" opacity=".7" />
      </svg>
      <div className="absolute bottom-1 left-2 rounded bg-[#120f0c]/75 px-1.5 py-0.5 font-display text-[8px] tracking-[0.12em] text-[#e3c57d]">
        KUŞATMA CEPHESİ
      </div>
    </div>
  );
}

export const SiegeEncounterModal: React.FC<SiegeEncounterModalProps> = ({
  view,
  campaign,
  onClose,
  onOpenSiegeCamp,
  onAssaultBreach,
  onAssaultRam,
  onLiftSiege,
  onAttackBesiegers,
  onBreakIn,
  onObserve,
  onDefendWalls,
  onSallyOut,
  onTalkSurrender,
}) => {
  const { settlement, role, besiegers } = view;
  const combinedBesiegerLord = useMemo(
    () => combineBesiegerForces(besiegers),
    [besiegers],
  );
  const defenderFaction = FACTION_INFO[settlement.faction];
  const attackerFaction = FACTION_INFO[view.attackerFaction];
  const playerTroops = getTotalTroops(campaign.roster);
  const lossPct = Math.round(breakInLossRate(campaign.day) * 100);
  const estBreakLoss = Math.max(1, Math.round((playerTroops * lossPct) / 100));

  const heroRegistry = useMemo(() => {
    const factionNames = Object.fromEntries(
      Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
    );
    return buildHeroRegistry(campaign, factionNames).heroes;
  }, [campaign]);

  const totalPower = Math.max(1, view.attackerTroops + view.defenderTroops);
  const attackerRatio = Math.max(10, Math.min(90, Math.round((view.attackerTroops / totalPower) * 100)));

  const renderLordRow = (lord: LordAgent) => {
    const hero = heroRegistry[lord.id];
    const troops = Math.max(1, lord.armySize || getTotalTroops(lord.roster));
    return <PartySlot key={lord.id} name={lord.name} troops={troops} hero={hero} />;
  };

  const foodDaysLeft = Math.max(0, Math.ceil((settlement.foodStock ?? 0) / 3));

  return (
    <div
      data-testid="siege-encounter-modal"
      className="fixed inset-0 z-50 pointer-events-none flex items-stretch justify-start p-3 sm:p-4"
    >
      {/* Bannerlord Üst Orta Kuşatma Karşılaşma Barı (Top-Center Siege Header) */}
      <div
        data-testid="siege-top-banner"
        className="pointer-events-auto fixed top-2.5 left-[calc(50%+185px)] z-50 hidden -translate-x-1/2 items-stretch rounded border-2 border-[#c6a15b]/80 bg-[#14100c]/95 text-[#f4ecd8] shadow-[0_10px_35px_rgba(0,0,0,0.9)] backdrop-blur-sm xl:flex"
      >
        {/* Sol: Kuşatan Partiler */}
        <div className="flex items-center gap-1.5 border-r border-[#c6a15b]/35 px-3 py-1.5">
          {role === 'attacker' && (
            <div className="flex flex-col items-center rounded border border-[#c6a15b]/45 bg-[#1f1812] px-2 py-1 min-w-[72px]">
              <span className="text-[11px] font-mono-tabular font-bold text-[#fde68a]">{playerTroops}</span>
              <span className="max-w-[76px] truncate text-[9px] text-[#86efac]">{campaign.playerName}</span>
            </div>
          )}
          {besiegers.slice(0, 3).map((lord) => {
            const hero = heroRegistry[lord.id];
            const troops = Math.max(1, lord.armySize || getTotalTroops(lord.roster));
            return (
              <div
                key={`top-${lord.id}`}
                className="flex items-center gap-1.5 rounded border border-[#c6a15b]/45 bg-[#1f1812] px-2 py-1"
              >
                {hero && <LordAvatar hero={hero} />}
                <div className="min-w-0">
                  <div className="text-[11px] font-mono-tabular font-bold text-[#fde68a]">{troops}</div>
                  <div className="max-w-[78px] truncate text-[9px] text-[#fca5a5]">{lord.name}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Orta: Sancaklar + Asker Karşılaştırması + Güç Çubuğu + Erzak Günü */}
        <div className="flex items-center gap-3 px-4 py-1.5">
          <div className="flex flex-col items-center text-[10px] text-[#d1c5b0]">
            <CrestBadge color={attackerFaction.color} variant="sword" />
            <span className="mt-0.5 font-mono-tabular text-[9px] text-[#fbbf24]">
              {(settlement.siegeEngines ?? []).length}/7 Silah
            </span>
          </div>

          <div className="flex min-w-[175px] flex-col items-center">
            <div className="font-display text-xs font-bold uppercase tracking-[0.22em] text-[#e2d6c1]">
              Kuşatma
            </div>
            <div className="mt-0.5 flex items-center gap-2 font-display text-base font-extrabold text-[#fde68a]">
              <span className="font-mono-tabular">{view.attackerTroops}</span>
              <span className="text-xs text-[#c6a15b]">vs</span>
              <span className="font-mono-tabular">{view.defenderTroops}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full border border-[#c6a15b]/45 bg-[#3b1d5e]">
              <div
                className="h-full bg-gradient-to-r from-[#b45309] to-[#f59e0b]"
                style={{ width: `${attackerRatio}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col items-center text-[10px] text-[#d1c5b0]">
            <CrestBadge color={defenderFaction.color} variant="castle" />
            <span className="mt-0.5 font-mono-tabular text-[9px] text-[#93c5fd]">
              {foodDaysLeft} gün erzak
            </span>
          </div>
        </div>

        {/* Sağ: Savunan Garnizon / Milis / İçerideki Parti */}
        <div className="flex items-center gap-1.5 border-l border-[#c6a15b]/35 px-3 py-1.5">
          <div className="flex flex-col items-center rounded border border-[#c6a15b]/45 bg-[#1f1812] px-2 py-1 min-w-[70px]">
            <span className="text-[11px] font-mono-tabular font-bold text-[#fde68a]">{settlement.garrison}</span>
            <span className="text-[9px] text-[#93c5fd]">Garnizon</span>
          </div>
          {(settlement.militia ?? 0) > 0 && (
            <div className="flex flex-col items-center rounded border border-[#c6a15b]/45 bg-[#1f1812] px-2 py-1 min-w-[64px]">
              <span className="text-[11px] font-mono-tabular font-bold text-[#fde68a]">{settlement.militia}</span>
              <span className="text-[9px] text-[#cbd5e1]">Milis</span>
            </div>
          )}
          {role === 'defender' && (
            <div className="flex flex-col items-center rounded border border-[#c6a15b]/45 bg-[#1f1812] px-2 py-1 min-w-[72px]">
              <span className="text-[11px] font-mono-tabular font-bold text-[#fde68a]">{playerTroops}</span>
              <span className="max-w-[76px] truncate text-[9px] text-[#86efac]">{campaign.playerName}</span>
            </div>
          )}
        </div>
      </div>

      <aside className="pointer-events-auto flex w-full max-w-[425px] flex-col overflow-hidden rounded border-2 border-[#c6a15b]/80 bg-[#14100c]/95 text-[#f4ecd8] shadow-[0_0_50px_rgba(0,0,0,0.92)] backdrop-blur-sm">
        {/* Başlık */}
        <header className="border-b border-[#c6a15b]/35 bg-gradient-to-b from-[#251c13] to-[#17120d] px-4 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c6a15b]">
                {settlement.type === 'CASTLE' ? 'Kale Kuşatma Durumu' : 'Şehir Kuşatma Durumu'}
              </div>
              <h2 className="font-display text-lg font-bold text-[#fde68a]">
                {settlement.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#c6a15b]/40 bg-[#1f1812] px-2.5 py-1 text-xs font-semibold text-[#d6c8b0] hover:border-[#fbbf24] hover:text-white"
            >
              Kapat
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-[#d1c5b0]">
            {defenderFaction.name} · Kuşatan:{' '}
            {besiegers.length > 1
              ? `${besiegers[0].name} ve ${besiegers.length - 1} müttefik komutan (${view.attackerTroops} asker)`
              : (besiegers[0]?.name ?? campaign.playerName)}{' '}
            · Erzak: {settlement.foodStock} ({foodDaysLeft} gün)
          </p>
        </header>

        {/* İki sütunlu kuvvet tablosu (Bannerlord karşılaşma paneli düzeni) */}
        <section className="border-b border-[#c6a15b]/25 bg-[#19130e] px-4 py-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CrestBadge color={attackerFaction.color} variant="sword" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#fca5a5]">Kuşatan</div>
                <div className="text-xs font-bold text-[#f4ecd8]">{attackerFaction.name}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#93c5fd]">Savunan</div>
                <div className="text-xs font-bold text-[#f4ecd8]">{defenderFaction.name}</div>
              </div>
              <CrestBadge color={defenderFaction.color} variant="castle" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-1">
              {role === 'attacker' && (
                <PartySlot name={campaign.playerName} troops={playerTroops} icon="player" />
              )}
              {besiegers.slice(0, 2).map(renderLordRow)}
              {besiegers.length > 2 && (
                <div className="rounded border border-[#c6a15b]/20 bg-[#140f0a] px-2 py-0.5 text-center text-[10px] text-[#fde68a]">
                  +{besiegers.length - 2} sancakbeyi daha müşterek kuşatmada
                </div>
              )}
              {besiegers.length === 0 && role !== 'attacker' && (
                <PartySlot name="Kuşatma Ordusu" troops={view.attackerTroops} icon="player" />
              )}
            </div>
            <div className="space-y-1">
              <PartySlot name="Garnizon" troops={settlement.garrison} icon="garrison" />
              {role === 'defender' && (
                <PartySlot name={campaign.playerName} troops={playerTroops} icon="player" />
              )}
            </div>
          </div>

          {/* Güç oranı çubuğu */}
          <div className="mt-2">
            <div className="h-1.5 overflow-hidden rounded-full border border-[#c6a15b]/35 bg-[#1d3557]">
              <div
                className="h-full bg-gradient-to-r from-[#b45309] to-[#f59e0b]"
                style={{ width: `${attackerRatio}%` }}
              />
            </div>
          </div>
        </section>

        {/* 4 menzilli + koçbaşı + 2 kule yuvaları */}
        <SiegeEngineSlots
          engines={settlement.siegeEngines ?? []}
          engineHp={settlement.siegeEngineHp ?? []}
          reserveCount={(settlement.reserveEngines ?? []).length}
        />

        {/* Sur ve kamp ilerleme çubukları */}
        <section className="space-y-1.5 border-b border-[#c6a15b]/25 bg-[#15100b] px-4 py-2 text-xs">
          <div>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="uppercase tracking-wider text-[#a89b84]">Sol Sur</span>
              <span className="font-mono-tabular font-bold text-[#34d399]">
                %{view.wallSections[0]} {view.wallSections[0] <= 0 ? '· GEDİK' : ''}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/60">
              <div
                className="h-full bg-[#10b981] transition-all"
                style={{ width: `${view.wallSections[0]}%` }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="uppercase tracking-wider text-[#a89b84]">Sağ Sur</span>
              <span className="font-mono-tabular font-bold text-[#34d399]">
                %{view.wallSections[1]} {view.wallSections[1] <= 0 ? '· GEDİK' : ''}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/60">
              <div
                className="h-full bg-[#10b981] transition-all"
                style={{ width: `${view.wallSections[1]}%` }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="uppercase tracking-wider text-[#a89b84]">Kamp Hazırlığı</span>
              <span className="font-mono-tabular font-bold text-[#fbbf24]">%{view.campProgress}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/60">
              <div
                className="h-full bg-[#d97706] transition-all"
                style={{ width: `${view.campProgress}%` }}
              />
            </div>
          </div>
        </section>

        {/* Eylemler */}
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-2.5">
          {role === 'attacker' && (
            <>
              <ActionButton
                testId="siege-action-camp"
                icon="camp"
                title="Kuşatma Kampı"
                subtitle={view.campReady ? 'Mancınık, koçbaşı, kule ve bombardıman yönetimi' : 'Kamp kurulumu sürüyor'}
                onClick={onOpenSiegeCamp}
              />
              <ActionButton
                testId="siege-action-breach"
                icon="breach"
                title="Sur Gediklerinden Hücum Et"
                subtitle={view.breached ? 'Gedikler açık — piyade ve süvari doğrudan dalar' : 'Önce bir sur bölümünde gedik aç'}
                disabled={!view.breached}
                primary
                onClick={onAssaultBreach}
              />
              <ActionButton
                testId="siege-action-ram"
                icon="ram"
                title="Koçbaşıyla Kapıyı Zorla"
                subtitle={view.hasRam || view.hasTower ? 'Koçbaşı ve kulelerle taarruz' : 'Merdivenlerle surlara tırman'}
                primary={!view.breached}
                onClick={onAssaultRam}
              />
              <ActionButton
                testId="siege-action-lift"
                icon="retreat"
                title="Kuşatmayı Kaldır"
                subtitle="Kampı sök ve geri çekil"
                onClick={onLiftSiege}
              />
            </>
          )}

          {role === 'outsider' && (
            <>
              <ActionButton
                testId="siege-action-attack-camp"
                icon="attack"
                title="Kuşatan Orduya Taarruz"
                subtitle={
                  besiegers.length > 1
                    ? `${besiegers[0].name} ve ${besiegers.length - 1} müttefikinin (${view.attackerTroops} asker) müşterek ordusuna meydan muharebesi aç`
                    : `${besiegers[0]?.name ?? 'Düşman'} kampına meydan muharebesi aç`
                }
                disabled={!combinedBesiegerLord}
                primary
                onClick={() => combinedBesiegerLord && onAttackBesiegers(combinedBesiegerLord)}
              />
              <ActionButton
                testId="siege-action-break-in"
                icon="breakIn"
                title="Hatları Yarıp Kaleye Gir"
                subtitle={`Savunmaya katıl (~%${lossPct} zayiat, yaklaşık ${estBreakLoss} asker)`}
                disabled={playerTroops <= 1}
                onClick={onBreakIn}
              />
              <ActionButton
                testId="siege-action-observe"
                icon="observe"
                title="Uzaktan Gözlemle"
                subtitle="Müdahale etmeden haritaya dön"
                onClick={onObserve}
              />
            </>
          )}

          {role === 'defender' && (
            <>
              <ActionButton
                testId="siege-action-defend"
                icon="defend"
                title="Sur Savunmasını Yönet"
                subtitle="Mazgallardan kuşatmacıları püskürt"
                primary
                onClick={onDefendWalls}
              />
              <ActionButton
                testId="siege-action-sally"
                icon="sally"
                title="Huruc Harekâtı (Sally Out)"
                subtitle={
                  besiegers.length > 1
                    ? `Kapıdan fırlayıp ${besiegers.length} komutanın (${view.attackerTroops} asker) müşterek kuşatma kampına saldır`
                    : 'Kapıdan fırlayıp kuşatma kampına saldır'
                }
                onClick={() => onSallyOut(combinedBesiegerLord)}
              />
              <ActionButton
                testId="siege-action-surrender"
                icon="talk"
                title="Elçi Gönder / Teslim Müzakeresi"
                subtitle="Kuşatan komutanla şartları görüş"
                onClick={onTalkSurrender}
              />
            </>
          )}
        </div>

        {/* Alt kısım: sahne illüstrasyonu */}
        <SiegeIllustration
          settlementName={settlement.name}
          factionColor={defenderFaction.color}
        />
      </aside>
    </div>
  );
};

interface ActionButtonProps {
  testId: string;
  icon: ActionIconName;
  title: string;
  subtitle: string;
  disabled?: boolean;
  primary?: boolean;
  onClick: () => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  testId,
  icon,
  title,
  subtitle,
  disabled,
  primary,
  onClick,
}) => (
  <button
    type="button"
    data-testid={testId}
    disabled={disabled}
    onClick={onClick}
    className={`w-full rounded border px-3 py-2 text-left transition-all ${
      disabled
        ? 'cursor-not-allowed border-[#c6a15b]/15 bg-[#1a1510]/60 opacity-45'
        : primary
          ? 'border-[#d97706] bg-gradient-to-r from-[#3b1d12] to-[#26160e] hover:border-[#fbbf24]'
          : 'border-[#c6a15b]/35 bg-[#1e1812] hover:border-[#fbbf24] hover:bg-[#282017]'
    }`}
  >
    <div className="flex items-center gap-2.5">
      <ActionIcon name={icon} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-[#fde68a]">{title}</div>
        <div className="mt-0.5 text-[10px] leading-tight text-[#c7baa5]">{subtitle}</div>
      </div>
    </div>
  </button>
);
