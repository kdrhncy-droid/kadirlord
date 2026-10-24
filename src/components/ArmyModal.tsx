import React, { useMemo, useState } from 'react';
import {
  type CampaignState,
  FACTION_INFO,
  type LordAgent,
  calculatePartyStrength,
  getTotalTroops,
} from '../game/rules';
import {
  type ArmyRecord,
  calculateCohesionBoostCost,
  calculatePartyCallInfluenceCost,
  getArmyCohesionBreakdown,
  getArmyTotalTroops,
  getCallableLordsForPlayer,
  getPlayerArmy,
  isPlayerClanParty,
} from '../game/armySystem';
import { buildHeroRegistry, type HeroRecord } from '../game/heroes';
import { getCachedPortrait } from '../game/portraitRenderer';

export interface ArmyModalProps {
  campaign: CampaignState;
  onClose: () => void;
  onCreateOrExpandArmy: (selectedLordIds: string[], targetSettlementId?: string) => void;
  onBoostCohesion: () => void;
  onRemoveMember: (lordId: string) => void;
  onDisbandArmy: () => void;
  onSelectTargetSettlement: (settlementId: string | undefined) => void;
}

function PortraitThumb({
  hero,
  fallbackText,
  bannerColor,
  factionGlyph,
  size = 'md',
}: {
  hero?: HeroRecord;
  fallbackText: string;
  bannerColor: string;
  factionGlyph?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const url = hero ? getCachedPortrait(hero) : null;

  const sizeCls =
    size === 'lg'
      ? 'h-20 w-full'
      : size === 'md'
        ? 'h-10 w-10'
        : 'h-8 w-8';

  if (url) {
    return (
      <img
        src={url}
        alt={fallbackText}
        className={`${sizeCls} object-cover object-top select-none`}
      />
    );
  }

  return (
    <div
      className={`${sizeCls} relative flex flex-col items-center justify-center overflow-hidden font-display font-bold text-[#fde68a]`}
      style={{
        background: `radial-gradient(circle at 50% 28%, ${bannerColor}cc, #17110b 88%)`,
      }}
    >
      {/* Miğfer & Omuzluk Silüeti */}
      <svg
        viewBox="0 0 64 64"
        className={size === 'lg' ? 'h-16 w-16 opacity-90' : 'h-8 w-8 opacity-90'}
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M14 58c2-13 10-20 18-20s16 7 18 20"
          fill="#261c14"
          stroke="#c6a15b"
          strokeWidth="2.2"
        />
        <path
          d="M21 26c0-8 5-14 11-14s11 6 11 14v7c0 4-5 7-11 7s-11-3-11-7v-7z"
          fill="#3a2d20"
          stroke="#fde68a"
          strokeWidth="2"
        />
        <path d="M32 14v22M24 25h16" stroke="#fde68a" strokeWidth="2" />
      </svg>
      {factionGlyph && size === 'lg' && (
        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] font-bold text-[#fde68a]">
          SANCAK
        </span>
      )}
    </div>
  );
}

export const ArmyModal: React.FC<ArmyModalProps> = ({
  campaign,
  onClose,
  onCreateOrExpandArmy,
  onBoostCohesion,
  onRemoveMember,
  onDisbandArmy,
  onSelectTargetSettlement,
}) => {
  const playerArmy: ArmyRecord | null = useMemo(() => getPlayerArmy(campaign), [campaign]);
  const callableLords = useMemo(() => getCallableLordsForPlayer(campaign), [campaign]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetSettlementId, setTargetSettlementId] = useState<string>(
    playerArmy?.targetSettlementId ??
      (campaign.playerSiege && !campaign.playerSiege.inside
        ? campaign.playerSiege.settlementId
        : ''),
  );

  const heroRegistry = useMemo(() => {
    const factionNames = Object.fromEntries(
      Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
    );
    return buildHeroRegistry(campaign, factionNames).heroes;
  }, [campaign]);

  const playerInfluence = Math.round(campaign.influence ?? 0);
  const playerTroops = getTotalTroops(campaign.roster);

  const currentMemberLords: LordAgent[] = useMemo(() => {
    if (!playerArmy) return [];
    return campaign.lords.filter((l) => playerArmy.memberLordIds.includes(l.id));
  }, [campaign.lords, playerArmy]);

  const selectedLordObjects: LordAgent[] = useMemo(
    () => callableLords.filter((l) => selectedIds.includes(l.id)),
    [callableLords, selectedIds],
  );

  const totalCallCost = useMemo(
    () =>
      selectedLordObjects.reduce(
        (sum, lord) =>
          sum +
          calculatePartyCallInfluenceCost(lord, campaign, {
            x: campaign.playerX,
            z: campaign.playerZ,
          }),
        0,
      ),
    [selectedLordObjects, campaign],
  );

  const previewArmy: ArmyRecord = useMemo(
    () => ({
      id: playerArmy?.id ?? 'preview-army',
      name: playerArmy?.name ?? `${campaign.playerName} Ordusu`,
      faction: playerArmy?.faction ?? 'player',
      leaderId: 'player',
      memberLordIds: [
        ...(playerArmy?.memberLordIds ?? []),
        ...selectedIds.filter((id) => !playerArmy?.memberLordIds.includes(id)),
      ],
      cohesion: playerArmy?.cohesion ?? 100,
      targetSettlementId: targetSettlementId || undefined,
    }),
    [playerArmy, campaign.playerName, selectedIds, targetSettlementId],
  );

  const cohesionBreakdown = useMemo(
    () => getArmyCohesionBreakdown(previewArmy, campaign),
    [previewArmy, campaign],
  );

  const previewTotalTroops = useMemo(
    () => getArmyTotalTroops(previewArmy, campaign),
    [previewArmy, campaign],
  );

  const previewStrength = useMemo(() => {
    const playerStr = calculatePartyStrength(campaign.roster, 1.0);
    const membersStr = campaign.lords
      .filter((l) => previewArmy.memberLordIds.includes(l.id))
      .reduce(
        (sum, l) =>
          sum +
          calculatePartyStrength(
            l.roster ?? {
              militia: Math.floor(l.armySize * 0.4),
              archer: Math.floor(l.armySize * 0.3),
              cavalry: Math.floor(l.armySize * 0.2),
              guard: Math.floor(l.armySize * 0.1),
            },
            1.0,
          ),
        0,
      );
    return Math.round(playerStr + membersStr);
  }, [campaign.roster, campaign.lords, previewArmy.memberLordIds]);

  const boostCost = useMemo(
    () => calculateCohesionBoostCost(previewArmy, campaign),
    [previewArmy, campaign],
  );

  const targetableSettlements = useMemo(
    () =>
      campaign.settlements
        .filter((s) => s.type !== 'VILLAGE')
        .sort((a, b) => {
          const da = Math.hypot(a.x - campaign.playerX, a.z - campaign.playerZ);
          const db = Math.hypot(b.x - campaign.playerX, b.z - campaign.playerZ);
          return da - db;
        })
        .slice(0, 18),
    [campaign.settlements, campaign.playerX, campaign.playerZ],
  );

  const toggleSelectLord = (lordId: string) => {
    setSelectedIds((prev) =>
      prev.includes(lordId) ? prev.filter((id) => id !== lordId) : [...prev, lordId],
    );
  };

  const canAffordCall = playerInfluence >= totalCallCost;
  const canConfirmCall =
    selectedIds.length > 0 && canAffordCall && previewArmy.memberLordIds.length > 0;

  return (
    <div
      data-testid="army-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border-2 border-[#c6a15b]/80 bg-[#19140f] text-[#f4ecd8]">
        {/* Üst Kemer Başlık & Sağ Üst Uyum (Cohesion) Kontrolü — Bannerlord Army Management Düzeni */}
        <header className="relative flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#c6a15b]/45 bg-gradient-to-b from-[#2b2117] to-[#1a140e] px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded border border-[#c6a15b]/60 bg-[#140f0a] text-sm font-bold text-[#fbbf24]">
              ORDU
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c6a15b]">
                Krallık Sancak Meclisi · Ordu & Uyum Yönetimi
              </div>
              <h2 className="font-display text-2xl font-bold tracking-wide text-[#fde68a]">
                {playerArmy ? playerArmy.name : 'Ordu Yönetimi (Army Management)'}
              </h2>
            </div>
          </div>

          {/* Sağ Üst: Cohesion Bar + [+10] Butonu + Beklenen Günlük Değişim */}
          <div className="flex items-center gap-4">
            <div
              className="rounded border border-[#c6a15b]/45 bg-[#120e0a]/95 px-3.5 py-2"
              title={`Baz ${cohesionBreakdown.baseLoss} · Parti ${cohesionBreakdown.partyCountPenalty}${cohesionBreakdown.starvationPenalty < 0 ? ` · Açlık ${cohesionBreakdown.starvationPenalty}` : ''}`}
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase tracking-wider text-[#d6c8b0]">
                  Uyum (Cohesion):{' '}
                  <span className="font-mono-tabular text-base text-[#fbbf24]">
                    {Math.round(previewArmy.cohesion)}
                  </span>
                  <span className="text-[11px] text-[#a89b84]">/100</span>
                </span>
                <span className="font-mono-tabular text-[11px] font-semibold text-[#fca5a5]">
                  {cohesionBreakdown.totalDailyChange}/gün
                </span>
              </div>
              <div className="mt-1.5 h-2.5 w-48 overflow-hidden rounded-sm border border-[#c6a15b]/40 bg-black/80">
                <div
                  className={`h-full transition-all ${
                    previewArmy.cohesion > 50
                      ? 'bg-gradient-to-r from-[#b45309] via-[#d97706] to-[#fbbf24]'
                      : previewArmy.cohesion > 25
                        ? 'bg-gradient-to-r from-[#b45309] to-[#f97316]'
                        : 'bg-gradient-to-r from-[#7f1d1d] to-[#ef4444]'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, previewArmy.cohesion))}%` }}
                />
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-[#a89b84]">
                <span>Baz {cohesionBreakdown.baseLoss}</span>
                <span>·</span>
                <span>Parti {cohesionBreakdown.partyCountPenalty}</span>
                {cohesionBreakdown.starvationPenalty < 0 && (
                  <>
                    <span>·</span>
                    <span className="font-bold text-[#fca5a5]">
                      Açlık {cohesionBreakdown.starvationPenalty}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Bannerlord [+10] Cohesion Boost Butonu */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="army-cohesion-boost-btn"
                disabled={
                  !playerArmy ||
                  playerArmy.cohesion >= 100 ||
                  playerInfluence < boostCost
                }
                onClick={onBoostCohesion}
                className={`flex items-center gap-2 rounded border-2 px-3.5 py-2 text-xs font-bold transition-all ${
                  playerArmy && playerArmy.cohesion < 100 && playerInfluence >= boostCost
                    ? 'border-[#fbbf24] bg-gradient-to-b from-[#45270d] to-[#291708] text-[#fde68a] hover:bg-[#573210]'
                    : 'cursor-not-allowed border-[#c6a15b]/25 bg-[#17120d] text-[#786b59] opacity-55'
                }`}
              >
                <span className="text-sm font-extrabold">+10</span>
                <span className="font-mono-tabular text-[#fbbf24]">★ {boostCost}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded border border-[#c6a15b]/45 bg-[#241b13] px-3 py-2 text-xs font-bold text-[#e5d8c1] hover:border-[#fbbf24] hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        </header>

        {/* Ana Gövde: Sol 6 Sütunlu Parti Tablosu + Sağ 4 Sütunlu 3B Portre Izgarası */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-12">
          {/* SOL PANEL (7/12): Bannerlord 6 Sütunlu Çağrılabilir Partiler Tablosu */}
          <section className="flex flex-col overflow-hidden rounded border-2 border-[#c6a15b]/45 bg-[#140f0b] lg:col-span-7">
            {/* Tablo Sütun Başlıkları */}
            <div className="grid grid-cols-12 items-center border-b border-[#c6a15b]/40 bg-[#231b13] px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#d6c8b0]">
              <div className="col-span-2">Birlik</div>
              <div className="col-span-4">Komutan Adı</div>
              <div className="col-span-2 text-center">Klan</div>
              <div className="col-span-1 text-center">Asker</div>
              <div className="col-span-1 text-center">Bedel</div>
              <div className="col-span-2 text-right">Mesafe</div>
            </div>

            <div className="max-h-[420px] flex-1 divide-y divide-[#c6a15b]/15 overflow-y-auto">
              {callableLords.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#9c8e78]">
                  Şu an sancağınıza çağrılabilecek uygun bir müttefik veya klan partisi bulunmuyor.
                </div>
              ) : (
                callableLords.map((lord) => {
                  const isSelected = selectedIds.includes(lord.id);
                  const cost = calculatePartyCallInfluenceCost(lord, campaign, {
                    x: campaign.playerX,
                    z: campaign.playerZ,
                  });
                  const dist = Math.round(
                    Math.hypot(lord.x - campaign.playerX, lord.z - campaign.playerZ),
                  );
                  const travelDays = Math.max(0, Math.round(dist / 28));
                  const troops = Math.max(1, lord.armySize || getTotalTroops(lord.roster));
                  const ownClan = isPlayerClanParty(lord);
                  const factionInfo = FACTION_INFO[lord.faction] ?? FACTION_INFO.empire;
                  const hero = heroRegistry[lord.id];

                  return (
                    <div
                      key={lord.id}
                      data-testid={`army-candidate-${lord.id}`}
                      onClick={() => toggleSelectLord(lord.id)}
                      className={`grid cursor-pointer grid-cols-12 items-center px-3 py-2 transition-all ${
                        isSelected
                          ? 'bg-gradient-to-r from-[#5a3b19]/90 via-[#462d13]/85 to-[#33200d]/85 text-[#fde68a]'
                          : 'bg-[#18120d]/90 hover:bg-[#241b13]'
                      }`}
                    >
                      {/* Sütun 1: Seçim Tiki + 3B Portre */}
                      <div className="col-span-2 flex items-center gap-2">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-extrabold ${
                            isSelected
                              ? 'border-[#4ade80] bg-[#14532d] text-[#4ade80]'
                              : 'border-[#c6a15b]/40 bg-black/50 text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                        <div className="overflow-hidden rounded border border-[#c6a15b]/50 bg-[#120e0a]">
                          <PortraitThumb
                            hero={hero}
                            fallbackText={lord.name}
                            bannerColor={lord.bannerColor || factionInfo.color}
                            size="md"
                          />
                        </div>
                      </div>

                      {/* Sütun 2: Komutan Adı & Ünvanı */}
                      <div className="col-span-4 min-w-0 pr-2">
                        <div className="truncate text-xs font-bold text-[#f4ecd8]">
                          {lord.name} Birliği
                        </div>
                        <div className="truncate text-[10px] text-[#b8a992]">
                          {ownClan ? 'Kendi Klanın' : lord.title} · İlişki{' '}
                          {lord.relation >= 0 ? `+${lord.relation}` : lord.relation}
                        </div>
                      </div>

                      {/* Sütun 3: Klan Arması */}
                      <div className="col-span-2 flex justify-center">
                        <span
                          className="inline-flex h-7 w-7 items-center justify-center rounded-b-lg border border-[#fde68a]/55 font-display text-[10px] font-bold text-[#fde68a] shadow-inner"
                          style={{ backgroundColor: factionInfo.color }}
                          title={factionInfo.name}
                        >
                          {factionInfo.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>

                      {/* Sütun 4: Asker Sayısı */}
                      <div className="col-span-1 text-center font-mono-tabular text-xs font-bold text-[#f4ecd8]">
                        {troops}
                      </div>

                      {/* Sütun 5: Nüfuz Maliyeti */}
                      <div className="col-span-1 text-center font-mono-tabular text-xs font-bold">
                        {ownClan ? (
                          <span className="text-[#86efac]" title="Kendi Klanın (0 Nüfuz)">
                            0 ★
                          </span>
                        ) : (
                          <span className="text-[#fbbf24]">{cost} ★</span>
                        )}
                      </div>

                      {/* Sütun 6: Mesafe */}
                      <div className="col-span-2 text-right text-[11px] font-semibold text-[#d6c8b0]">
                        {dist <= 35 ? (
                          <span className="text-[#86efac]">Yakında</span>
                        ) : (
                          <span>
                            {travelDays} gün ({dist}m)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* SAĞ PANEL (5/12): Bannerlord 4 Sütunlu 3B Portre Kart Izgarası + Orduyu Dağıt */}
          <section className="flex flex-col justify-between overflow-hidden rounded border-2 border-[#c6a15b]/45 bg-[#140f0b] p-4 lg:col-span-5">
            <div>
              <div className="mb-3 flex items-center justify-between border-b border-[#c6a15b]/30 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#fde68a]">
                  Ordu Sancağı Altındaki Komutanlar ({1 + previewArmy.memberLordIds.length})
                </span>
                <span className="font-mono-tabular text-xs font-bold text-[#fbbf24]">
                  {previewTotalTroops} Asker
                </span>
              </div>

              {/* 4 Sütunlu Portre Izgarası (Bannerlord Army Management Right Grid) */}
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {/* 1. Kart: Ordu Komutanı (Oyuncu) */}
                <div className="flex flex-col items-center">
                  <div className="relative w-full overflow-hidden rounded border-2 border-[#fbbf24] bg-[#241a10] shadow-md">
                    <PortraitThumb
                      hero={heroRegistry.player}
                      fallbackText={campaign.playerName}
                      bannerColor="#d97706"
                      size="lg"
                    />
                    <span className="absolute top-1 right-1 rounded bg-black/80 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-[#fde68a]">
                      {playerTroops}
                    </span>
                    <div className="truncate bg-[#2d1f11]/95 px-1.5 py-1 text-center text-[10px] font-bold text-[#fde68a]">
                      {campaign.playerName}
                    </div>
                  </div>
                  <div className="mt-1 text-center text-[10px] font-semibold text-[#86efac]">
                    Ordu Komutanı
                  </div>
                </div>

                {/* Mevcut Ordu Üyesi Lordlar */}
                {currentMemberLords.map((lord) => {
                  const hero = heroRegistry[lord.id];
                  const troops = Math.max(1, lord.armySize || getTotalTroops(lord.roster));
                  const factionInfo = FACTION_INFO[lord.faction] ?? FACTION_INFO.empire;
                  return (
                    <div key={lord.id} className="flex flex-col items-center">
                      <div className=" relative w-full overflow-hidden rounded border border-[#c6a15b]/65 bg-[#1e1710] shadow">
                        <PortraitThumb
                          hero={hero}
                          fallbackText={lord.name}
                          bannerColor={lord.bannerColor || factionInfo.color}
                          factionGlyph={factionInfo.glyph}
                          size="lg"
                        />
                        <span className="absolute top-1 left-1 rounded bg-black/80 px-1 py-0.5 font-mono-tabular text-[10px] font-bold text-[#fde68a]">
                          {troops}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveMember(lord.id)}
                          title={`${lord.name} birliğini ordudan ayır`}
                          className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#ef4444]/60 bg-black/85 text-[9px] font-bold text-[#fca5a5] hover:bg-[#7f1d1d]"
                        >
                          ✕
                        </button>
                        <div className="truncate bg-[#231a12]/95 px-1.5 py-1 text-center text-[10px] font-semibold text-[#f4ecd8]">
                          {lord.name}
                        </div>
                      </div>
                      <div className="mt-1 text-center text-[10px] leading-tight text-[#d6c8b0]">
                        <div>Yakında</div>
                        <div className="text-[#86efac]">Orduda</div>
                      </div>
                    </div>
                  );
                })}

                {/* Yeni Seçilen (Çağrılacak) Aday Lordlar */}
                {selectedLordObjects.map((lord) => {
                  const hero = heroRegistry[lord.id];
                  const troops = Math.max(1, lord.armySize || getTotalTroops(lord.roster));
                  const cost = calculatePartyCallInfluenceCost(lord, campaign, {
                    x: campaign.playerX,
                    z: campaign.playerZ,
                  });
                  const factionInfo = FACTION_INFO[lord.faction] ?? FACTION_INFO.empire;
                  return (
                    <div key={`sel-${lord.id}`} className="flex flex-col items-center">
                      <div className="relative w-full overflow-hidden rounded border-2 border-dashed border-[#4ade80] bg-[#1a2418] shadow">
                        <PortraitThumb
                          hero={hero}
                          fallbackText={lord.name}
                          bannerColor={lord.bannerColor || factionInfo.color}
                          factionGlyph={factionInfo.glyph}
                          size="lg"
                        />
                        <span className="absolute top-1 left-1 rounded bg-black/80 px-1 py-0.5 font-mono-tabular text-[10px] font-bold text-[#fde68a]">
                          {troops}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleSelectLord(lord.id)}
                          title="Seçimi kaldır"
                          className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#fbbf24]/60 bg-black/85 text-[9px] font-bold text-[#fde68a]"
                        >
                          ✕
                        </button>
                        <div className="truncate bg-[#172617]/95 px-1.5 py-1 text-center text-[10px] font-semibold text-[#86efac]">
                          {lord.name}
                        </div>
                      </div>
                      <div className="mt-1 text-center text-[10px] leading-tight text-[#fde68a]">
                        <div>Çağrılacak</div>
                        <div className="font-mono-tabular font-bold text-[#fbbf24]">
                          {cost} ★
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Harekât Hedefi Seçimi + Orduyu Dağıt (Disband Army) */}
            <div className="mt-4 space-y-3 border-t border-[#c6a15b]/30 pt-3">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#a89b84]">
                  Ordu Harekât & Kuşatma Hedefi
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetSettlementId('');
                      if (playerArmy) onSelectTargetSettlement(undefined);
                    }}
                    className={`rounded border px-2.5 py-1 text-[11px] font-semibold ${
                      !targetSettlementId
                        ? 'border-[#fbbf24] bg-[#3b2612] text-[#fde68a]'
                        : 'border-[#c6a15b]/35 bg-[#1b140e] text-[#c7baa5]'
                    }`}
                  >
                    Serbest Yürüyüş
                  </button>
                  {targetableSettlements.slice(0, 4).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setTargetSettlementId(s.id);
                        if (playerArmy) onSelectTargetSettlement(s.id);
                      }}
                      className={`rounded border px-2.5 py-1 text-[11px] font-semibold ${
                        targetSettlementId === s.id
                          ? 'border-[#fbbf24] bg-[#3b2612] text-[#fde68a]'
                          : 'border-[#c6a15b]/35 bg-[#1b140e] text-[#c7baa5]'
                      }`}
                    >
                      {s.name} ({s.garrison})
                    </button>
                  ))}
                </div>
              </div>

              {playerArmy && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    data-testid="army-disband-btn"
                    onClick={onDisbandArmy}
                    className="rounded-t-lg border-2 border-[#ef4444]/65 bg-gradient-to-b from-[#3b1616] to-[#220d0d] px-6 py-2 text-xs font-bold uppercase tracking-wider text-[#fca5a5] shadow hover:border-[#f87171] hover:text-white"
                  >
                    Orduyu Dağıt (Disband Army)
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Alt Bar: Toplam Maliyet (Total Cost) + Toplam Güç (Strength) + İptal / Onayla (Done) */}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[#c6a15b]/45 bg-gradient-to-t from-[#120e0a] to-[#211912] px-6 py-3">
          <div className="text-xs text-[#b8a992]">
            Ordu Erzağı: <span className="font-mono-tabular font-bold text-[#fde68a]">{campaign.food}</span> ·
            Aç kalan birliklere erzak paylaşımı günlük <span className="font-bold text-[#86efac]">+2 ★ Nüfuz</span> kazandırır
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#c6a15b]">
                Toplam Maliyet (Total Cost)
              </div>
              <div
                className={`font-mono-tabular text-base font-extrabold ${
                  canAffordCall ? 'text-[#fbbf24]' : 'text-[#ef4444]'
                }`}
              >
                {totalCallCost} / {playerInfluence} ★
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#c6a15b]">
                Toplam Güç (Strength)
              </div>
              <div className="font-mono-tabular text-base font-extrabold text-[#fde68a]">
                {previewStrength}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-[#c6a15b]/50 bg-[#261d14] px-5 py-2 text-xs font-bold uppercase tracking-wider text-[#e5d8c1] hover:border-[#fbbf24] hover:text-white"
            >
              İptal (Cancel)
            </button>
            <button
              type="button"
              data-testid="army-confirm-call-btn"
              disabled={!canConfirmCall}
              onClick={() => {
                onCreateOrExpandArmy(selectedIds, targetSettlementId || undefined);
                setSelectedIds([]);
              }}
              className={`rounded border-2 px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                canConfirmCall
                  ? 'border-[#4ade80] bg-gradient-to-b from-[#1e4620] to-[#132e15] text-[#dcfce7] shadow-[0_0_20px_rgba(74,222,128,0.25)] hover:border-[#86efac]'
                  : 'cursor-not-allowed border-[#c6a15b]/20 bg-[#1a140f] text-[#6e6253] opacity-55'
              }`}
            >
              {playerArmy
                ? `Onayla (+${selectedIds.length} Birlik · ★ ${totalCallCost})`
                : `Orduyu Kur (${selectedIds.length} Birlik · ★ ${totalCallCost})`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

/**
 * Harita ekranının sağ alt köşesinde (Bannerlord `scre-1.jpg` düzeni)
 * aktif ordunun Uyum (Cohesion) çubuğunu, toplam erzağını, asker sayısını
 * ve hızlı `+10 Uyum` butonunu gösteren kompakt HUD bileşeni.
 */
export const ArmyCohesionHudWidget: React.FC<{
  campaign: CampaignState;
  onOpenArmyModal: () => void;
  onQuickBoostCohesion: () => void;
}> = ({ campaign, onOpenArmyModal, onQuickBoostCohesion }) => {
  const playerArmy = useMemo(() => getPlayerArmy(campaign), [campaign]);

  const breakdown = useMemo(
    () => (playerArmy ? getArmyCohesionBreakdown(playerArmy, campaign) : null),
    [playerArmy, campaign],
  );
  const totalTroops = useMemo(
    () => (playerArmy ? getArmyTotalTroops(playerArmy, campaign) : 0),
    [playerArmy, campaign],
  );

  if (!playerArmy || !breakdown) return null;

  const boostCost = calculateCohesionBoostCost(playerArmy, campaign);
  const canBoost = (campaign.influence ?? 0) >= boostCost && playerArmy.cohesion < 100;

  return (
    <div
      data-testid="army-hud-widget"
      className="pointer-events-auto flex items-center gap-3 rounded-lg border-2 border-[#c6a15b]/80 bg-[#14100c]/95 px-3.5 py-2 text-[#f4ecd8] shadow-[0_8px_30px_rgba(0,0,0,0.9)]"
    >
      <button
        type="button"
        onClick={onOpenArmyModal}
        className="flex items-center gap-2.5 text-left hover:opacity-95"
        title={`Uyum: ${Math.round(playerArmy.cohesion)}/100 (Beklenen değişim: ${breakdown.totalDailyChange}/gün)`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded border border-[#fbbf24]/60 bg-[#2a1d11] font-display text-[10px] font-bold text-[#fbbf24]">
          ORDU
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#fde68a]">{playerArmy.name}</span>
            <span className="rounded bg-[#261c14] px-1.5 py-0.5 font-mono-tabular text-[10px] text-[#d6c8b0]">
              Erzak {campaign.food} · {totalTroops} Asker
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 w-28 overflow-hidden rounded-sm border border-[#c6a15b]/35 bg-black/75">
              <div
                className={`h-full transition-all ${
                  playerArmy.cohesion > 50
                    ? 'bg-gradient-to-r from-[#b45309] to-[#fbbf24]'
                    : playerArmy.cohesion > 25
                      ? 'bg-[#f97316]'
                      : 'bg-[#ef4444]'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, playerArmy.cohesion))}%` }}
              />
            </div>
            <span className="font-mono-tabular text-[10px] font-bold text-[#fbbf24]">
              Uyum {Math.round(playerArmy.cohesion)} ({breakdown.totalDailyChange}/g)
            </span>
          </div>
        </div>
      </button>

      <button
        type="button"
        disabled={!canBoost}
        onClick={onQuickBoostCohesion}
        title={`+10 Uyum Artır (★ ${boostCost} Nüfuz)`}
        className={`rounded border px-2.5 py-1 text-[10px] font-bold transition-all ${
          canBoost
            ? 'border-[#d97706] bg-[#2e1c0f] text-[#fde68a] hover:border-[#fbbf24]'
            : 'cursor-not-allowed border-[#c6a15b]/20 bg-[#1a140f] text-[#6e6253] opacity-50'
        }`}
      >
        +10 ★{boostCost}
      </button>
    </div>
  );
};
